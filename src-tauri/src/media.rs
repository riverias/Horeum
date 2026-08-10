//! Пользовательские медиа: свои фоны (фото / GIF / видео), аватар, баннер,
//! а также поиск картинок для фона — Pinterest, Unsplash, веб и GIF.

use crate::error::{HoreumError, Result};
use crate::server;
use crate::util::{err, ext_of, media_kind, now, rand_id, CLIENT};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaItem {
    /// имя файла внутри папки media (оно же id)
    pub id: String,
    pub name: String,
    /// image | gif | video
    pub kind: String,
    /// http://127.0.0.1:PORT/media/<file>
    pub url: String,
    pub path: String,
    pub size: u64,
    pub added_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageHit {
    pub id: String,
    pub url: String,
    pub thumb: String,
    pub width: i64,
    pub height: i64,
    pub title: String,
    pub source: String,
    pub link: String,
}

const IMAGE_EXT: [&str; 8] = ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "jfif"];
const VIDEO_EXT: [&str; 6] = ["mp4", "webm", "mkv", "mov", "m4v", "avi"];

pub fn media_dir(app: &AppHandle) -> Result<PathBuf> {
    let base = app.path().app_data_dir().map_err(err)?;
    let dir = base.join("media");
    std::fs::create_dir_all(&dir).map_err(err)?;
    Ok(dir)
}

fn item_from_path(path: &std::path::Path) -> Option<MediaItem> {
    let name = path.file_name()?.to_string_lossy().to_string();
    let ext = ext_of(&name);
    let meta = std::fs::metadata(path).ok();
    Some(MediaItem {
        id: name.clone(),
        name: name.clone(),
        kind: media_kind(&ext).to_string(),
        url: server::media_url(&name),
        path: path.to_string_lossy().to_string(),
        size: meta.as_ref().map(|m| m.len()).unwrap_or(0),
        added_at: now(),
    })
}

/// Нативный выбор файла на ПК (кнопка «Загрузить с компьютера»).
pub fn pick(app: &AppHandle, kind: &str) -> Result<Option<MediaItem>> {
    let mut dialog = app.dialog().file();
    dialog = match kind {
        "video" => dialog.add_filter("Видео", &VIDEO_EXT),
        "image" => dialog.add_filter("Изображения и GIF", &IMAGE_EXT),
        _ => {
            let all: Vec<&str> = IMAGE_EXT.iter().chain(VIDEO_EXT.iter()).copied().collect();
            dialog.add_filter("Фото, GIF и видео", &all)
        }
    };
    let Some(picked) = dialog.blocking_pick_file() else {
        return Ok(None);
    };
    let src = PathBuf::from(picked.to_string());
    import_path(app, &src).map(Some)
}

/// Копирует файл с диска в папку приложения и отдаёт готовый URL.
pub fn import_path(app: &AppHandle, src: &std::path::Path) -> Result<MediaItem> {
    if !src.exists() {
        return Err(HoreumError::NotFound(format!(
            "файл не найден: {}",
            src.to_string_lossy()
        )));
    }
    let ext = ext_of(&src.file_name().unwrap_or_default().to_string_lossy());
    let ext = if ext.is_empty() { "jpg".to_string() } else { ext };
    let dir = media_dir(app)?;
    let name = format!("{}-{}.{}", media_kind(&ext), rand_id(), ext);
    let dst = dir.join(&name);
    std::fs::copy(src, &dst).map_err(err)?;
    item_from_path(&dst).ok_or_else(|| HoreumError::Other("не удалось прочитать файл".into()))
}

/// Скачивает картинку/видео по ссылке (например из Pinterest) в папку приложения.
pub async fn import_url(app: &AppHandle, url: &str) -> Result<MediaItem> {
    let res = CLIENT
        .get(url)
        .header("Referer", "https://www.pinterest.com/")
        .send()
        .await?;
    if !res.status().is_success() {
        return Err(HoreumError::Other(format!(
            "не удалось скачать файл: HTTP {}",
            res.status().as_u16()
        )));
    }
    let ct = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let mut ext = ext_of(url);
    if ext.is_empty() {
        ext = match ct.as_str() {
            c if c.contains("gif") => "gif".into(),
            c if c.contains("png") => "png".into(),
            c if c.contains("webp") => "webp".into(),
            c if c.contains("mp4") => "mp4".into(),
            c if c.contains("webm") => "webm".into(),
            _ => "jpg".into(),
        };
    }
    let bytes = res.bytes().await?;
    let dir = media_dir(app)?;
    let name = format!("{}-{}.{}", media_kind(&ext), rand_id(), ext);
    let dst = dir.join(&name);
    std::fs::write(&dst, &bytes).map_err(err)?;
    item_from_path(&dst).ok_or_else(|| HoreumError::Other("не удалось сохранить файл".into()))
}

pub fn list(app: &AppHandle) -> Result<Vec<MediaItem>> {
    let dir = media_dir(app)?;
    let mut out = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(err)?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(item) = item_from_path(&path) {
                out.push(item);
            }
        }
    }
    out.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(out)
}

pub fn remove(app: &AppHandle, id: &str) -> Result<()> {
    if id.contains("..") || id.contains('/') || id.contains('\\') {
        return Err(HoreumError::Other("некорректное имя файла".into()));
    }
    let path = media_dir(app)?.join(id);
    if path.exists() {
        std::fs::remove_file(&path).map_err(err)?;
    }
    Ok(())
}

// ────────────────────────── поиск картинок для фона ──────────────────────

const PIN_API: &str = "https://www.pinterest.com/resource/BaseSearchResource/get/";
const PIN_SEARCH: &str = "https://www.pinterest.com/search/pins/";
const UNSPLASH_API: &str = "https://unsplash.com/napi/search/photos";
const BING_IMAGES: &str = "https://www.bing.com/images/search";

/// source: pinterest | unsplash | web | gif
pub async fn image_search(query: &str, source: &str, limit: usize) -> Result<Vec<ImageHit>> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }
    let limit = limit.clamp(1, 60);
    let hits = match source {
        "unsplash" => unsplash(q, limit).await.unwrap_or_default(),
        "web" => bing(q, limit, false).await.unwrap_or_default(),
        "gif" => bing(q, limit, true).await.unwrap_or_default(),
        _ => {
            let mut r = pinterest_api(q, limit).await.unwrap_or_default();
            if r.is_empty() {
                r = pinterest_html(q, limit).await.unwrap_or_default();
            }
            if r.is_empty() {
                r = bing(q, limit, false).await.unwrap_or_default();
            }
            r
        }
    };
    Ok(hits.into_iter().take(limit).collect())
}

async fn pinterest_api(query: &str, limit: usize) -> Result<Vec<ImageHit>> {
    let data = serde_json::json!({
        "options": { "query": query, "scope": "pins", "page_size": limit.max(25), "bookmarks": [] },
        "context": {}
    })
    .to_string();
    let source_url = format!("/search/pins/?q={}&rs=typed", urlencoding::encode(query));
    let url = format!(
        "{}?source_url={}&data={}",
        PIN_API,
        urlencoding::encode(&source_url),
        urlencoding::encode(&data)
    );
    let res = CLIENT
        .get(&url)
        .header("Accept", "application/json, text/javascript, */*; q=0.01")
        .header("X-Requested-With", "XMLHttpRequest")
        .header("X-APP-VERSION", "cb0ba8b")
        .header("X-Pinterest-AppState", "active")
        .header("X-Pinterest-PWS-Handler", "www/search/[scope].js")
        .header("Referer", "https://www.pinterest.com/")
        .send()
        .await?;
    let value: serde_json::Value = res.json().await?;
    let results = value
        .pointer("/resource_response/data/results")
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::new();
    for pin in results {
        let images = pin.get("images");
        let orig = images
            .and_then(|i| i.get("orig"))
            .or_else(|| images.and_then(|i| i.get("736x")));
        let Some(full) = orig
            .and_then(|o| o.get("url"))
            .and_then(|u| u.as_str())
            .map(String::from)
        else {
            continue;
        };
        let thumb = images
            .and_then(|i| i.get("236x"))
            .and_then(|t| t.get("url"))
            .and_then(|u| u.as_str())
            .unwrap_or(&full)
            .to_string();
        let pin_id = pin
            .get("id")
            .and_then(|i| i.as_str())
            .unwrap_or("")
            .to_string();
        let link = if pin_id.is_empty() {
            String::new()
        } else {
            format!("https://www.pinterest.com/pin/{}/", pin_id)
        };
        out.push(ImageHit {
            id: if pin_id.is_empty() { rand_id() } else { pin_id },
            url: full,
            thumb,
            width: orig
                .and_then(|o| o.get("width"))
                .and_then(|w| w.as_i64())
                .unwrap_or(0),
            height: orig
                .and_then(|o| o.get("height"))
                .and_then(|h| h.as_i64())
                .unwrap_or(0),
            title: pin
                .get("grid_title")
                .or_else(|| pin.get("title"))
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string(),
            source: "pinterest".into(),
            link,
        });
    }
    Ok(out)
}

async fn pinterest_html(query: &str, limit: usize) -> Result<Vec<ImageHit>> {
    let url = format!("{}?q={}&rs=typed", PIN_SEARCH, urlencoding::encode(query));
    let body = CLIENT.get(&url).send().await?.text().await?;
    let re = Regex::new(
        r"https://i\.pinimg\.com/(?:originals|736x|564x)/[A-Za-z0-9/_\-]+\.(?:jpg|jpeg|png|gif|webp)",
    )
    .map_err(err)?;
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for m in re.find_iter(&body) {
        let u = m.as_str().to_string();
        if seen.insert(u.clone()) {
            out.push(ImageHit {
                id: rand_id(),
                thumb: u.clone(),
                url: u,
                width: 0,
                height: 0,
                title: query.to_string(),
                source: "pinterest".into(),
                link: String::new(),
            });
            if out.len() >= limit {
                break;
            }
        }
    }
    Ok(out)
}

async fn unsplash(query: &str, limit: usize) -> Result<Vec<ImageHit>> {
    let url = format!(
        "{}?query={}&per_page={}&orientation=landscape",
        UNSPLASH_API,
        urlencoding::encode(query),
        limit.max(20)
    );
    let value: serde_json::Value = CLIENT
        .get(&url)
        .header("Accept", "application/json")
        .header("Referer", "https://unsplash.com/")
        .send()
        .await?
        .json()
        .await?;
    let items = value
        .get("results")
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();
    let mut out = Vec::new();
    for it in items {
        let full = it
            .pointer("/urls/raw")
            .or_else(|| it.pointer("/urls/full"))
            .and_then(|u| u.as_str())
            .unwrap_or_default()
            .to_string();
        if full.is_empty() {
            continue;
        }
        let big = format!("{}&w=2400&q=85&fm=jpg", full);
        out.push(ImageHit {
            id: it
                .get("id")
                .and_then(|i| i.as_str())
                .unwrap_or("")
                .to_string(),
            url: big,
            thumb: it
                .pointer("/urls/small")
                .and_then(|u| u.as_str())
                .unwrap_or(&full)
                .to_string(),
            width: it.get("width").and_then(|w| w.as_i64()).unwrap_or(0),
            height: it.get("height").and_then(|h| h.as_i64()).unwrap_or(0),
            title: it
                .get("alt_description")
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string(),
            source: "unsplash".into(),
            link: it
                .pointer("/links/html")
                .and_then(|l| l.as_str())
                .unwrap_or("")
                .to_string(),
        });
    }
    Ok(out)
}

async fn bing(query: &str, limit: usize, gif: bool) -> Result<Vec<ImageHit>> {
    let filter = if gif {
        "+filterui:photo-animatedgif"
    } else {
        "+filterui:imagesize-wallpaper"
    };
    let url = format!(
        "{}?q={}&qft={}&first=1",
        BING_IMAGES,
        urlencoding::encode(query),
        urlencoding::encode(filter)
    );
    let body = CLIENT
        .get(&url)
        .header("Accept-Language", "ru,en;q=0.8")
        .send()
        .await?
        .text()
        .await?;
    let body = body.replace("&quot;", "\"").replace("&amp;", "&");
    let re = Regex::new("\"murl\":\"(https?://[^\"]+?)\"").map_err(err)?;
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for cap in re.captures_iter(&body) {
        let u = cap[1].to_string();
        if !seen.insert(u.clone()) {
            continue;
        }
        out.push(ImageHit {
            id: rand_id(),
            thumb: u.clone(),
            url: u,
            width: 0,
            height: 0,
            title: query.to_string(),
            source: if gif { "gif".into() } else { "web".into() },
            link: String::new(),
        });
        if out.len() >= limit {
            break;
        }
    }
    Ok(out)
}
