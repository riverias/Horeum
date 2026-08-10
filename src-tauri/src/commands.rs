//! Мост между фронтендом и Rust-ядром.

use crate::db::{Playlist, ProfilePatch, Stats};
use crate::error::{HoreumError, Result};
use crate::lyrics::Lyrics;
use crate::models::{ScPlaylist, ScUser, StreamInfo, Track};
use crate::profile::{unlockables, Achievement, Profile, Unlockable};
use crate::soundcloud::{collection_tracks, GENRES};
use crate::wave::{self, Mood};
use crate::AppState;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
pub struct GenreInfo {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SessionInfo {
    pub logged_in: bool,
    pub client_id_ready: bool,
    pub user: Option<ScUser>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchBundle {
    pub tracks: Vec<Track>,
    pub playlists: Vec<ScPlaylist>,
    pub users: Vec<ScUser>,
}

// ------------------------------------------------------------------ system

#[tauri::command]
pub async fn sc_init(state: State<'_, AppState>) -> Result<String> {
    let id = state.sc.refresh_client_id().await?;
    Ok(id)
}

#[tauri::command]
pub async fn sc_session(state: State<'_, AppState>) -> Result<SessionInfo> {
    let logged_in = state.sc.is_logged_in();
    let user = if logged_in {
        state.sc.me().await.ok()
    } else {
        None
    };
    Ok(SessionInfo {
        logged_in: logged_in && user.is_some(),
        client_id_ready: state.sc.current_client_id().is_some(),
        user,
    })
}

#[tauri::command]
pub async fn sc_login(state: State<'_, AppState>, token: String) -> Result<ScUser> {
    state.sc.set_oauth(Some(token.trim().to_string()));
    match state.sc.me().await {
        Ok(user) => {
            state.db.set_setting("sc_oauth_token", token.trim())?;
            Ok(user)
        }
        Err(e) => {
            state.sc.set_oauth(None);
            Err(HoreumError::Auth(format!("токен отклонён: {e}")))
        }
    }
}

#[tauri::command]
pub async fn sc_logout(state: State<'_, AppState>) -> Result<()> {
    state.sc.set_oauth(None);
    state.db.delete_setting("sc_oauth_token")?;
    Ok(())
}

#[tauri::command]
pub fn genres() -> Vec<GenreInfo> {
    GENRES
        .iter()
        .map(|(id, name)| GenreInfo {
            id: (*id).to_string(),
            name: (*name).to_string(),
        })
        .collect()
}

// ------------------------------------------------------------------ search

#[tauri::command]
pub async fn search_tracks(
    state: State<'_, AppState>,
    query: String,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<Track>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    state
        .sc
        .search_tracks(query.trim(), limit.unwrap_or(50), offset.unwrap_or(0))
        .await
}

#[tauri::command]
pub async fn search_all(state: State<'_, AppState>, query: String) -> Result<SearchBundle> {
    let q = query.trim().to_string();
    if q.is_empty() {
        return Ok(SearchBundle {
            tracks: vec![],
            playlists: vec![],
            users: vec![],
        });
    }
    let (tracks, playlists, users) = futures::join!(
        state.sc.search_tracks(&q, 50, 0),
        state.sc.search_playlists(&q, 12),
        state.sc.search_users(&q, 12)
    );
    Ok(SearchBundle {
        tracks: tracks?,
        playlists: playlists.unwrap_or_default(),
        users: users.unwrap_or_default(),
    })
}

#[tauri::command]
pub async fn autocomplete(state: State<'_, AppState>, query: String) -> Result<Vec<String>> {
    if query.trim().len() < 2 {
        return Ok(vec![]);
    }
    state.sc.autocomplete(query.trim()).await
}

#[tauri::command]
pub async fn charts(
    state: State<'_, AppState>,
    kind: Option<String>,
    genre: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<Track>> {
    state
        .sc
        .charts(
            kind.as_deref().unwrap_or("top"),
            genre.as_deref().unwrap_or("all-music"),
            limit.unwrap_or(50),
        )
        .await
}

#[tauri::command]
pub async fn related_tracks(state: State<'_, AppState>, track_id: i64) -> Result<Vec<Track>> {
    state.sc.related(track_id, 40).await
}

#[tauri::command]
pub async fn stream_url(state: State<'_, AppState>, track_id: i64) -> Result<StreamInfo> {
    state.sc.stream_url(track_id).await
}

#[tauri::command]
pub async fn sc_user(state: State<'_, AppState>, user_id: i64) -> Result<ScUser> {
    state.sc.user(user_id).await
}

#[tauri::command]
pub async fn sc_user_tracks(
    state: State<'_, AppState>,
    user_id: i64,
    limit: Option<u32>,
) -> Result<Vec<Track>> {
    state.sc.user_tracks(user_id, limit.unwrap_or(50)).await
}

#[tauri::command]
pub async fn sc_playlist(state: State<'_, AppState>, playlist_id: i64) -> Result<ScPlaylist> {
    state.sc.playlist(playlist_id).await
}

/// Импорт любой ссылки SoundCloud (трек / плейлист / профиль) → список треков.
#[tauri::command]
pub async fn resolve_link(state: State<'_, AppState>, url: String) -> Result<Vec<Track>> {
    let data = state.sc.resolve(&url).await?;
    let kind = data.get("kind").and_then(|k| k.as_str()).unwrap_or("");
    match kind {
        "track" => Ok(Track::from_json(&data).into_iter().collect()),
        "playlist" => {
            let id = data
                .get("id")
                .and_then(|i| i.as_i64())
                .ok_or_else(|| HoreumError::NotFound("playlist id".into()))?;
            Ok(state.sc.playlist(id).await?.tracks)
        }
        "user" => {
            let id = data
                .get("id")
                .and_then(|i| i.as_i64())
                .ok_or_else(|| HoreumError::NotFound("user id".into()))?;
            state.sc.user_tracks(id, 60).await
        }
        _ => Ok(collection_tracks(&data)),
    }
}

// ----------------------------------------------------------------- account

#[tauri::command]
pub async fn my_likes(state: State<'_, AppState>, limit: Option<u32>) -> Result<Vec<Track>> {
    state.sc.my_likes(limit.unwrap_or(200)).await
}

#[tauri::command]
pub async fn my_sc_playlists(state: State<'_, AppState>) -> Result<Vec<ScPlaylist>> {
    state.sc.my_playlists(50).await
}

#[tauri::command]
pub async fn my_stream(state: State<'_, AppState>, limit: Option<u32>) -> Result<Vec<Track>> {
    state.sc.my_stream(limit.unwrap_or(60)).await
}

/// Синхронизирует лайки аккаунта SoundCloud в локальную библиотеку.
#[tauri::command]
pub async fn sync_sc_likes(state: State<'_, AppState>) -> Result<usize> {
    let tracks = state.sc.my_likes(200).await?;
    for t in tracks.iter() {
        state.db.like(t)?;
    }
    state.db.evaluate_achievements()?;
    Ok(tracks.len())
}

// ----------------------------------------------------------------- library

#[tauri::command]
pub async fn toggle_like(
    state: State<'_, AppState>,
    track: Track,
    remote: Option<bool>,
) -> Result<bool> {
    let liked = state.db.is_liked(track.id)?;
    if liked {
        state.db.unlike(track.id)?;
    } else {
        state.db.like(&track)?;
        state.db.add_xp(5)?;
    }
    if remote.unwrap_or(false) && state.sc.is_logged_in() {
        state.sc.set_remote_like(track.id, !liked).await.ok();
    }
    state.db.evaluate_achievements()?;
    Ok(!liked)
}

#[tauri::command]
pub fn liked_tracks(
    state: State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<Track>> {
    state.db.liked(limit.unwrap_or(500), offset.unwrap_or(0))
}

#[tauri::command]
pub fn liked_ids(state: State<'_, AppState>) -> Result<Vec<i64>> {
    state.db.liked_ids()
}

#[tauri::command]
pub fn history(state: State<'_, AppState>, limit: Option<i64>) -> Result<Vec<Track>> {
    state.db.history(limit.unwrap_or(200))
}

#[tauri::command]
pub fn clear_history(state: State<'_, AppState>) -> Result<()> {
    state.db.clear_history()
}

#[tauri::command]
pub fn block_track(state: State<'_, AppState>, track_id: i64) -> Result<()> {
    state.db.block_track(track_id)
}

/// Запись прослушивания + начисление XP + проверка ачивок.
#[derive(Debug, Clone, Serialize)]
pub struct PlayResult {
    pub profile: Profile,
    pub unlocked: Vec<Achievement>,
    pub xp_gained: i64,
}

#[tauri::command]
pub fn record_play(
    state: State<'_, AppState>,
    track: Track,
    seconds: i64,
    source: Option<String>,
) -> Result<PlayResult> {
    let src = source.unwrap_or_else(|| "library".into());
    state.db.record_play(&track, seconds, &src)?;
    // 1 XP за каждые 30 секунд, максимум 20 за трек, +3 бонус за «Волну»
    let mut xp = (seconds / 30).clamp(0, 20);
    if src == "wave" {
        xp += 3;
    }
    let profile = state.db.add_xp(xp)?;
    let unlocked = state.db.evaluate_achievements()?;
    Ok(PlayResult {
        profile,
        unlocked,
        xp_gained: xp,
    })
}

// --------------------------------------------------------------- playlists

#[tauri::command]
pub fn playlists(state: State<'_, AppState>) -> Result<Vec<Playlist>> {
    state.db.playlists()
}

#[tauri::command]
pub fn playlist(state: State<'_, AppState>, id: i64) -> Result<Playlist> {
    state.db.playlist(id)
}

#[tauri::command]
pub fn create_playlist(
    state: State<'_, AppState>,
    name: String,
    description: Option<String>,
    color: Option<String>,
) -> Result<Playlist> {
    let pl = state.db.create_playlist(
        &name,
        description.unwrap_or_default().as_str(),
        color.unwrap_or_else(|| "violet".into()).as_str(),
    )?;
    state.db.add_xp(10)?;
    state.db.evaluate_achievements()?;
    Ok(pl)
}

#[tauri::command]
pub fn update_playlist(
    state: State<'_, AppState>,
    id: i64,
    name: Option<String>,
    description: Option<String>,
    cover: Option<String>,
    color: Option<String>,
    pinned: Option<bool>,
) -> Result<Playlist> {
    state
        .db
        .update_playlist(id, name, description, cover, color, pinned)
}

#[tauri::command]
pub fn delete_playlist(state: State<'_, AppState>, id: i64) -> Result<()> {
    state.db.delete_playlist(id)
}

#[tauri::command]
pub fn add_to_playlist(
    state: State<'_, AppState>,
    id: i64,
    tracks: Vec<Track>,
) -> Result<Playlist> {
    state.db.add_to_playlist(id, &tracks)
}

#[tauri::command]
pub fn remove_from_playlist(
    state: State<'_, AppState>,
    id: i64,
    track_id: i64,
) -> Result<Playlist> {
    state.db.remove_from_playlist(id, track_id)
}

#[tauri::command]
pub fn reorder_playlist(
    state: State<'_, AppState>,
    id: i64,
    order: Vec<i64>,
) -> Result<Playlist> {
    state.db.reorder_playlist(id, &order)
}

/// Импорт плейлиста SoundCloud в локальный.
#[tauri::command]
pub async fn import_sc_playlist(state: State<'_, AppState>, url: String) -> Result<Playlist> {
    let data = state.sc.resolve(&url).await?;
    let id = data
        .get("id")
        .and_then(|i| i.as_i64())
        .ok_or_else(|| HoreumError::NotFound("playlist".into()))?;
    let sc_pl = state.sc.playlist(id).await?;
    let local = state
        .db
        .create_playlist(&sc_pl.title, "Импорт из SoundCloud", "cyan")?;
    state.db.add_to_playlist(local.id, &sc_pl.tracks)
}

// ------------------------------------------------------------------ lyrics

#[tauri::command]
pub async fn lyrics(
    state: State<'_, AppState>,
    track_id: i64,
    artist: String,
    title: String,
    duration_ms: i64,
    force: Option<bool>,
) -> Result<Lyrics> {
    if !force.unwrap_or(false) {
        if let Some(cached) = state.db.cached_lyrics(track_id)? {
            if !cached.synced.is_empty() || cached.plain.is_some() {
                return Ok(cached);
            }
        }
    }
    let fetched = state
        .lyrics
        .fetch(track_id, &artist, &title, duration_ms / 1000)
        .await?;
    state.db.cache_lyrics(&fetched)?;
    Ok(fetched)
}

// ------------------------------------------------------------- wave / mood

#[tauri::command]
pub fn moods() -> Vec<Mood> {
    wave::moods()
}

#[tauri::command]
pub async fn build_wave(
    state: State<'_, AppState>,
    seed_track_id: Option<i64>,
    limit: Option<usize>,
    discovery: Option<f32>,
) -> Result<Vec<Track>> {
    wave::build_wave(
        &state.sc,
        &state.db,
        seed_track_id,
        limit.unwrap_or(60),
        discovery.unwrap_or(0.55),
    )
    .await
}

#[tauri::command]
pub async fn mood_queue(
    state: State<'_, AppState>,
    mood_id: String,
    limit: Option<usize>,
) -> Result<Vec<Track>> {
    wave::build_mood_queue(&state.sc, &state.db, &mood_id, limit.unwrap_or(60)).await
}

// ----------------------------------------------------------------- profile

#[tauri::command]
pub fn profile(state: State<'_, AppState>) -> Result<Profile> {
    state.db.profile()
}

#[tauri::command]
pub fn update_profile(state: State<'_, AppState>, patch: ProfilePatch) -> Result<Profile> {
    state.db.update_profile(patch)
}

#[tauri::command]
pub fn cosmetics() -> Vec<Unlockable> {
    unlockables()
}

#[tauri::command]
pub fn achievements(state: State<'_, AppState>) -> Result<Vec<Achievement>> {
    state.db.achievements()
}

#[tauri::command]
pub fn stats(state: State<'_, AppState>) -> Result<Stats> {
    state.db.stats()
}

// ---------------------------------------------------------------- settings

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<serde_json::Value> {
    state.db.all_settings()
}

#[tauri::command]
pub fn set_setting(
    state: State<'_, AppState>,
    key: String,
    value: serde_json::Value,
) -> Result<()> {
    if key == "sc_oauth_token" {
        return Err(HoreumError::Other("используйте sc_login".into()));
    }
    state.db.set_setting(&key, &value.to_string())
}
