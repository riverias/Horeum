//! Скачивание треков на диск: progressive (mp3) и HLS (склейка сегментов),
//! прогресс через события `download:progress`, реестр в downloads.json.

use crate::error::{HoreumError, Result};
use crate::models::{StreamInfo, Track};
use crate::util::{err, now, rand_id, sanitize, CLIENT};
use futures::StreamExt;
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};

static REGISTRY_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadItem {
    pub id: String,
    pub track_id: i64,
    pub title: String,
    pub artist: String,
    pub artwork: Option<String>,
    pub duration: i64,
    pub name: String,
    pub path: String,
    pub size: u64,
    /// active | done | error
    pub status: String,
    pub error: Option<String>,
    pub created_at: String,
}

fn registry_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app.path().app_data_dir().map_err(err)?;
    std::fs::create_dir_all(&dir).map_err(err)?;
    Ok(dir.join("downloads.json"))
}

pub fn list(app: &AppHandle) -> Result<Vec<DownloadItem>> {
    let path = registry_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = std::fs::read_to_string(&path).map_err(err)?;
    let mut items: Vec<DownloadItem> = serde_json::from_str(&raw).unwrap_or_default();
    for item in items.iter_mut() {
        if item.status == "done" && !Path::new(&item.path).exists() {
            item.status = "missing".into();
        }
    }
    items.reverse();
    Ok(items)
}

fn save_all(app: &AppHandle, items: &[DownloadItem]) -> Result<()> {
    let path = registry_path(app)?;
    let raw = serde_json::to_string_pretty(items)?;
    std::fs::write(path, raw).map_err(err)?;
    Ok(())
}

fn upsert(app: &AppHandle, item: &DownloadItem) -> Result<()> {
    let _guard = REGISTRY_LOCK.lock();
    let path = registry_path(app)?;
    let mut items: Vec<DownloadItem> = if path.exists() {
        serde_json::from_str(&std::fs::read_to_string(&path).map_err(err)?).unwrap_or_default()
    } else {
        Vec::new()
    };
    match items.iter().position(|i| i.id == item.id) {
        Some(idx) => items[idx] = item.clone(),
        None => items.push(item.clone()),
    }
    if items.len() > 800 {
        let cut = items.len() - 800;
        items.drain(0..cut);
    }
    save_all(app, &items)
}

pub fn remove(app: &AppHandle, id: &str, delete_file: bool) -> Result<()> {
    let _guard = REGISTRY_LOCK.lock();
    let path = registry_path(app)?;
    if !path.exists() {
        return Ok(());
    }
    let mut items: Vec<DownloadItem> =
        serde_json::from_str(&std::fs::read_to_string(&path).map_err(err)?).unwrap_or_default();
    if let Some(idx) = items.iter().position(|i| i.id == id) {
        let item = items.remove(idx);
        if delete_file {
            let file = Path::new(&item.path);
            if file.exists() {
                let _ = std::fs::remove_file(file);
            }
        }
    }
    save_all(app, &items)
}

pub fn default_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = match app.path().download_dir() {
        Ok(d) => d.join("Horeum"),
        Err(_) => app.path().app_data_dir().map_err(err)?.join("downloads"),
    };
    std::fs::create_dir_all(&dir).map_err(err)?;
    Ok(dir)
}

fn extension(stream: &StreamInfo) -> String {
    let hay = format!(
        "{} {} {}",
        stream.mime_type.to_lowercase(),
        stream.preset.to_lowercase(),
        stream.url.to_lowercase()
    );
    if hay.contains("mp3") || hay.contains("mpeg") {
        "mp3".into()
    } else if hay.contains("opus") || hay.contains("ogg") {
        "opus".into()
    } else if hay.contains("webm") {
        "webm".into()
    } else {
        "m4a".into()
    }
}

fn emit_progress(app: &AppHandle, id: &str, received: u64, total: u64, status: &str) {
    let percent = if total > 0 {
        (received as f64 / total as f64 * 100.0).clamp(0.0, 100.0)
    } else {
        0.0
    };
    let _ = app.emit(
        "download:progress",
        serde_json::json!({
            "id": id,
            "received": received,
            "total": total,
            "percent": percent,
            "status": status,
        }),
    );
}

/// Главная точка входа: скачивает трек по уже полученной ссылке на поток.
pub async fn download(
    app: AppHandle,
    track: Track,
    stream: StreamInfo,
    dir_override: Option<String>,
) -> Result<DownloadItem> {
    let dir = match dir_override {
        Some(d) if !d.trim().is_empty() => {
            let p = PathBuf::from(d);
            std::fs::create_dir_all(&p).map_err(err)?;
            p
        }
        _ => default_dir(&app)?,
    };

    let ext = extension(&stream);
    let base_name = format!(
        "{} - {}",
        sanitize(&track.artist),
        sanitize(&track.title)
    );
    let mut name = format!("{base_name}.{ext}");
    let mut path = dir.join(&name);
    let mut n = 2;
    while path.exists() {
        name = format!("{base_name} ({n}).{ext}");
        path = dir.join(&name);
        n += 1;
        if n > 60 {
            break;
        }
    }

    let mut item = DownloadItem {
        id: rand_id(),
        track_id: track.id,
        title: track.title.clone(),
        artist: track.artist.clone(),
        artwork: track.artwork.clone(),
        duration: track.duration,
        name: name.clone(),
        path: path.to_string_lossy().to_string(),
        size: 0,
        status: "active".into(),
        error: None,
        created_at: now(),
    };
    upsert(&app, &item)?;
    emit_progress(&app, &item.id, 0, 0, "active");

    let result = if stream.protocol.eq_ignore_ascii_case("hls") || stream.url.contains(".m3u8") {
        hls(&app, &stream.url, &path, &item.id).await
    } else {
        progressive(&app, &stream.url, &path, &item.id).await
    };

    match result {
        Ok(size) => {
            item.size = size;
            item.status = "done".into();
            if let Some(art) = track.artwork.clone() {
                let cover = dir.join(format!("{base_name}.jpg"));
                if !cover.exists() {
                    if let Ok(res) = CLIENT.get(&art).send().await {
                        if let Ok(bytes) = res.bytes().await {
                            let _ = std::fs::write(&cover, &bytes);
                        }
                    }
                }
            }
        }
        Err(e) => {
            item.status = "error".into();
            item.error = Some(e.to_string());
            let _ = std::fs::remove_file(&path);
        }
    }

    upsert(&app, &item)?;
    emit_progress(&app, &item.id, item.size, item.size, &item.status);
    let _ = app.emit("download:done", &item);

    if item.status == "error" {
        return Err(HoreumError::Other(
            item.error.clone().unwrap_or_else(|| "ошибка загрузки".into()),
        ));
    }
    Ok(item)
}

async fn progressive(app: &AppHandle, url: &str, path: &Path, id: &str) -> Result<u64> {
    let res = CLIENT.get(url).send().await?;
    if !res.status().is_success() {
        return Err(HoreumError::Other(format!(
            "поток недоступен: HTTP {}",
            res.status().as_u16()
        )));
    }
    let total = res.content_length().unwrap_or(0);
    let mut file = std::fs::File::create(path).map_err(err)?;
    let mut stream = res.bytes_stream();
    let mut received: u64 = 0;
    let mut last = std::time::Instant::now();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk).map_err(err)?;
        received += chunk.len() as u64;
        if last.elapsed().as_millis() > 160 {
            emit_progress(app, id, received, total, "active");
            last = std::time::Instant::now();
        }
    }
    file.flush().map_err(err)?;
    Ok(received)
}

async fn hls(app: &AppHandle, playlist_url: &str, path: &Path, id: &str) -> Result<u64> {
    let text = CLIENT.get(playlist_url).send().await?.text().await?;
    let base = playlist_url
        .rsplit_once('/')
        .map(|(b, _)| b.to_string())
        .unwrap_or_default();
    let segments: Vec<String> = text
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .map(|l| {
            if l.starts_with("http") {
                l.to_string()
            } else {
                format!("{base}/{l}")
            }
        })
        .collect();

    if segments.is_empty() {
        return Err(HoreumError::Other("HLS-плейлист пуст".into()));
    }

    let mut file = std::fs::File::create(path).map_err(err)?;
    let total_segments = segments.len() as u64;
    let mut received: u64 = 0;
    for (idx, seg) in segments.iter().enumerate() {
        let bytes = CLIENT.get(seg).send().await?.bytes().await?;
        file.write_all(&bytes).map_err(err)?;
        received += bytes.len() as u64;
        emit_progress(app, id, idx as u64 + 1, total_segments, "active");
    }
    file.flush().map_err(err)?;
    Ok(received)
}

/// Открывает системный проводник на файле/папке.
pub fn reveal(target: &str) -> Result<()> {
    let path = Path::new(target);
    let folder = if path.is_file() {
        path.parent().map(|p| p.to_path_buf())
    } else {
        Some(path.to_path_buf())
    };
    let folder = folder.ok_or_else(|| HoreumError::NotFound("папка не найдена".into()))?;

    #[cfg(target_os = "windows")]
    {
        if path.is_file() {
            std::process::Command::new("explorer")
                .arg("/select,")
                .arg(path)
                .spawn()
                .map_err(err)?;
        } else {
            std::process::Command::new("explorer")
                .arg(folder)
                .spawn()
                .map_err(err)?;
        }
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(folder)
            .spawn()
            .map_err(err)?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(folder)
            .spawn()
            .map_err(err)?;
    }
    Ok(())
}

/// Выбор папки для загрузок (нативный диалог).
pub fn pick_folder(app: &AppHandle) -> Result<Option<String>> {
    use tauri_plugin_dialog::DialogExt;
    let picked = app.dialog().file().blocking_pick_folder();
    Ok(picked.map(|p| p.to_string()))
}
