//! Получение текстов песен из LRCLIB (бесплатно, без ключей) + парсер LRC.

use crate::error::Result;
use once_cell::sync::Lazy;
use regex::Regex;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

const LRCLIB: &str = "https://lrclib.net/api";

static RE_NOISE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)\s*[\(\[]\s*(official\s*(music\s*)?video|official\s*audio|lyrics?|lyric\s*video|visualizer|audio|hd|hq|4k|free\s*download|prod\.?[^\)\]]*|remaster(ed)?[^\)\]]*)\s*[\)\]]",
    )
    .unwrap()
});
static RE_TIME: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]").unwrap());

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricLine {
    pub time: i64, // ms
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Lyrics {
    pub track_id: i64,
    pub synced: Vec<LyricLine>,
    pub plain: Option<String>,
    pub source: String,
    pub matched_artist: Option<String>,
    pub matched_title: Option<String>,
    pub instrumental: bool,
}

impl Lyrics {
    pub fn empty(track_id: i64) -> Self {
        Self {
            track_id,
            synced: vec![],
            plain: None,
            source: "none".into(),
            matched_artist: None,
            matched_title: None,
            instrumental: false,
        }
    }
}

pub struct LyricsClient {
    http: Client,
}

impl LyricsClient {
    pub fn new() -> Self {
        Self {
            http: Client::builder()
                .timeout(Duration::from_secs(15))
                .user_agent("Horeum/1.0 (https://github.com/riverias/Horeum)")
                .build()
                .expect("http client"),
        }
    }

    pub async fn fetch(
        &self,
        track_id: i64,
        artist: &str,
        title: &str,
        duration_sec: i64,
    ) -> Result<Lyrics> {
        let (a, t) = split_artist_title(artist, title);

        // 1) точное совпадение с длительностью
        let exact = format!(
            "{LRCLIB}/get?artist_name={}&track_name={}&duration={}",
            urlencoding::encode(&a),
            urlencoding::encode(&t),
            duration_sec.max(0)
        );
        if let Ok(resp) = self.http.get(&exact).send().await {
            if resp.status().is_success() {
                if let Ok(v) = resp.json::<Value>().await {
                    if let Some(l) = from_lrclib(track_id, &v, "lrclib:get") {
                        return Ok(l);
                    }
                }
            }
        }

        // 2) поиск с выбором лучшего кандидата по близости длительности
        let search = format!(
            "{LRCLIB}/search?artist_name={}&track_name={}",
            urlencoding::encode(&a),
            urlencoding::encode(&t)
        );
        if let Some(l) = self.search_best(track_id, &search, duration_sec).await {
            return Ok(l);
        }

        // 3) широкий поиск одной строкой
        let broad = format!("{LRCLIB}/search?q={}", urlencoding::encode(&format!("{a} {t}")));
        if let Some(l) = self.search_best(track_id, &broad, duration_sec).await {
            return Ok(l);
        }

        Ok(Lyrics::empty(track_id))
    }

    async fn search_best(&self, track_id: i64, url: &str, duration_sec: i64) -> Option<Lyrics> {
        let resp = self.http.get(url).send().await.ok()?;
        if !resp.status().is_success() {
            return None;
        }
        let arr = resp.json::<Vec<Value>>().await.ok()?;
        let mut best: Option<(i64, &Value)> = None;
        for item in &arr {
            let has_lyrics = item
                .get("syncedLyrics")
                .and_then(|v| v.as_str())
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false)
                || item
                    .get("plainLyrics")
                    .and_then(|v| v.as_str())
                    .map(|s| !s.trim().is_empty())
                    .unwrap_or(false);
            if !has_lyrics {
                continue;
            }
            let dur = item
                .get("duration")
                .and_then(|d| d.as_f64())
                .unwrap_or(0.0) as i64;
            let mut delta = (dur - duration_sec).abs();
            // синхронизированные тексты предпочтительнее
            if item
                .get("syncedLyrics")
                .and_then(|v| v.as_str())
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false)
            {
                delta -= 15;
            }
            if best.map(|(d, _)| delta < d).unwrap_or(true) {
                best = Some((delta, item));
            }
        }
        let (_, item) = best?;
        from_lrclib(track_id, item, "lrclib:search")
    }
}

impl Default for LyricsClient {
    fn default() -> Self {
        Self::new()
    }
}

fn from_lrclib(track_id: i64, v: &Value, source: &str) -> Option<Lyrics> {
    let instrumental = v
        .get("instrumental")
        .and_then(|i| i.as_bool())
        .unwrap_or(false);
    let synced_raw = v.get("syncedLyrics").and_then(|s| s.as_str()).unwrap_or("");
    let plain = v
        .get("plainLyrics")
        .and_then(|s| s.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(String::from);
    let synced = parse_lrc(synced_raw);

    if synced.is_empty() && plain.is_none() && !instrumental {
        return None;
    }

    Some(Lyrics {
        track_id,
        synced,
        plain,
        source: source.to_string(),
        matched_artist: v
            .get("artistName")
            .and_then(|s| s.as_str())
            .map(String::from),
        matched_title: v
            .get("trackName")
            .and_then(|s| s.as_str())
            .map(String::from),
        instrumental,
    })
}

/// Парсинг LRC-разметки в список строк с таймкодами (поддерживает мульти-тайминги).
pub fn parse_lrc(raw: &str) -> Vec<LyricLine> {
    let mut out: Vec<LyricLine> = Vec::new();
    for line in raw.lines() {
        let stamps: Vec<i64> = RE_TIME
            .captures_iter(line)
            .map(|c| {
                let m: i64 = c[1].parse().unwrap_or(0);
                let s: i64 = c[2].parse().unwrap_or(0);
                let frac = c
                    .get(3)
                    .map(|f| {
                        let txt = f.as_str();
                        let val: i64 = txt.parse().unwrap_or(0);
                        match txt.len() {
                            1 => val * 100,
                            2 => val * 10,
                            _ => val,
                        }
                    })
                    .unwrap_or(0);
                m * 60_000 + s * 1000 + frac
            })
            .collect();
        if stamps.is_empty() {
            continue;
        }
        let text = RE_TIME.replace_all(line, "").trim().to_string();
        for time in stamps {
            out.push(LyricLine {
                time,
                text: text.clone(),
            });
        }
    }
    out.sort_by_key(|l| l.time);
    out
}

/// SoundCloud часто кладёт «Артист - Название» в тайтл, а в user — ник залившего.
pub fn split_artist_title(artist: &str, title: &str) -> (String, String) {
    const SEPARATORS: [&str; 4] = [" - ", " \u{2013} ", " \u{2014} ", " | "];
    let clean_title = RE_NOISE.replace_all(title, "").trim().to_string();
    for sep in SEPARATORS {
        if let Some((left, right)) = clean_title.split_once(sep) {
            if !left.trim().is_empty() && !right.trim().is_empty() {
                return (left.trim().to_string(), right.trim().to_string());
            }
        }
    }
    (
        RE_NOISE.replace_all(artist, "").trim().to_string(),
        clean_title,
    )
}
