//! YouTube как второй источник звука — через публичные API Piped и Invidious.
//!
//! Идентификаторы: SoundCloud всегда даёт положительные id, поэтому
//! трекам с YouTube мы выдаём стабильный ОТРИЦАТЕЛЬНЫЙ id (FNV-хеш videoId).
//! Фронтенд по знаку id понимает, какой источник спрашивать за потоком.

use crate::error::{HoreumError, Result};
use crate::models::{StreamInfo, Track};
use crate::util::{err, CLIENT};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const PIPED: [&str; 6] = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.adminforge.de",
    "https://api.piped.private.coffee",
    "https://pipedapi.reallyaweso.me",
    "https://pipedapi.leptons.xyz",
    "https://pipedapi.drgns.space",
];

const INVIDIOUS: [&str; 4] = [
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://yewtu.be",
    "https://invidious.f5.si",
];

static MAP: Lazy<Mutex<HashMap<i64, String>>> = Lazy::new(|| Mutex::new(HashMap::new()));

/// Стабильный отрицательный id для videoId.
pub fn track_id(video_id: &str) -> i64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in video_id.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100_0000_01b3);
    }
    let magnitude = (h % 8_000_000_000_000) + 1_000_000_000;
    -(magnitude as i64)
}

pub fn is_youtube(id: i64) -> bool {
    id < 0
}

fn store_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app.path().app_data_dir().map_err(err)?;
    std::fs::create_dir_all(&dir).map_err(err)?;
    Ok(dir.join("youtube-ids.json"))
}

/// Восстанавливает карту id -> videoId при старте приложения.
pub fn load(app: &AppHandle) {
    let Ok(path) = store_path(app) else { return };
    if !path.exists() {
        return;
    }
    if let Ok(raw) = std::fs::read_to_string(&path) {
        if let Ok(saved) = serde_json::from_str::<HashMap<String, String>>(&raw) {
            let mut map = MAP.lock();
            for (k, v) in saved {
                if let Ok(id) = k.parse::<i64>() {
                    map.insert(id, v);
                }
            }
        }
    }
}

fn persist(app: &AppHandle) {
    let Ok(path) = store_path(app) else { return };
    let snapshot: HashMap<String, String> = {
        let map = MAP.lock();
        map.iter().map(|(k, v)| (k.to_string(), v.clone())).collect()
    };
    if let Ok(raw) = serde_json::to_string(&snapshot) {
        let _ = std::fs::write(path, raw);
    }
}

fn remember(id: i64, video_id: &str) {
    let mut map = MAP.lock();
    map.insert(id, video_id.to_string());
}

pub fn video_of(id: i64) -> Option<String> {
    MAP.lock().get(&id).cloned()
}

fn video_id_from_url(url: &str) -> Option<String> {
    if let Some(idx) = url.find("v=") {
        let rest = &url[idx + 2..];
        let vid: String = rest
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
            .collect();
        if !vid.is_empty() {
            return Some(vid);
        }
    }
    if let Some((_, tail)) = url.rsplit_once('/') {
        let vid: String = tail
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
            .collect();
        if vid.len() >= 8 {
            return Some(vid);
        }
    }
    None
}

fn piped_track(item: &Value) -> Option<Track> {
    let url = item.get("url").and_then(|u| u.as_str()).unwrap_or_default();
    let video_id = video_id_from_url(url)?;
    let title = item.get("title").and_then(|t| t.as_str())?.to_string();
    let seconds = item.get("duration").and_then(|d| d.as_i64()).unwrap_or(0);
    if seconds <= 0 {
        return None;
    }
    let id = track_id(&video_id);
    remember(id, &video_id);
    Some(Track {
        id,
        title,
        artist: item
            .get("uploaderName")
            .and_then(|u| u.as_str())
            .unwrap_or("YouTube")
            .to_string(),
        artist_id: 0,
        artist_avatar: item
            .get("uploaderAvatar")
            .and_then(|u| u.as_str())
            .map(String::from),
        duration: seconds * 1000,
        artwork: item
            .get("thumbnail")
            .and_then(|t| t.as_str())
            .map(String::from),
        permalink_url: format!("https://www.youtube.com/watch?v={}", video_id),
        genre: Some("YouTube".into()),
        tags: vec!["youtube".into()],
        playback_count: item.get("views").and_then(|v| v.as_i64()).unwrap_or(0),
        streamable: true,
        has_transcodings: true,
        ..Default::default()
    })
}

fn invidious_track(item: &Value) -> Option<Track> {
    let video_id = item.get("videoId").and_then(|v| v.as_str())?.to_string();
    let title = item.get("title").and_then(|t| t.as_str())?.to_string();
    let seconds = item
        .get("lengthSeconds")
        .and_then(|d| d.as_i64())
        .unwrap_or(0);
    if seconds <= 0 {
        return None;
    }
    let id = track_id(&video_id);
    remember(id, &video_id);
    Some(Track {
        id,
        title,
        artist: item
            .get("author")
            .and_then(|a| a.as_str())
            .unwrap_or("YouTube")
            .to_string(),
        artist_id: 0,
        artist_avatar: None,
        duration: seconds * 1000,
        artwork: item
            .pointer("/videoThumbnails/0/url")
            .and_then(|t| t.as_str())
            .map(String::from)
            .or_else(|| Some(format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", video_id))),
        permalink_url: format!("https://www.youtube.com/watch?v={}", video_id),
        genre: Some("YouTube".into()),
        tags: vec!["youtube".into()],
        playback_count: item.get("viewCount").and_then(|v| v.as_i64()).unwrap_or(0),
        streamable: true,
        has_transcodings: true,
        ..Default::default()
    })
}

/// Поиск по YouTube (музыкальные результаты в приоритете).
pub async fn search(app: &AppHandle, query: &str, limit: usize) -> Result<Vec<Track>> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let encoded = urlencoding::encode(query).to_string();

    for host in PIPED {
        let url = format!("{}/search?q={}&filter=music_songs", host, encoded);
        let Ok(res) = CLIENT.get(&url).send().await else {
            continue;
        };
        if !res.status().is_success() {
            continue;
        }
        let Ok(value) = res.json::<Value>().await else {
            continue;
        };
        let items = value
            .get("items")
            .and_then(|i| i.as_array())
            .cloned()
            .unwrap_or_default();
        let tracks: Vec<Track> = items.iter().filter_map(piped_track).take(limit).collect();
        if !tracks.is_empty() {
            persist(app);
            return Ok(tracks);
        }
    }

    for host in INVIDIOUS {
        let url = format!("{}/api/v1/search?q={}&type=video", host, encoded);
        let Ok(res) = CLIENT.get(&url).send().await else {
            continue;
        };
        if !res.status().is_success() {
            continue;
        }
        let Ok(value) = res.json::<Value>().await else {
            continue;
        };
        let items = value.as_array().cloned().unwrap_or_default();
        let tracks: Vec<Track> = items.iter().filter_map(invidious_track).take(limit).collect();
        if !tracks.is_empty() {
            persist(app);
            return Ok(tracks);
        }
    }

    Err(HoreumError::Other(
        "YouTube сейчас недоступен: публичные зеркала не ответили".into(),
    ))
}

/// Ссылка на аудиопоток для трека с YouTube.
pub async fn stream(id: i64) -> Result<StreamInfo> {
    let video_id = video_of(id).ok_or_else(|| {
        HoreumError::NotFound("трек YouTube не найден в кэше, повторите поиск".into())
    })?;

    for host in PIPED {
        let url = format!("{}/streams/{}", host, video_id);
        let Ok(res) = CLIENT.get(&url).send().await else {
            continue;
        };
        if !res.status().is_success() {
            continue;
        }
        let Ok(value) = res.json::<Value>().await else {
            continue;
        };
        let streams = value
            .get("audioStreams")
            .and_then(|a| a.as_array())
            .cloned()
            .unwrap_or_default();
        let best = streams
            .iter()
            .filter(|s| {
                s.get("url").and_then(|u| u.as_str()).is_some()
                    && s.get("mimeType")
                        .and_then(|m| m.as_str())
                        .map(|m| m.contains("audio"))
                        .unwrap_or(true)
            })
            .max_by_key(|s| s.get("bitrate").and_then(|b| b.as_i64()).unwrap_or(0));
        if let Some(best) = best {
            let bitrate = best.get("bitrate").and_then(|b| b.as_i64()).unwrap_or(0);
            return Ok(StreamInfo {
                url: best
                    .get("url")
                    .and_then(|u| u.as_str())
                    .unwrap_or_default()
                    .to_string(),
                protocol: "progressive".into(),
                mime_type: best
                    .get("mimeType")
                    .and_then(|m| m.as_str())
                    .unwrap_or("audio/mp4")
                    .to_string(),
                preset: format!("youtube_{}k", bitrate / 1000),
                quality: best
                    .get("quality")
                    .and_then(|q| q.as_str())
                    .unwrap_or("hq")
                    .to_string(),
            });
        }
    }

    for host in INVIDIOUS {
        let url = format!("{}/api/v1/videos/{}", host, video_id);
        let Ok(res) = CLIENT.get(&url).send().await else {
            continue;
        };
        if !res.status().is_success() {
            continue;
        }
        let Ok(value) = res.json::<Value>().await else {
            continue;
        };
        let formats = value
            .get("adaptiveFormats")
            .and_then(|a| a.as_array())
            .cloned()
            .unwrap_or_default();
        let best = formats
            .iter()
            .filter(|f| {
                f.get("type")
                    .and_then(|t| t.as_str())
                    .map(|t| t.starts_with("audio"))
                    .unwrap_or(false)
            })
            .max_by_key(|f| {
                f.get("bitrate")
                    .and_then(|b| b.as_str())
                    .and_then(|b| b.parse::<i64>().ok())
                    .or_else(|| f.get("bitrate").and_then(|b| b.as_i64()))
                    .unwrap_or(0)
            });
        if let Some(best) = best {
            return Ok(StreamInfo {
                url: best
                    .get("url")
                    .and_then(|u| u.as_str())
                    .unwrap_or_default()
                    .to_string(),
                protocol: "progressive".into(),
                mime_type: best
                    .get("type")
                    .and_then(|t| t.as_str())
                    .unwrap_or("audio/mp4")
                    .to_string(),
                preset: "youtube".into(),
                quality: "hq".into(),
            });
        }
    }

    Err(HoreumError::Other(
        "не удалось получить аудиопоток YouTube".into(),
    ))
}

/// Похожие треки для волны, когда играет трек с YouTube.
pub async fn related(app: &AppHandle, id: i64, limit: usize) -> Result<Vec<Track>> {
    let Some(video_id) = video_of(id) else {
        return Ok(Vec::new());
    };
    for host in PIPED {
        let url = format!("{}/streams/{}", host, video_id);
        let Ok(res) = CLIENT.get(&url).send().await else {
            continue;
        };
        let Ok(value) = res.json::<Value>().await else {
            continue;
        };
        let items = value
            .get("relatedStreams")
            .and_then(|r| r.as_array())
            .cloned()
            .unwrap_or_default();
        let tracks: Vec<Track> = items.iter().filter_map(piped_track).take(limit).collect();
        if !tracks.is_empty() {
            persist(app);
            return Ok(tracks);
        }
    }
    Ok(Vec::new())
}
