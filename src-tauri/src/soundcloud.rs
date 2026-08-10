//! SoundCloud API v2 client.
//!
//! * автоматическая добыча `client_id` со страницы soundcloud.com
//! * авто-обновление при 401
//! * опциональный OAuth-токен пользователя (лайки / плейлисты / лента)

use crate::error::{HoreumError, Result};
use crate::models::{ScPlaylist, ScUser, StreamInfo, Track};
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use rand::seq::SliceRandom;
use regex::Regex;
use reqwest::{Client, Method, StatusCode};
use serde_json::Value;
use std::time::Duration;

pub const API: &str = "https://api-v2.soundcloud.com";

const UA_POOL: [&str; 4] = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 YaBrowser/24.4.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
];

static RE_SCRIPTS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"https://a-v2\.sndcdn\.com/assets/[a-zA-Z0-9._-]+\.js"#).unwrap()
});
static RE_CLIENT_ID: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"client_id\s*:\s*"([a-zA-Z0-9_-]{20,})""#).unwrap());

/// Жанры чартов SoundCloud.
pub const GENRES: [(&str, &str); 22] = [
    ("all-music", "Всё"),
    ("alternativerock", "Alternative Rock"),
    ("ambient", "Ambient"),
    ("classical", "Classical"),
    ("country", "Country"),
    ("danceedm", "Dance & EDM"),
    ("dancehall", "Dancehall"),
    ("deephouse", "Deep House"),
    ("disco", "Disco"),
    ("drumbass", "Drum & Bass"),
    ("dubstep", "Dubstep"),
    ("electronic", "Electronic"),
    ("hiphoprap", "Hip-hop & Rap"),
    ("house", "House"),
    ("indie", "Indie"),
    ("jazzblues", "Jazz & Blues"),
    ("metal", "Metal"),
    ("piano", "Piano"),
    ("pop", "Pop"),
    ("rbsoul", "R&B & Soul"),
    ("techno", "Techno"),
    ("trap", "Trap"),
];

pub struct SoundCloud {
    http: Client,
    client_id: RwLock<Option<String>>,
    oauth: RwLock<Option<String>>,
}

impl SoundCloud {
    pub fn new() -> Self {
        let http = Client::builder()
            .timeout(Duration::from_secs(25))
            .connect_timeout(Duration::from_secs(10))
            .user_agent(UA_POOL[0])
            .build()
            .expect("failed to build http client");
        Self {
            http,
            client_id: RwLock::new(None),
            oauth: RwLock::new(None),
        }
    }

    fn ua() -> &'static str {
        let mut rng = rand::thread_rng();
        UA_POOL.choose(&mut rng).copied().unwrap_or(UA_POOL[0])
    }

    pub fn set_oauth(&self, token: Option<String>) {
        *self.oauth.write() = token.filter(|t| !t.trim().is_empty());
    }

    pub fn oauth(&self) -> Option<String> {
        self.oauth.read().clone()
    }

    pub fn is_logged_in(&self) -> bool {
        self.oauth.read().is_some()
    }

    pub fn current_client_id(&self) -> Option<String> {
        self.client_id.read().clone()
    }

    /// Скрейпим актуальный client_id из JS-бандлов SoundCloud.
    pub async fn refresh_client_id(&self) -> Result<String> {
        let ua = Self::ua();
        let html = self
            .http
            .get("https://soundcloud.com/discover")
            .header("User-Agent", ua)
            .header("Accept-Language", "en-US,en;q=0.9")
            .send()
            .await?
            .text()
            .await?;

        let mut scripts: Vec<String> = RE_SCRIPTS
            .find_iter(&html)
            .map(|m| m.as_str().to_string())
            .collect();
        scripts.dedup();
        if scripts.is_empty() {
            return Err(HoreumError::SoundCloud(
                "не найдены JS-бандлы на странице SoundCloud".into(),
            ));
        }
        // Последние бандлы чаще всего содержат client_id — идём с конца.
        for url in scripts.iter().rev() {
            let body = match self
                .http
                .get(url)
                .header("User-Agent", ua)
                .send()
                .await
            {
                Ok(r) => r.text().await.unwrap_or_default(),
                Err(_) => continue,
            };
            if let Some(c) = RE_CLIENT_ID.captures(&body) {
                let id = c[1].to_string();
                *self.client_id.write() = Some(id.clone());
                return Ok(id);
            }
        }
        Err(HoreumError::SoundCloud(
            "client_id не найден ни в одном из скриптов".into(),
        ))
    }

    async fn ensure_client_id(&self) -> Result<String> {
        if let Some(id) = self.current_client_id() {
            return Ok(id);
        }
        self.refresh_client_id().await
    }

    fn with_client_id(url: &str, client_id: &str) -> String {
        let sep = if url.contains('?') { '&' } else { '?' };
        format!("{url}{sep}client_id={client_id}")
    }

    /// GET к API с авто-переполучением client_id при 401/403.
    pub async fn get(&self, url: &str) -> Result<Value> {
        self.request(Method::GET, url).await
    }

    pub async fn request(&self, method: Method, url: &str) -> Result<Value> {
        let mut last_err: Option<HoreumError> = None;
        for attempt in 0..2u8 {
            let cid = self.ensure_client_id().await?;
            let full = Self::with_client_id(url, &cid);
            let mut req = self
                .http
                .request(method.clone(), &full)
                .header("User-Agent", Self::ua())
                .header("Accept", "application/json, text/javascript, */*; q=0.1")
                .header("Origin", "https://soundcloud.com")
                .header("Referer", "https://soundcloud.com/");
            if let Some(token) = self.oauth() {
                req = req.header("Authorization", format!("OAuth {token}"));
            }

            let resp = req.send().await?;
            let status = resp.status();

            if (status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN)
                && attempt == 0
            {
                // client_id протух — тянем новый и повторяем
                *self.client_id.write() = None;
                self.refresh_client_id().await.ok();
                last_err = Some(HoreumError::SoundCloud(format!(
                    "статус {status}, обновляю client_id"
                )));
                continue;
            }

            if status == StatusCode::NOT_FOUND {
                return Err(HoreumError::NotFound(url.to_string()));
            }

            if !status.is_success() {
                let body = resp.text().await.unwrap_or_default();
                let short: String = body.chars().take(240).collect();
                return Err(HoreumError::SoundCloud(format!(
                    "SoundCloud API {status}: {short}"
                )));
            }

            let text = resp.text().await?;
            if text.trim().is_empty() {
                return Ok(Value::Null);
            }
            return Ok(serde_json::from_str(&text)?);
        }
        Err(last_err.unwrap_or_else(|| HoreumError::SoundCloud("неизвестная ошибка".into())))
    }

    // ---------------------------------------------------------------- search

    pub async fn search_tracks(&self, query: &str, limit: u32, offset: u32) -> Result<Vec<Track>> {
        let url = format!(
            "{API}/search/tracks?q={}&limit={}&offset={}&linked_partitioning=1",
            urlencoding::encode(query),
            limit.min(200),
            offset
        );
        let data = self.get(&url).await?;
        Ok(collection_tracks(&data))
    }

    pub async fn search_playlists(&self, query: &str, limit: u32) -> Result<Vec<ScPlaylist>> {
        let url = format!(
            "{API}/search/playlists_without_albums?q={}&limit={}",
            urlencoding::encode(query),
            limit.min(50)
        );
        let data = self.get(&url).await?;
        Ok(data
            .get("collection")
            .and_then(|c| c.as_array())
            .map(|arr| arr.iter().filter_map(ScPlaylist::from_json).collect())
            .unwrap_or_default())
    }

    pub async fn search_users(&self, query: &str, limit: u32) -> Result<Vec<ScUser>> {
        let url = format!(
            "{API}/search/users?q={}&limit={}",
            urlencoding::encode(query),
            limit.min(50)
        );
        let data = self.get(&url).await?;
        Ok(data
            .get("collection")
            .and_then(|c| c.as_array())
            .map(|arr| arr.iter().filter_map(ScUser::from_json).collect())
            .unwrap_or_default())
    }

    /// Подсказки автодополнения.
    pub async fn autocomplete(&self, query: &str) -> Result<Vec<String>> {
        let url = format!(
            "{API}/search/queries?q={}&limit=10",
            urlencoding::encode(query)
        );
        let data = self.get(&url).await?;
        Ok(data
            .get("collection")
            .and_then(|c| c.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.get("query").and_then(|q| q.as_str()))
                    .map(String::from)
                    .collect()
            })
            .unwrap_or_default())
    }

    // ----------------------------------------------------------- collections

    pub async fn charts(&self, kind: &str, genre: &str, limit: u32) -> Result<Vec<Track>> {
        let kind = if kind == "trending" { "trending" } else { "top" };
        let url = format!(
            "{API}/charts?kind={kind}&genre=soundcloud%3Agenres%3A{genre}&limit={}&offset=0&linked_partitioning=1",
            limit.min(100)
        );
        let data = self.get(&url).await?;
        let tracks = data
            .get("collection")
            .and_then(|c| c.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| item.get("track").and_then(Track::from_json))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        Ok(tracks)
    }

    pub async fn track(&self, id: i64) -> Result<Value> {
        self.get(&format!("{API}/tracks/{id}")).await
    }

    pub async fn tracks_bulk(&self, ids: &[i64]) -> Result<Vec<Track>> {
        if ids.is_empty() {
            return Ok(vec![]);
        }
        let joined = ids
            .iter()
            .take(50)
            .map(|i| i.to_string())
            .collect::<Vec<_>>()
            .join(",");
        let data = self.get(&format!("{API}/tracks?ids={joined}")).await?;
        Ok(collection_tracks(&data))
    }

    pub async fn related(&self, id: i64, limit: u32) -> Result<Vec<Track>> {
        let data = self
            .get(&format!("{API}/tracks/{id}/related?limit={}", limit.min(50)))
            .await?;
        Ok(collection_tracks(&data))
    }

    pub async fn user(&self, id: i64) -> Result<ScUser> {
        let data = self.get(&format!("{API}/users/{id}")).await?;
        ScUser::from_json(&data)
            .ok_or_else(|| HoreumError::NotFound(format!("user {id}")))
    }

    pub async fn user_tracks(&self, id: i64, limit: u32) -> Result<Vec<Track>> {
        let data = self
            .get(&format!(
                "{API}/users/{id}/tracks?limit={}&offset=0&linked_partitioning=1",
                limit.min(100)
            ))
            .await?;
        Ok(collection_tracks(&data))
    }

    pub async fn user_likes(&self, id: i64, limit: u32) -> Result<Vec<Track>> {
        let data = self
            .get(&format!(
                "{API}/users/{id}/track_likes?limit={}&offset=0&linked_partitioning=1",
                limit.min(200)
            ))
            .await?;
        Ok(collection_tracks(&data))
    }

    pub async fn user_playlists(&self, id: i64, limit: u32) -> Result<Vec<ScPlaylist>> {
        let data = self
            .get(&format!(
                "{API}/users/{id}/playlists_without_albums?limit={}&linked_partitioning=1",
                limit.min(50)
            ))
            .await?;
        Ok(data
            .get("collection")
            .and_then(|c| c.as_array())
            .map(|arr| arr.iter().filter_map(ScPlaylist::from_json).collect())
            .unwrap_or_default())
    }

    pub async fn playlist(&self, id: i64) -> Result<ScPlaylist> {
        let data = self.get(&format!("{API}/playlists/{id}")).await?;
        let mut pl = ScPlaylist::from_json(&data)
            .ok_or_else(|| HoreumError::NotFound(format!("playlist {id}")))?;
        // В ответе часть треков приходит заглушками { id }, догружаем их пачками.
        let missing: Vec<i64> = data
            .get("tracks")
            .and_then(|t| t.as_array())
            .map(|arr| {
                arr.iter()
                    .filter(|t| t.get("title").is_none())
                    .filter_map(|t| t.get("id").and_then(|i| i.as_i64()))
                    .collect()
            })
            .unwrap_or_default();
        for chunk in missing.chunks(50) {
            if let Ok(more) = self.tracks_bulk(chunk).await {
                pl.tracks.extend(more);
            }
        }
        Ok(pl)
    }

    /// Резолв любой публичной ссылки soundcloud.com → сырой JSON.
    pub async fn resolve(&self, permalink: &str) -> Result<Value> {
        let url = format!(
            "{API}/resolve?url={}",
            urlencoding::encode(permalink.trim())
        );
        self.get(&url).await
    }

    // -------------------------------------------------------------- account

    pub async fn me(&self) -> Result<ScUser> {
        if !self.is_logged_in() {
            return Err(HoreumError::Auth("нужен OAuth-токен SoundCloud".into()));
        }
        let data = self.get(&format!("{API}/me")).await?;
        ScUser::from_json(&data).ok_or_else(|| HoreumError::Auth("неверный токен".into()))
    }

    pub async fn my_likes(&self, limit: u32) -> Result<Vec<Track>> {
        let me = self.me().await?;
        self.user_likes(me.id, limit).await
    }

    pub async fn my_playlists(&self, limit: u32) -> Result<Vec<ScPlaylist>> {
        let me = self.me().await?;
        self.user_playlists(me.id, limit).await
    }

    pub async fn my_stream(&self, limit: u32) -> Result<Vec<Track>> {
        if !self.is_logged_in() {
            return Err(HoreumError::Auth("нужен OAuth-токен SoundCloud".into()));
        }
        let data = self
            .get(&format!(
                "{API}/stream?limit={}&linked_partitioning=1",
                limit.min(100)
            ))
            .await?;
        let tracks = data
            .get("collection")
            .and_then(|c| c.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| {
                        item.get("track")
                            .or_else(|| item.get("playlist").and_then(|p| p.get("tracks")?.get(0)))
                            .and_then(Track::from_json)
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        Ok(tracks)
    }

    /// Лайк / снятие лайка в самом SoundCloud (требует токен).
    pub async fn set_remote_like(&self, track_id: i64, liked: bool) -> Result<()> {
        let me = self.me().await?;
        let url = format!("{API}/users/{}/track_likes/{}", me.id, track_id);
        let method = if liked { Method::PUT } else { Method::DELETE };
        self.request(method, &url).await?;
        Ok(())
    }

    // --------------------------------------------------------------- stream

    /// Получает реальный аудио-URL трека (progressive mp3 в приоритете, иначе HLS).
    pub async fn stream_url(&self, track_id: i64) -> Result<StreamInfo> {
        let track = self.track(track_id).await?;
        let transcodings = track
            .get("media")
            .and_then(|m| m.get("transcodings"))
            .and_then(|t| t.as_array())
            .cloned()
            .unwrap_or_default();

        if transcodings.is_empty() {
            return Err(HoreumError::SoundCloud(
                "у трека нет доступных потоков (возможно, GO+ или геоблок)".into(),
            ));
        }

        let score = |t: &Value| -> i32 {
            let protocol = t
                .get("format")
                .and_then(|f| f.get("protocol"))
                .and_then(|p| p.as_str())
                .unwrap_or("");
            let preset = t.get("preset").and_then(|p| p.as_str()).unwrap_or("");
            let quality = t.get("quality").and_then(|p| p.as_str()).unwrap_or("sq");
            let mut s = 0;
            if protocol == "progressive" {
                s += 100;
            }
            if quality == "hq" {
                s += 40;
            }
            if preset.starts_with("aac") || preset.starts_with("opus") {
                s += 10;
            }
            if preset.starts_with("mp3") {
                s += 20;
            }
            s
        };

        let mut sorted = transcodings.clone();
        sorted.sort_by_key(|t| -score(t));

        let mut last_error = String::new();
        for t in sorted {
            let Some(api_url) = t.get("url").and_then(|u| u.as_str()) else {
                continue;
            };
            let protocol = t
                .get("format")
                .and_then(|f| f.get("protocol"))
                .and_then(|p| p.as_str())
                .unwrap_or("progressive")
                .to_string();
            let mime_type = t
                .get("format")
                .and_then(|f| f.get("mime_type"))
                .and_then(|p| p.as_str())
                .unwrap_or("audio/mpeg")
                .to_string();
            match self.get(api_url).await {
                Ok(v) => {
                    if let Some(url) = v.get("url").and_then(|u| u.as_str()) {
                        return Ok(StreamInfo {
                            url: url.to_string(),
                            protocol,
                            mime_type,
                            preset: t
                                .get("preset")
                                .and_then(|p| p.as_str())
                                .unwrap_or("")
                                .to_string(),
                            quality: t
                                .get("quality")
                                .and_then(|p| p.as_str())
                                .unwrap_or("sq")
                                .to_string(),
                        });
                    }
                    last_error = "в ответе нет поля url".into();
                }
                Err(e) => last_error = e.to_string(),
            }
        }
        Err(HoreumError::SoundCloud(format!(
            "не удалось получить поток: {last_error}"
        )))
    }
}

impl Default for SoundCloud {
    fn default() -> Self {
        Self::new()
    }
}

/// Извлекает треки из любого формата ответа API (array / collection / tracks / data).
pub fn collection_tracks(data: &Value) -> Vec<Track> {
    let arr = if let Some(a) = data.as_array() {
        a.clone()
    } else if let Some(a) = data.get("collection").and_then(|c| c.as_array()) {
        a.clone()
    } else if let Some(a) = data.get("tracks").and_then(|c| c.as_array()) {
        a.clone()
    } else if let Some(a) = data.get("data").and_then(|c| c.as_array()) {
        a.clone()
    } else {
        vec![]
    };

    arr.iter()
        .filter_map(|v| {
            let node = if v.get("track").is_some() {
                v.get("track").unwrap()
            } else {
                v
            };
            Track::from_json(node)
        })
        .filter(|t| t.playable())
        .collect()
}
