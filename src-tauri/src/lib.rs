//! Horeum — ядро приложения.

pub mod bridges;
pub mod commands;
pub mod commands_ext;
pub mod db;
pub mod downloads;
pub mod error;
pub mod lyrics;
pub mod media;
pub mod models;
pub mod profile;
pub mod server;
pub mod soundcloud;
pub mod util;
pub mod wave;
pub mod youtube;

use db::Db;
use lyrics::LyricsClient;
use soundcloud::SoundCloud;
use std::sync::Arc;
use tauri::Manager;

pub struct AppState {
    pub sc: Arc<SoundCloud>,
    pub db: Arc<Db>,
    pub lyrics: Arc<LyricsClient>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            let db = Arc::new(Db::open(&dir.join("horeum.db")).expect("failed to open database"));
            let sc = Arc::new(SoundCloud::new());

            // восстанавливаем сохранённую сессию SoundCloud
            if let Ok(Some(token)) = db.get_setting("sc_oauth_token") {
                sc.set_oauth(Some(token));
            }

            app.manage(AppState {
                sc: sc.clone(),
                db,
                lyrics: Arc::new(LyricsClient::new()),
            });

            // локальный сервер: пользовательские фоны + приём токена из окна входа
            let handle = app.handle().clone();
            let media_dir = media::media_dir(&handle).unwrap_or_else(|_| dir.join("media"));
            server::start(handle.clone(), media_dir);

            // карта id -> videoId для треков с YouTube
            youtube::load(&handle);

            // прогрев client_id в фоне, чтобы первый поиск был мгновенным
            tauri::async_runtime::spawn(async move {
                if let Err(e) = sc.refresh_client_id().await {
                    eprintln!("[horeum] client_id warmup failed: {e}");
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::sc_init,
            commands::sc_session,
            commands::sc_login,
            commands::sc_logout,
            commands::genres,
            commands::search_tracks,
            commands::search_all,
            commands::autocomplete,
            commands::charts,
            commands::related_tracks,
            commands::stream_url,
            commands::sc_user,
            commands::sc_user_tracks,
            commands::sc_playlist,
            commands::resolve_link,
            commands::my_likes,
            commands::my_sc_playlists,
            commands::my_stream,
            commands::sync_sc_likes,
            commands::toggle_like,
            commands::liked_tracks,
            commands::liked_ids,
            commands::history,
            commands::clear_history,
            commands::block_track,
            commands::record_play,
            commands::playlists,
            commands::playlist,
            commands::create_playlist,
            commands::update_playlist,
            commands::delete_playlist,
            commands::add_to_playlist,
            commands::remove_from_playlist,
            commands::reorder_playlist,
            commands::import_sc_playlist,
            commands::lyrics,
            commands::moods,
            commands::build_wave,
            commands::mood_queue,
            commands::profile,
            commands::update_profile,
            commands::cosmetics,
            commands::achievements,
            commands::stats,
            commands::get_settings,
            commands::set_setting,
            // ─── новые возможности ───
            commands_ext::local_base,
            commands_ext::pick_media,
            commands_ext::add_media_url,
            commands_ext::media_list,
            commands_ext::media_remove,
            commands_ext::image_search,
            commands_ext::download_track,
            commands_ext::downloads_list,
            commands_ext::download_remove,
            commands_ext::downloads_dir,
            commands_ext::pick_folder,
            commands_ext::reveal_path,
            commands_ext::save_text_file,
            commands_ext::open_text_file,
            commands_ext::yt_search,
            commands_ext::yt_stream_url,
            commands_ext::yt_related,
            commands_ext::import_link,
            commands_ext::parse_track_list,
            commands_ext::sc_login_window,
            commands_ext::close_login_window,
            commands_ext::sc_login_browser,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Horeum");
}
