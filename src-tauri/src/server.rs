//! Локальный HTTP-сервер Horeum.
//!
//! Зачем он нужен:
//! 1. раздаёт пользовательские медиа (свои фоны: фото / GIF / видео) обычным
//!    `http://127.0.0.1:PORT/media/...` URL — без CSP и без asset-протокола,
//!    с поддержкой Range-запросов, чтобы видео-фон нормально листался;
//! 2. принимает `oauth_token` SoundCloud из окна входа внутри плеера
//!    (страница soundcloud.com сама отправляет его сюда) и пробрасывает
//!    во фронтенд событием `sc-token`;
//! 3. отдаёт красивую вспомогательную страницу `/sc-login` для входа через
//!    внешний браузер (Brave / Chrome / Edge ...).

use crate::util::mime_for;
use once_cell::sync::OnceCell;
use std::io::{Read, Seek, SeekFrom, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

static PORT: OnceCell<u16> = OnceCell::new();

pub fn port() -> u16 {
    *PORT.get().unwrap_or(&14785)
}

pub fn base() -> String {
    format!("http://127.0.0.1:{}", port())
}

pub fn media_url(file: &str) -> String {
    format!("{}/media/{}", base(), urlencoding::encode(file))
}

/// Поднимает сервер в фоновом потоке. Ошибки не фатальны для приложения.
pub fn start(app: AppHandle, media_dir: PathBuf) {
    let listener = (14785..14825).find_map(|p| TcpListener::bind(("127.0.0.1", p)).ok());
    let Some(listener) = listener else {
        eprintln!("[horeum] local server: свободный порт не найден");
        return;
    };
    let bound = listener.local_addr().map(|a| a.port()).unwrap_or(14785);
    let _ = PORT.set(bound);
    println!("[horeum] local server: http://127.0.0.1:{bound}");

    std::thread::spawn(move || {
        for stream in listener.incoming() {
            if let Ok(stream) = stream {
                let app = app.clone();
                let dir = media_dir.clone();
                std::thread::spawn(move || {
                    let _ = handle(stream, &app, &dir);
                });
            }
        }
    });
}

fn handle(mut stream: TcpStream, app: &AppHandle, media: &Path) -> std::io::Result<()> {
    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(10)));

    let mut buf: Vec<u8> = Vec::new();
    let mut chunk = [0u8; 2048];
    loop {
        let n = stream.read(&mut chunk)?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
        if buf.windows(4).any(|w| w == b"\r\n\r\n") || buf.len() > 32 * 1024 {
            break;
        }
    }

    let text = String::from_utf8_lossy(&buf).to_string();
    let mut it = text.split("\r\n");
    let request_line = it.next().unwrap_or("").to_string();
    let mut parts = request_line.split_whitespace();
    let _method = parts.next().unwrap_or("GET").to_string();
    let target = parts.next().unwrap_or("/").to_string();

    let mut range: Option<String> = None;
    for line in text.split("\r\n").skip(1) {
        let low = line.to_ascii_lowercase();
        if let Some(v) = low.strip_prefix("range: bytes=") {
            range = Some(v.trim().to_string());
        }
    }

    let (path, query) = match target.split_once('?') {
        Some((p, q)) => (p.to_string(), q.to_string()),
        None => (target.clone(), String::new()),
    };

    match path.as_str() {
        "/health" => respond(&mut stream, 200, "text/plain", b"ok".to_vec(), None),
        "/favicon.ico" => respond(&mut stream, 204, "image/x-icon", Vec::new(), None),
        "/sc-token" => {
            let token = query_param(&query, "token").unwrap_or_default();
            let token = token.trim().trim_matches('"').to_string();
            if token.len() > 10 {
                let _ = app.emit("sc-token", token);
            }
            respond(&mut stream, 200, "text/plain", b"ok".to_vec(), None)
        }
        "/sc-login" => respond(
            &mut stream,
            200,
            "text/html; charset=utf-8",
            login_page().into_bytes(),
            None,
        ),
        p if p.starts_with("/media/") => {
            let name = urlencoding::decode(&p["/media/".len()..])
                .map(|c| c.to_string())
                .unwrap_or_default();
            serve_file(&mut stream, media, &name, range)
        }
        _ => respond(&mut stream, 404, "text/plain", b"not found".to_vec(), None),
    }
}

fn serve_file(
    stream: &mut TcpStream,
    dir: &Path,
    name: &str,
    range: Option<String>,
) -> std::io::Result<()> {
    if name.is_empty() || name.contains("..") || name.contains('/') || name.contains('\\') {
        return respond(stream, 404, "text/plain", b"bad name".to_vec(), None);
    }
    let path = dir.join(name);
    let Ok(mut file) = std::fs::File::open(&path) else {
        return respond(stream, 404, "text/plain", b"missing".to_vec(), None);
    };
    let total = file.metadata().map(|m| m.len()).unwrap_or(0);
    let mime = mime_for(&crate::util::ext_of(name));

    if let Some(spec) = range {
        let mut halves = spec.splitn(2, '-');
        let start: u64 = halves.next().unwrap_or("0").trim().parse().unwrap_or(0);
        let end_raw = halves.next().unwrap_or("").trim().to_string();
        let end = if end_raw.is_empty() {
            total.saturating_sub(1)
        } else {
            end_raw.parse::<u64>().unwrap_or(total.saturating_sub(1))
        };
        let end = end.min(total.saturating_sub(1));
        if start > end || total == 0 {
            return respond(stream, 416, "text/plain", Vec::new(), None);
        }
        let len = (end - start + 1) as usize;
        let mut body = vec![0u8; len];
        file.seek(SeekFrom::Start(start))?;
        let read = file.read(&mut body)?;
        body.truncate(read);
        return respond(stream, 206, mime, body, Some((start, end, total)));
    }

    let mut body = Vec::new();
    file.read_to_end(&mut body)?;
    respond(stream, 200, mime, body, None)
}

fn respond(
    stream: &mut TcpStream,
    status: u16,
    mime: &str,
    body: Vec<u8>,
    content_range: Option<(u64, u64, u64)>,
) -> std::io::Result<()> {
    let reason = match status {
        200 => "OK",
        204 => "No Content",
        206 => "Partial Content",
        404 => "Not Found",
        416 => "Range Not Satisfiable",
        _ => "OK",
    };
    let mut head = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {mime}\r\nContent-Length: {len}\r\nAccept-Ranges: bytes\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: *\r\nCache-Control: no-store\r\nConnection: close\r\n",
        len = body.len()
    );
    if let Some((start, end, total)) = content_range {
        head.push_str(&format!("Content-Range: bytes {start}-{end}/{total}\r\n"));
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes())?;
    if !body.is_empty() {
        stream.write_all(&body)?;
    }
    stream.flush()
}

fn query_param(query: &str, key: &str) -> Option<String> {
    for pair in query.split('&') {
        let mut kv = pair.splitn(2, '=');
        let k = kv.next().unwrap_or("");
        let v = kv.next().unwrap_or("");
        if k == key {
            return urlencoding::decode(v).ok().map(|c| c.to_string());
        }
    }
    None
}

fn login_page() -> String {
    let snippet = "copy(document.cookie.match(/oauth_token=([^;]+)/)[1])";
    format!(
        r##"<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>Horeum · вход в SoundCloud</title>
<style>
  :root {{ color-scheme: dark; }}
  * {{ box-sizing: border-box; }}
  body {{ margin:0; min-height:100vh; display:grid; place-items:center; font-family: ui-sans-serif, system-ui, 'Segoe UI', sans-serif;
    background: radial-gradient(1200px 600px at 20% -10%, #3b1d6e 0%, transparent 60%), radial-gradient(900px 500px at 100% 0%, #0d3b57 0%, transparent 55%), #08070d; color:#fff; padding:32px; }}
  .card {{ width:min(680px,100%); border-radius:26px; padding:34px; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.10);
    box-shadow:0 40px 120px rgba(0,0,0,.55); backdrop-filter: blur(26px); }}
  h1 {{ margin:0 0 6px; font-size:26px; letter-spacing:-.02em; }}
  p  {{ margin:0 0 18px; color:rgba(255,255,255,.62); line-height:1.6; font-size:14px; }}
  ol {{ margin:0 0 18px; padding-left:20px; color:rgba(255,255,255,.72); font-size:14px; line-height:1.9; }}
  code {{ background:rgba(255,255,255,.09); padding:3px 7px; border-radius:7px; font-size:12.5px; }}
  .row {{ display:flex; gap:10px; }}
  input {{ flex:1; padding:13px 15px; border-radius:14px; border:1px solid rgba(255,255,255,.12); background:rgba(0,0,0,.35); color:#fff; font-size:14px; outline:none; }}
  input:focus {{ border-color:#8b5cf6; box-shadow:0 0 0 4px rgba(139,92,246,.18); }}
  button {{ padding:13px 20px; border-radius:14px; border:0; cursor:pointer; font-weight:700; font-size:14px;
    background:linear-gradient(135deg,#8b5cf6,#d946ef); color:#fff; }}
  button.ghost {{ background:rgba(255,255,255,.08); }}
  .ok {{ margin-top:16px; padding:14px; border-radius:14px; display:none; background:rgba(34,197,94,.14); border:1px solid rgba(34,197,94,.35); color:#86efac; font-size:14px; }}
  .hint {{ margin-top:14px; font-size:12.5px; color:rgba(255,255,255,.42); }}
</style>
</head>
<body>
  <div class="card">
    <h1>Вход в SoundCloud</h1>
    <p>Проще всего нажать в плеере «Войти внутри Horeum» — там токен подхватится сам. Эта страница нужна, если вы хотите войти в своём браузере.</p>
    <ol>
      <li>В этом же браузере откройте <code>soundcloud.com</code> и войдите в аккаунт.</li>
      <li>Нажмите <code>F12</code> → вкладка <b>Console</b>.</li>
      <li>Вставьте и выполните: <code>{snippet}</code></li>
      <li>Токен скопирован в буфер — вставьте его сюда:</li>
    </ol>
    <div class="row">
      <input id="t" placeholder="2-291624-..." autocomplete="off" spellcheck="false" />
      <button onclick="send()">Отправить в Horeum</button>
    </div>
    <div class="ok" id="ok">Готово! Возвращайтесь в Horeum — аккаунт уже подключён.</div>
    <div class="hint">Токен уходит только на локальный адрес 127.0.0.1 и хранится на вашем компьютере.</div>
  </div>
<script>
async function send() {{
  var v = document.getElementById('t').value.trim();
  if (v.length < 10) return;
  await fetch('/sc-token?token=' + encodeURIComponent(v));
  document.getElementById('ok').style.display = 'block';
}}
document.getElementById('t').addEventListener('keydown', function (e) {{ if (e.key === 'Enter') send(); }});
</script>
</body>
</html>"##,
        snippet = snippet
    )
}
