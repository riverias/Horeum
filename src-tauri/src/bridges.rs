//! Мосты к другим сервисам: Spotify, Яндекс Музыка, Deezer, ВК и просто текст.
//!
//! Потоки у них защищены DRM/токенами, поэтому мы берём оттуда СПИСКИ
//! (артист + название), а звук подбираем в SoundCloud / YouTube. Так работает
//! перенос плейлистов из любого сервиса одной ссылкой.

use crate::error::{HoreumError, Result};
use crate::util::{err, CLIENT};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeTrack {
    pub artist: String,
    pub title: String,
    /// миллисекунды, 0 если неизвестно
    pub duration: i64,
    pub cover: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeList {
    pub name: String,
    /// spotify | yandex | deezer | text
    pub source: String,
    pub cover: Option<String>,
    pub tracks: Vec<BridgeTrack>,
}

pub async fn from_link(url: &str) -> Result<BridgeList> {
    let u = url.trim();
    if u.is_empty() {
        return Err(HoreumError::Other("пустая ссылка".into()));
    }
    let low = u.to_lowercase();
    if low.contains("spotify.com") || low.starts_with("spotify:") {
        spotify(u).await
    } else if low.contains("music.yandex") {
        yandex(u).await
    } else if low.contains("deezer.com") {
        deezer(u).await
    } else if low.contains("vk.com") || low.contains("vk.ru") || low.contains("vkmusic") {
        Err(HoreumError::Other(
            "ВК Музыка не отдаёт плейлисты без входа. Скопируйте список треков текстом и вставьте в поле «Импорт списком»".into(),
        ))
    } else {
        Err(HoreumError::Other(
            "Не узнаю сервис. Поддерживаются Spotify, Яндекс Музыка и Deezer".into(),
        ))
    }
}

// ─────────────────────────────── Spotify ─────────────────────────────

async fn spotify(url: &str) -> Result<BridgeList> {
    let re = Regex::new(r"(playlist|album|track)[/:]([A-Za-z0-9]{16,})").map_err(err)?;
    let caps = re
        .captures(url)
        .ok_or_else(|| HoreumError::Other("не нашёл id в ссылке Spotify".into()))?;
    let kind = caps[1].to_string();
    let id = caps[2].to_string();

    let embed = format!("https://open.spotify.com/embed/{}/{}", kind, id);
    let html = CLIENT
        .get(&embed)
        .header("Accept-Language", "ru,en;q=0.8")
        .send()
        .await?
        .text()
        .await?;

    let json_re = Regex::new(r#"<script id="__NEXT_DATA__" type="application/json">(.*?)</script>"#)
        .map_err(err)?;
    let raw = json_re
        .captures(&html)
        .map(|c| c[1].to_string())
        .ok_or_else(|| {
            HoreumError::Other("Spotify изменил разметку — не смог разобрать страницу".into())
        })?;
    let value: Value = serde_json::from_str(&raw)?;
    let entity = value
        .pointer("/props/pageProps/state/data/entity")
        .cloned()
        .unwrap_or(Value::Null);

    let name = entity
        .get("name")
        .or_else(|| entity.get("title"))
        .and_then(|n| n.as_str())
        .unwrap_or("Плейлист Spotify")
        .to_string();
    let cover = entity
        .pointer("/coverArt/sources/0/url")
        .and_then(|c| c.as_str())
        .map(String::from);

    let mut tracks = Vec::new();
    if let Some(list) = entity.get("trackList").and_then(|t| t.as_array()) {
        for item in list {
            let title = item
                .get("title")
                .and_then(|t| t.as_str())
                .unwrap_or_default()
                .to_string();
            if title.is_empty() {
                continue;
            }
            tracks.push(BridgeTrack {
                artist: item
                    .get("subtitle")
                    .and_then(|s| s.as_str())
                    .unwrap_or_default()
                    .to_string(),
                title,
                duration: item.get("duration").and_then(|d| d.as_i64()).unwrap_or(0),
                cover: cover.clone(),
            });
        }
    }

    if tracks.is_empty() {
        let pair = Regex::new(r#""title":"(.*?)","subtitle":"(.*?)""#).map_err(err)?;
        for cap in pair.captures_iter(&html) {
            tracks.push(BridgeTrack {
                artist: unescape(&cap[2]),
                title: unescape(&cap[1]),
                duration: 0,
                cover: cover.clone(),
            });
        }
    }

    if tracks.is_empty() {
        return Err(HoreumError::Other(
            "в ссылке Spotify не нашлось треков (плейлист может быть приватным)".into(),
        ));
    }

    Ok(BridgeList {
        name,
        source: "spotify".into(),
        cover,
        tracks,
    })
}

// ────────────────────────── Яндекс Музыка ──────────────────────────

async fn yandex(url: &str) -> Result<BridgeList> {
    let playlist_re = Regex::new(r"users/([^/?#]+)/playlists/(\d+)").map_err(err)?;
    let album_re = Regex::new(r"album/(\d+)").map_err(err)?;

    if let Some(caps) = playlist_re.captures(url) {
        let owner = caps[1].to_string();
        let kind = caps[2].to_string();
        let api = format!(
            "https://music.yandex.ru/handlers/playlist.jsx?owner={}&kinds={}&light=true&madeFor=&withLikesCount=false",
            urlencoding::encode(&owner),
            kind
        );
        let value: Value = CLIENT
            .get(&api)
            .header("Accept", "application/json")
            .header("X-Retpath-Y", url)
            .header("Referer", url)
            .send()
            .await?
            .json()
            .await?;
        let name = value
            .pointer("/playlist/title")
            .and_then(|t| t.as_str())
            .unwrap_or("Плейлист Яндекс Музыки")
            .to_string();
        let items = value
            .pointer("/playlist/tracks")
            .and_then(|t| t.as_array())
            .cloned()
            .unwrap_or_default();
        let tracks = items.iter().filter_map(yandex_track).collect::<Vec<_>>();
        if tracks.is_empty() {
            return Err(HoreumError::Other(
                "Яндекс Музыка не отдала треки (возможно, плейлист закрыт)".into(),
            ));
        }
        return Ok(BridgeList {
            name,
            source: "yandex".into(),
            cover: None,
            tracks,
        });
    }

    if let Some(caps) = album_re.captures(url) {
        let album = caps[1].to_string();
        let api = format!("https://music.yandex.ru/handlers/album.jsx?album={}", album);
        let value: Value = CLIENT
            .get(&api)
            .header("Accept", "application/json")
            .header("X-Retpath-Y", url)
            .header("Referer", url)
            .send()
            .await?
            .json()
            .await?;
        let name = value
            .get("title")
            .and_then(|t| t.as_str())
            .unwrap_or("Альбом Яндекс Музыки")
            .to_string();
        let mut tracks = Vec::new();
        if let Some(volumes) = value.get("volumes").and_then(|v| v.as_array()) {
            for volume in volumes {
                if let Some(list) = volume.as_array() {
                    tracks.extend(list.iter().filter_map(yandex_track));
                }
            }
        }
        if tracks.is_empty() {
            return Err(HoreumError::Other("в альбоме не нашлось треков".into()));
        }
        return Ok(BridgeList {
            name,
            source: "yandex".into(),
            cover: None,
            tracks,
        });
    }

    Err(HoreumError::Other(
        "поддерживаются ссылки вида music.yandex.ru/users/.../playlists/... или /album/...".into(),
    ))
}

fn yandex_track(item: &Value) -> Option<BridgeTrack> {
    let title = item.get("title").and_then(|t| t.as_str())?.to_string();
    let artist = item
        .get("artists")
        .and_then(|a| a.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|a| a.get("name").and_then(|n| n.as_str()))
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default();
    Some(BridgeTrack {
        artist,
        title,
        duration: item
            .get("durationMs")
            .and_then(|d| d.as_i64())
            .unwrap_or(0),
        cover: item
            .pointer("/albums/0/coverUri")
            .and_then(|c| c.as_str())
            .map(|c| format!("https://{}", c.replace("%%", "400x400"))),
    })
}

// ────────────────────────────── Deezer ──────────────────────────────

async fn deezer(url: &str) -> Result<BridgeList> {
    let re = Regex::new(r"(playlist|album)/(\d+)").map_err(err)?;
    let caps = re
        .captures(url)
        .ok_or_else(|| HoreumError::Other("не нашёл id в ссылке Deezer".into()))?;
    let api = format!("https://api.deezer.com/{}/{}", &caps[1], &caps[2]);
    let value: Value = CLIENT.get(&api).send().await?.json().await?;
    let name = value
        .get("title")
        .and_then(|t| t.as_str())
        .unwrap_or("Плейлист Deezer")
        .to_string();
    let cover = value
        .get("picture_xl")
        .or_else(|| value.get("cover_xl"))
        .and_then(|c| c.as_str())
        .map(String::from);
    let items = value
        .pointer("/tracks/data")
        .and_then(|t| t.as_array())
        .cloned()
        .unwrap_or_default();
    let tracks: Vec<BridgeTrack> = items
        .iter()
        .filter_map(|item| {
            Some(BridgeTrack {
                artist: item
                    .pointer("/artist/name")
                    .and_then(|a| a.as_str())
                    .unwrap_or_default()
                    .to_string(),
                title: item.get("title").and_then(|t| t.as_str())?.to_string(),
                duration: item.get("duration").and_then(|d| d.as_i64()).unwrap_or(0) * 1000,
                cover: item
                    .pointer("/album/cover_big")
                    .and_then(|c| c.as_str())
                    .map(String::from),
            })
        })
        .collect();
    if tracks.is_empty() {
        return Err(HoreumError::Other("Deezer не отдал треки".into()));
    }
    Ok(BridgeList {
        name,
        source: "deezer".into(),
        cover,
        tracks,
    })
}

// ────────────────────── импорт списком (ВК и любое другое) ─────────────

/// Парсит текст вида «Артист - Название» по строкам.
pub fn parse_text(text: &str) -> BridgeList {
    const SEPARATORS: [&str; 5] = [" \u{2014} ", " \u{2013} ", " - ", " \u{2022} ", "\t"];
    let mut tracks = Vec::new();
    for raw in text.lines() {
        let line = raw.trim().trim_start_matches(|c: char| c.is_ascii_digit() || c == '.' || c == ')');
        let line = line.trim();
        if line.is_empty() || line.chars().count() < 3 {
            continue;
        }
        let mut artist = String::new();
        let mut title = line.to_string();
        for sep in SEPARATORS {
            if let Some((left, right)) = line.split_once(sep) {
                artist = left.trim().to_string();
                title = right.trim().to_string();
                break;
            }
        }
        tracks.push(BridgeTrack {
            artist,
            title,
            duration: 0,
            cover: None,
        });
    }
    BridgeList {
        name: "Импорт списком".into(),
        source: "text".into(),
        cover: None,
        tracks,
    }
}

fn unescape(input: &str) -> String {
    input
        .replace("\\u0026", "&")
        .replace("\\\"", "\"")
        .replace("\\/", "/")
        .replace("\\\\", "\\")
}
