//! Мелкие общие утилиты для расширенных модулей Horeum.

use crate::error::HoreumError;

/// Любая ошибка -> HoreumError::Other (в error.rs нет From<io::Error>).
pub fn err<E: std::fmt::Display>(e: E) -> HoreumError {
    HoreumError::Other(e.to_string())
}

/// Безопасное имя файла для любой ОС.
pub fn sanitize(input: &str) -> String {
    let mut out = String::new();
    for ch in input.chars() {
        match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\n' | '\r' | '\t' => {
                out.push('_')
            }
            c if (c as u32) < 32 => {}
            c => out.push(c),
        }
    }
    let trimmed = out.trim().trim_matches('.').trim().to_string();
    let limited: String = trimmed.chars().take(90).collect();
    if limited.is_empty() {
        "horeum".to_string()
    } else {
        limited
    }
}

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn rand_id() -> String {
    format!("{:016x}", rand::random::<u64>())
}

/// Расширение файла в нижнем регистре без точки (пустая строка, если нет).
pub fn ext_of(name: &str) -> String {
    let clean = name.split('?').next().unwrap_or(name);
    let clean = clean.split('#').next().unwrap_or(clean);
    match clean.rfind('.') {
        Some(i) if i + 1 < clean.len() => {
            let ext = clean[i + 1..].to_ascii_lowercase();
            if ext.len() <= 5 && ext.chars().all(|c| c.is_ascii_alphanumeric()) {
                ext
            } else {
                String::new()
            }
        }
        _ => String::new(),
    }
}

/// Тип медиа по расширению: image | gif | video.
pub fn media_kind(ext: &str) -> &'static str {
    match ext {
        "mp4" | "webm" | "mkv" | "mov" | "m4v" | "avi" => "video",
        "gif" => "gif",
        _ => "image",
    }
}

pub fn mime_for(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "mov" => "video/quicktime",
        "mp3" => "audio/mpeg",
        "m4a" => "audio/mp4",
        "opus" => "audio/ogg",
        "json" => "application/json",
        "m3u" | "m3u8" => "audio/x-mpegurl",
        "html" => "text/html; charset=utf-8",
        _ => "application/octet-stream",
    }
}

/// Одна общая HTTP-сессия для всех расширенных модулей.
pub const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

pub static CLIENT: once_cell::sync::Lazy<reqwest::Client> = once_cell::sync::Lazy::new(|| {
    reqwest::Client::builder()
        .user_agent(UA)
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .expect("http client")
});
