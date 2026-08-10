//! Дополнительные команды Horeum: свои фоны и картинки, загрузки треков,
//! YouTube, импорт из Spotify / Яндекс Музыки / Deezer, вход в SoundCloud внутри плеера.
//!
//! Важно: все диалоги выбора файлов используют НЕБЛОКИРУЮЩИЙ API с callback
//! — так они безопасны из любого потока и не вешают окно приложения.

use crate::bridges::{self, BridgeList};
use crate::downloads::{self, DownloadItem};
use crate::error::{HoreumError, Result};
use crate::media::{self, ImageHit, MediaItem};
use crate::models::{StreamInfo, Track};
use crate::server;
use crate::util::err;
use crate::youtube;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

const SC_SIGNIN: &str = "https://soundcloud.com/signin";

const IMAGE_EXT: [&str; 8] = ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "jfif"];
const VIDEO_EXT: [&str; 6] = ["mp4", "webm", "mkv", "mov", "m4v", "avi"];
const LIST_EXT: [&str; 5] = ["json", "m3u", "m3u8", "txt", "csv"];

/// Адрес локального сервера (из него берутся пользовательские фоны).
#[tauri::command]
pub fn local_base() -> String {
    server::base()
}

async fn ask_file(
    app: &AppHandle,
    title: &str,
    filter_name: &str,
    exts: &[&str],
) -> Result<Option<PathBuf>> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<String>>();
    app.dialog()
        .file()
        .set_title(title.to_string())
        .add_filter(filter_name.to_string(), exts)
        .pick_file(move |picked| {
            let _ = tx.send(picked.map(|p| p.to_string()));
        });
    let picked = rx.await.map_err(err)?;
    Ok(picked.map(PathBuf::from))
}

/// Открывает нативные файлы ПК и забирает выбранное фото / GIF / видео.
#[tauri::command]
pub async fn pick_media(app: AppHandle, kind: Option<String>) -> Result<Option<MediaItem>> {
    let kind = kind.unwrap_or_else(|| "any".to_string());
    let path = match kind.as_str() {
        "video" => ask_file(&app, "Выберите видео", "Видео", &VIDEO_EXT).await?,
        "image" => ask_file(&app, "Выберите изображение", "Фото и GIF", &IMAGE_EXT).await?,
        _ => {
            let all: Vec<&str> = IMAGE_EXT.iter().chain(VIDEO_EXT.iter()).copied().collect();
            ask_file(&app, "Выберите файл", "Фото, GIF и видео", &all).await?
        }
    };
    let Some(path) = path else { return Ok(None) };
    Ok(Some(media::import_path(&app, &path)?))
}

/// Скачивает фон по ссылке (Pinterest, Unsplash, любой адрес) в библиотеку.
#[tauri::command]
pub async fn add_media_url(app: AppHandle, url: String) -> Result<MediaItem> {
    media::import_url(&app, &url).await
}

#[tauri::command]
pub fn media_list(app: AppHandle) -> Result<Vec<MediaItem>> {
    media::list(&app)
}

#[tauri::command]
pub fn media_remove(app: AppHandle, id: String) -> Result<()> {
    media::remove(&app, &id)
}

/// Поиск фонов: pinterest | unsplash | web | gif.
#[tauri::command]
pub async fn image_search(
    query: String,
    source: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<ImageHit>> {
    media::image_search(
        &query,
        source.as_deref().unwrap_or("pinterest"),
        limit.unwrap_or(30),
    )
    .await
}

// ────────────────────────────── загрузки ────────────────────────────

#[tauri::command]
pub async fn download_track(
    app: AppHandle,
    track: Track,
    stream: StreamInfo,
    dir: Option<String>,
) -> Result<DownloadItem> {
    downloads::download(app, track, stream, dir).await
}

#[tauri::command]
pub fn downloads_list(app: AppHandle) -> Result<Vec<DownloadItem>> {
    downloads::list(&app)
}

#[tauri::command]
pub fn download_remove(app: AppHandle, id: String, delete_file: Option<bool>) -> Result<()> {
    downloads::remove(&app, &id, delete_file.unwrap_or(false))
}

#[tauri::command]
pub fn downloads_dir(app: AppHandle) -> Result<String> {
    Ok(downloads::default_dir(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn pick_folder(app: AppHandle) -> Result<Option<String>> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<String>>();
    app.dialog()
        .file()
        .set_title("Папка для загрузок")
        .pick_folder(move |picked| {
            let _ = tx.send(picked.map(|p| p.to_string()));
        });
    rx.await.map_err(err)
}

#[tauri::command]
pub fn reveal_path(path: String) -> Result<()> {
    downloads::reveal(&path)
}

// ────────────────────── экспорт / импорт файлов ─────────────────────

#[tauri::command]
pub async fn save_text_file(
    app: AppHandle,
    name: String,
    contents: String,
) -> Result<Option<String>> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<String>>();
    app.dialog()
        .file()
        .set_title("Сохранить")
        .set_file_name(name)
        .add_filter("Файлы", &LIST_EXT)
        .save_file(move |picked| {
            let _ = tx.send(picked.map(|p| p.to_string()));
        });
    let Some(path) = rx.await.map_err(err)? else {
        return Ok(None);
    };
    std::fs::write(&path, contents).map_err(err)?;
    Ok(Some(path))
}

#[tauri::command]
pub async fn open_text_file(app: AppHandle) -> Result<Option<serde_json::Value>> {
    let picked = ask_file(&app, "Открыть список", "Плейлисты и списки", &LIST_EXT).await?;
    let Some(path) = picked else { return Ok(None) };
    let contents = std::fs::read_to_string(&path).map_err(err)?;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    Ok(Some(serde_json::json!({
        "name": name,
        "path": path.to_string_lossy().to_string(),
        "contents": contents,
    })))
}

// ───────────────────────────── YouTube ────────────────────────────

#[tauri::command]
pub async fn yt_search(
    app: AppHandle,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<Track>> {
    youtube::search(&app, &query, limit.unwrap_or(30)).await
}

#[tauri::command]
pub async fn yt_stream_url(track_id: i64) -> Result<StreamInfo> {
    youtube::stream(track_id).await
}

#[tauri::command]
pub async fn yt_related(
    app: AppHandle,
    track_id: i64,
    limit: Option<usize>,
) -> Result<Vec<Track>> {
    youtube::related(&app, track_id, limit.unwrap_or(25)).await
}

// ───────────────── импорт из других сервисов ───────────────────────

#[tauri::command]
pub async fn import_link(url: String) -> Result<BridgeList> {
    bridges::from_link(&url).await
}

#[tauri::command]
pub fn parse_track_list(text: String) -> Result<BridgeList> {
    Ok(bridges::parse_text(&text))
}

// ─────────────────── вход в SoundCloud без ручного токена ───────────────

/// Открывает окно входа внутри Horeum. После входа токен улетает на
/// локальный сервер и приходит во фронтенд событием `sc-token`.
#[tauri::command]
pub fn sc_login_window(app: AppHandle) -> Result<()> {
    if let Some(existing) = app.get_webview_window("sc-login") {
        let _ = existing.set_focus();
        return Ok(());
    }

    let script = String::from("(function(){var base='")
        + &server::base()
        + "';var sent='';function pick(){try{var m=document.cookie.match(/oauth_token=([^;]+)/);if(m&&m[1])return decodeURIComponent(m[1]);for(var i=0;i<localStorage.length;i++){var v=localStorage.getItem(localStorage.key(i))||'';var g=v.match(/2-[0-9]{4,}-[0-9]{4,}-[A-Za-z0-9]{6,}/);if(g)return g[0];}}catch(e){}return '';}\
function tick(){var t=pick();if(t&&t!==sent){sent=t;try{fetch(base+'/sc-token?token='+encodeURIComponent(t),{mode:'cors'});}catch(e){}}}setInterval(tick,1200);setTimeout(tick,800);})();";

    let url = tauri::Url::parse(SC_SIGNIN).map_err(err)?;
    tauri::WebviewWindowBuilder::new(&app, "sc-login", tauri::WebviewUrl::External(url))
        .title("Вход в SoundCloud")
        .inner_size(540.0, 800.0)
        .center()
        .initialization_script(script.as_str())
        .build()
        .map_err(|e| HoreumError::Other(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub fn close_login_window(app: AppHandle) -> Result<()> {
    if let Some(window) = app.get_webview_window("sc-login") {
        let _ = window.close();
    }
    Ok(())
}

/// Запасной вариант: открыть вход во внешнем браузере (Brave, Chrome, ...).
#[tauri::command]
pub fn sc_login_browser(app: AppHandle, browser: Option<String>) -> Result<String> {
    let _ = &app;
    let helper = format!("{}/sc-login", server::base());
    let choice = browser
        .unwrap_or_else(|| "brave".to_string())
        .to_lowercase();

    for candidate in browser_paths(&choice) {
        let is_path = candidate.contains(std::path::MAIN_SEPARATOR);
        if is_path && !std::path::Path::new(&candidate).exists() {
            continue;
        }
        if std::process::Command::new(&candidate)
            .arg(SC_SIGNIN)
            .arg(&helper)
            .spawn()
            .is_ok()
        {
            return Ok(choice);
        }
    }

    open_default(&helper)?;
    open_default(SC_SIGNIN)?;
    Ok("default".to_string())
}

fn browser_paths(choice: &str) -> Vec<String> {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let mut out: Vec<String> = Vec::new();
    match choice {
        "chrome" => {
            out.push(r"C:\Program Files\Google\Chrome\Application\chrome.exe".to_string());
            out.push(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe".to_string());
            out.push("google-chrome".to_string());
            out.push("chromium".to_string());
        }
        "edge" => {
            out.push(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe".to_string());
            out.push(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe".to_string());
            out.push("microsoft-edge".to_string());
        }
        "firefox" => {
            out.push(r"C:\Program Files\Mozilla Firefox\firefox.exe".to_string());
            out.push(r"C:\Program Files (x86)\Mozilla Firefox\firefox.exe".to_string());
            out.push("firefox".to_string());
        }
        "yandex" => {
            if !local.is_empty() {
                out.push(format!(
                    r"{}\Yandex\YandexBrowser\Application\browser.exe",
                    local
                ));
            }
            out.push("yandex-browser".to_string());
        }
        "opera" => {
            if !local.is_empty() {
                out.push(format!(r"{}\Programs\Opera\opera.exe", local));
            }
            out.push("opera".to_string());
        }
        "default" => {}
        _ => {
            out.push(
                r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe".to_string(),
            );
            out.push(
                r"C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe"
                    .to_string(),
            );
            if !local.is_empty() {
                out.push(format!(
                    r"{}\BraveSoftware\Brave-Browser\Application\brave.exe",
                    local
                ));
            }
            out.push("brave-browser".to_string());
            out.push("brave".to_string());
        }
    }
    out
}

fn open_default(url: &str) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(err)?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(err)?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(err)?;
    }
    Ok(())
}
