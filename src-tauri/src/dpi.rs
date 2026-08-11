//! Обход DPI-блокировок (актуально для РФ, где SoundCloud режут по SNI).
//!
//! Принцип тот же, что у zapret/GoodbyeDPI в режиме `split`: мы не меняем содержимое
//! соединения, а разбиваем первый пакет (TLS ClientHello или HTTP-заголовок с Host)
//! на несколько TCP-сегментов — причём граница реза проходит внутри имени хоста.
//! Простой DPI смотрит только на первый сегмент, не находит там целиком `soundcloud.com`
//! и пропускает соединение.
//!
//! Реализовано как локальный HTTP/CONNECT-прокси на 127.0.0.1: он прописывается в переменные
//! окружения процесса, поэтому все reqwest-клиенты (SoundCloud, YouTube, тексты, загрузки)
//! автоматически ходят через него. Сам прокси ходит в сеть напрямую, без сторонних серверов:
//! трафик никуда не уходит, это не VPN.

use once_cell::sync::Lazy;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct DpiConfig {
    /// Включена ли фрагментация.
    pub enabled: bool,
    /// Запасная позиция реза, если имя хоста в пакете не найдено.
    pub split_pos: usize,
    /// Пауза между сегментами, мс (мешает DPI склеить поток).
    pub delay_ms: u64,
    /// Порт локального прокси (0 — не запущен).
    pub port: u16,
    /// Успешно ли поднят прокси.
    pub running: bool,
}

impl Default for DpiConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            split_pos: 2,
            delay_ms: 12,
            port: 0,
            running: false,
        }
    }
}

static CFG: Lazy<RwLock<DpiConfig>> = Lazy::new(|| RwLock::new(DpiConfig::default()));

pub fn config() -> DpiConfig {
    *CFG.read()
}

/// Поднимает локальный прокси и прописывает его в окружение процесса.
/// Вызывать ДО создания reqwest-клиентов.
pub fn start(enabled: bool, split_pos: usize, delay_ms: u64) {
    {
        let mut c = CFG.write();
        c.enabled = enabled;
        c.split_pos = split_pos.clamp(1, 64);
        c.delay_ms = delay_ms.min(300);
    }

    let std_listener = match std::net::TcpListener::bind(("127.0.0.1", 0)) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[horeum] dpi: не удалось занять порт: {e}");
            return;
        }
    };
    if let Err(e) = std_listener.set_nonblocking(true) {
        eprintln!("[horeum] dpi: nonblocking: {e}");
        return;
    }
    let port = std_listener.local_addr().map(|a| a.port()).unwrap_or(0);

    let proxy = format!("http://127.0.0.1:{port}");
    for key in [
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "http_proxy",
        "https_proxy",
        "ALL_PROXY",
        "all_proxy",
    ] {
        std::env::set_var(key, &proxy);
    }
    std::env::set_var("NO_PROXY", "127.0.0.1,localhost");
    std::env::set_var("no_proxy", "127.0.0.1,localhost");

    {
        let mut c = CFG.write();
        c.port = port;
        c.running = true;
    }
    eprintln!("[horeum] dpi bypass proxy на {proxy} (фрагментация: {enabled})");

    tauri::async_runtime::spawn(async move {
        let listener = match TcpListener::from_std(std_listener) {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[horeum] dpi: from_std: {e}");
                return;
            }
        };
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = handle(stream).await {
                            let msg = e.to_string();
                            if !msg.contains("reset") && !msg.contains("aborted") {
                                eprintln!("[horeum] dpi conn: {msg}");
                            }
                        }
                    });
                }
                Err(e) => {
                    eprintln!("[horeum] dpi accept: {e}");
                    tokio::time::sleep(Duration::from_millis(200)).await;
                }
            }
        }
    });
}

/// Переключает фрагментацию на лету (прокси продолжает работать как обычный релей).
pub fn apply(enabled: bool, split_pos: Option<usize>, delay_ms: Option<u64>) -> DpiConfig {
    let mut c = CFG.write();
    c.enabled = enabled;
    if let Some(s) = split_pos {
        c.split_pos = s.clamp(1, 64);
    }
    if let Some(d) = delay_ms {
        c.delay_ms = d.min(300);
    }
    *c
}

// ───────────────────────────── прокси ─────────────────────────────

async fn handle(mut client: TcpStream) -> std::io::Result<()> {
    client.set_nodelay(true).ok();

    // читаем заголовок запроса к прокси
    let mut head: Vec<u8> = Vec::with_capacity(2048);
    let mut buf = [0u8; 4096];
    let body_start = loop {
        let n = client.read(&mut buf).await?;
        if n == 0 {
            return Ok(());
        }
        head.extend_from_slice(&buf[..n]);
        if let Some(p) = find(&head, b"\r\n\r\n") {
            break p + 4;
        }
        if head.len() > 64 * 1024 {
            return Ok(());
        }
    };

    let rest: Vec<u8> = head[body_start..].to_vec();
    let text = String::from_utf8_lossy(&head[..body_start]).to_string();
    let mut lines = text.lines();
    let request_line = lines.next().unwrap_or_default().to_string();
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default().to_string();
    let target = parts.next().unwrap_or_default().to_string();

    if method.eq_ignore_ascii_case("CONNECT") {
        let (host, port) = split_host_port(&target, 443);
        let mut upstream = TcpStream::connect((host.as_str(), port)).await?;
        upstream.set_nodelay(true).ok();
        client
            .write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            .await?;
        client.flush().await?;

        // первый пакет клиента — TLS ClientHello, его и режем
        let mut first = rest;
        if first.is_empty() {
            let mut tmp = vec![0u8; 32 * 1024];
            let n = client.read(&mut tmp).await?;
            if n == 0 {
                return Ok(());
            }
            tmp.truncate(n);
            first = tmp;
        }
        write_fragmented(&mut upstream, &first, &host).await?;
        tokio::io::copy_bidirectional(&mut client, &mut upstream)
            .await
            .ok();
        return Ok(());
    }

    // обычный HTTP через прокси: absolute-URI → origin-form
    let (host, port, path) = parse_absolute(&target);
    if host.is_empty() {
        let _ = client.write_all(b"HTTP/1.1 400 Bad Request\r\n\r\n").await;
        return Ok(());
    }
    let mut upstream = TcpStream::connect((host.as_str(), port)).await?;
    upstream.set_nodelay(true).ok();

    let mut rebuilt = format!("{method} {path} HTTP/1.1\r\n");
    for line in lines {
        if line.is_empty() {
            continue;
        }
        let lower = line.to_ascii_lowercase();
        if lower.starts_with("proxy-connection:") || lower.starts_with("proxy-authorization:") {
            continue;
        }
        rebuilt.push_str(line);
        rebuilt.push_str("\r\n");
    }
    rebuilt.push_str("\r\n");

    // заголовок с Host тоже режем — плайный HTTP блокируют по нему
    write_fragmented(&mut upstream, rebuilt.as_bytes(), &host).await?;
    if !rest.is_empty() {
        upstream.write_all(&rest).await?;
        upstream.flush().await?;
    }
    tokio::io::copy_bidirectional(&mut client, &mut upstream)
        .await
        .ok();
    Ok(())
}

/// Режет первый пакет на три сегмента с границей внутри имени хоста.
async fn write_fragmented(up: &mut TcpStream, data: &[u8], host: &str) -> std::io::Result<()> {
    let cfg = config();
    if !cfg.enabled || data.len() < 8 {
        up.write_all(data).await?;
        return up.flush().await;
    }

    let idx = sni_split_index(data, host)
        .unwrap_or(cfg.split_pos)
        .clamp(1, data.len() - 1);

    up.write_all(&data[..idx]).await?;
    up.flush().await?;
    if cfg.delay_ms > 0 {
        tokio::time::sleep(Duration::from_millis(cfg.delay_ms)).await;
    }

    let tail = &data[idx..];
    if tail.len() > 64 {
        let mid = tail.len() / 2;
        up.write_all(&tail[..mid]).await?;
        up.flush().await?;
        if cfg.delay_ms > 0 {
            tokio::time::sleep(Duration::from_millis(cfg.delay_ms)).await;
        }
        up.write_all(&tail[mid..]).await?;
    } else {
        up.write_all(tail).await?;
    }
    up.flush().await
}

/// Ищет имя хоста в пакете и возвращает позицию внутри него (середина домена).
fn sni_split_index(data: &[u8], host: &str) -> Option<usize> {
    if host.is_empty() {
        return None;
    }
    let pos = find(data, host.as_bytes())?;
    Some(pos + host.len() / 2)
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack.windows(needle.len()).position(|w| w == needle)
}

fn split_host_port(target: &str, default_port: u16) -> (String, u16) {
    if let Some(idx) = target.rfind(':') {
        if !target[idx + 1..].contains(']') {
            let host = target[..idx].trim_matches(|c| c == '[' || c == ']').to_string();
            let port = target[idx + 1..].parse().unwrap_or(default_port);
            return (host, port);
        }
    }
    (target.trim_matches(|c| c == '[' || c == ']').to_string(), default_port)
}

fn parse_absolute(target: &str) -> (String, u16, String) {
    let (scheme_default, without_scheme) = if let Some(r) = target.strip_prefix("http://") {
        (80u16, r)
    } else if let Some(r) = target.strip_prefix("https://") {
        (443u16, r)
    } else {
        return (String::new(), 80, target.to_string());
    };
    let (authority, path) = match without_scheme.find('/') {
        Some(i) => (&without_scheme[..i], &without_scheme[i..]),
        None => (without_scheme, "/"),
    };
    let (host, port) = split_host_port(authority, scheme_default);
    (host, port, path.to_string())
}

// ──────────────────────────── команды ────────────────────────────

#[tauri::command]
pub fn dpi_status() -> DpiConfig {
    config()
}

#[tauri::command]
pub fn dpi_set(enabled: bool, split_pos: Option<usize>, delay_ms: Option<u64>) -> DpiConfig {
    apply(enabled, split_pos, delay_ms)
}
