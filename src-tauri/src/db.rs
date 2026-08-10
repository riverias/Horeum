//! Локальное хранилище Horeum (SQLite).

use crate::error::{HoreumError, Result};
use crate::lyrics::{LyricLine, Lyrics};
use crate::models::Track;
use crate::profile::{level_for_xp, level_title, xp_for_level, Achievement, Profile, ACHIEVEMENTS};
use chrono::{Duration as ChronoDuration, Local, NaiveDate, Utc};
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;

const SCHEMA: &str = r#"
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile (
    id                INTEGER PRIMARY KEY CHECK (id = 1),
    display_name      TEXT NOT NULL DEFAULT 'Слушатель',
    bio               TEXT NOT NULL DEFAULT '',
    avatar            TEXT,
    banner            TEXT,
    xp                INTEGER NOT NULL DEFAULT 0,
    background        TEXT NOT NULL DEFAULT 'midnight',
    frame             TEXT NOT NULL DEFAULT 'none',
    accent            TEXT NOT NULL DEFAULT 'violet',
    streak            INTEGER NOT NULL DEFAULT 0,
    last_active       TEXT,
    tracks_played     INTEGER NOT NULL DEFAULT 0,
    seconds_listened  INTEGER NOT NULL DEFAULT 0,
    wave_plays        INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS liked_tracks (
    track_id INTEGER PRIMARY KEY,
    payload  TEXT NOT NULL,
    liked_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS history (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id  INTEGER NOT NULL,
    payload   TEXT NOT NULL,
    seconds   INTEGER NOT NULL DEFAULT 0,
    source    TEXT NOT NULL DEFAULT 'library',
    played_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_played ON history(played_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_track  ON history(track_id);

CREATE TABLE IF NOT EXISTS playlists (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    cover       TEXT,
    color       TEXT NOT NULL DEFAULT 'violet',
    pinned      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id    INTEGER NOT NULL,
    payload     TEXT NOT NULL,
    position    INTEGER NOT NULL,
    added_at    TEXT NOT NULL,
    PRIMARY KEY (playlist_id, track_id)
);

CREATE TABLE IF NOT EXISTS achievements (
    code        TEXT PRIMARY KEY,
    unlocked_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lyrics_cache (
    track_id   INTEGER PRIMARY KEY,
    synced     TEXT NOT NULL,
    plain      TEXT,
    source     TEXT NOT NULL,
    fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blocked_tracks (
    track_id   INTEGER PRIMARY KEY,
    blocked_at TEXT NOT NULL
);
"#;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub description: String,
    pub cover: Option<String>,
    pub color: String,
    pub pinned: bool,
    pub track_count: i64,
    pub duration: i64,
    pub created_at: String,
    pub updated_at: String,
    pub tracks: Vec<Track>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtistStat {
    pub artist: String,
    pub artist_id: i64,
    pub avatar: Option<String>,
    pub plays: i64,
    pub seconds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenreStat {
    pub genre: String,
    pub plays: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayStat {
    pub day: String,
    pub minutes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stats {
    pub tracks_played: i64,
    pub unique_tracks: i64,
    pub unique_artists: i64,
    pub minutes_listened: i64,
    pub likes: i64,
    pub playlists: i64,
    pub streak: i64,
    pub top_artists: Vec<ArtistStat>,
    pub top_genres: Vec<GenreStat>,
    pub last_14_days: Vec<DayStat>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProfilePatch {
    pub display_name: Option<String>,
    pub bio: Option<String>,
    pub avatar: Option<String>,
    pub banner: Option<String>,
    pub background: Option<String>,
    pub frame: Option<String>,
    pub accent: Option<String>,
}

pub struct Db {
    conn: Mutex<Connection>,
}

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).ok();
        }
        let conn = Connection::open(path)?;
        conn.execute_batch(SCHEMA)?;
        conn.execute(
            "INSERT OR IGNORE INTO profile (id, created_at) VALUES (1, ?1)",
            params![Utc::now().to_rfc3339()],
        )?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    // ------------------------------------------------------------- settings

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn.lock().execute(
            "INSERT INTO settings(key,value) VALUES(?1,?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn.lock();
        let v = conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |r| r.get::<_, String>(0),
            )
            .optional()?;
        Ok(v)
    }

    pub fn delete_setting(&self, key: &str) -> Result<()> {
        self.conn
            .lock()
            .execute("DELETE FROM settings WHERE key = ?1", params![key])?;
        Ok(())
    }

    pub fn all_settings(&self) -> Result<serde_json::Value> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
        let mut map = serde_json::Map::new();
        let rows = stmt.query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (k, v) = row?;
            if k == "sc_oauth_token" {
                continue; // токен не отдаём во фронтенд
            }
            let parsed: serde_json::Value =
                serde_json::from_str(&v).unwrap_or(serde_json::Value::String(v));
            map.insert(k, parsed);
        }
        Ok(serde_json::Value::Object(map))
    }

    // -------------------------------------------------------------- profile

    pub fn profile(&self) -> Result<Profile> {
        let conn = self.conn.lock();
        let p = conn.query_row(
            "SELECT display_name, bio, avatar, banner, xp, background, frame, accent,
                    streak, tracks_played, seconds_listened, created_at
             FROM profile WHERE id = 1",
            [],
            |r| {
                let xp: i64 = r.get(4)?;
                let level = level_for_xp(xp);
                let level_xp = xp_for_level(level);
                let next = xp_for_level(level + 1);
                let span = (next - level_xp).max(1);
                Ok(Profile {
                    display_name: r.get(0)?,
                    bio: r.get(1)?,
                    avatar: r.get(2)?,
                    banner: r.get(3)?,
                    xp,
                    level,
                    level_xp,
                    next_level_xp: next,
                    progress: ((xp - level_xp) as f64 / span as f64).clamp(0.0, 1.0),
                    title: level_title(level).to_string(),
                    background: r.get(5)?,
                    frame: r.get(6)?,
                    accent: r.get(7)?,
                    streak: r.get(8)?,
                    tracks_played: r.get(9)?,
                    seconds_listened: r.get(10)?,
                    created_at: r.get(11)?,
                })
            },
        )?;
        Ok(p)
    }

    pub fn update_profile(&self, patch: ProfilePatch) -> Result<Profile> {
        {
            let conn = self.conn.lock();
            let set = |col: &str, val: Option<String>| -> Result<()> {
                if let Some(v) = val {
                    conn.execute(
                        &format!("UPDATE profile SET {col} = ?1 WHERE id = 1"),
                        params![v],
                    )?;
                }
                Ok(())
            };
            set("display_name", patch.display_name)?;
            set("bio", patch.bio)?;
            set("avatar", patch.avatar)?;
            set("banner", patch.banner)?;
            set("background", patch.background)?;
            set("frame", patch.frame)?;
            set("accent", patch.accent)?;
        }
        self.profile()
    }

    pub fn add_xp(&self, amount: i64) -> Result<Profile> {
        self.conn.lock().execute(
            "UPDATE profile SET xp = MAX(0, xp + ?1) WHERE id = 1",
            params![amount],
        )?;
        self.profile()
    }

    fn bump_streak(&self) -> Result<()> {
        let conn = self.conn.lock();
        let last: Option<String> = conn
            .query_row("SELECT last_active FROM profile WHERE id = 1", [], |r| {
                r.get(0)
            })
            .optional()?
            .flatten();
        let today = Local::now().date_naive();
        let today_s = today.to_string();
        let new_streak = match last.as_deref().and_then(|d| d.parse::<NaiveDate>().ok()) {
            Some(d) if d == today => return Ok(()),
            Some(d) if today - d == ChronoDuration::days(1) => {
                let cur: i64 =
                    conn.query_row("SELECT streak FROM profile WHERE id = 1", [], |r| r.get(0))?;
                cur + 1
            }
            _ => 1,
        };
        conn.execute(
            "UPDATE profile SET streak = ?1, last_active = ?2 WHERE id = 1",
            params![new_streak, today_s],
        )?;
        Ok(())
    }

    // ---------------------------------------------------------------- likes

    pub fn like(&self, track: &Track) -> Result<()> {
        let payload = serde_json::to_string(track)?;
        self.conn.lock().execute(
            "INSERT INTO liked_tracks(track_id,payload,liked_at) VALUES(?1,?2,?3)
             ON CONFLICT(track_id) DO UPDATE SET payload = excluded.payload",
            params![track.id, payload, Utc::now().to_rfc3339()],
        )?;
        Ok(())
    }

    pub fn unlike(&self, track_id: i64) -> Result<()> {
        self.conn.lock().execute(
            "DELETE FROM liked_tracks WHERE track_id = ?1",
            params![track_id],
        )?;
        Ok(())
    }

    pub fn is_liked(&self, track_id: i64) -> Result<bool> {
        let conn = self.conn.lock();
        let found: Option<i64> = conn
            .query_row(
                "SELECT track_id FROM liked_tracks WHERE track_id = ?1",
                params![track_id],
                |r| r.get(0),
            )
            .optional()?;
        Ok(found.is_some())
    }

    pub fn liked_ids(&self) -> Result<Vec<i64>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare("SELECT track_id FROM liked_tracks")?;
        let ids: Vec<i64> = stmt
            .query_map([], |r| r.get::<_, i64>(0))?
            .filter_map(|r| r.ok())
            .collect();
        Ok(ids)
    }

    pub fn liked(&self, limit: i64, offset: i64) -> Result<Vec<Track>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT payload FROM liked_tracks ORDER BY liked_at DESC LIMIT ?1 OFFSET ?2",
        )?;
        let tracks: Vec<Track> = stmt
            .query_map(params![limit, offset], |r| r.get::<_, String>(0))?
            .filter_map(|p| p.ok())
            .filter_map(|p| serde_json::from_str::<Track>(&p).ok())
            .collect();
        Ok(tracks)
    }

    // -------------------------------------------------------------- history

    pub fn record_play(&self, track: &Track, seconds: i64, source: &str) -> Result<()> {
        let payload = serde_json::to_string(track)?;
        {
            let conn = self.conn.lock();
            conn.execute(
                "INSERT INTO history(track_id,payload,seconds,source,played_at)
                 VALUES(?1,?2,?3,?4,?5)",
                params![
                    track.id,
                    payload,
                    seconds.max(0),
                    source,
                    Utc::now().to_rfc3339()
                ],
            )?;
            conn.execute(
                "UPDATE profile
                 SET tracks_played = tracks_played + 1,
                     seconds_listened = seconds_listened + ?1,
                     wave_plays = wave_plays + ?2
                 WHERE id = 1",
                params![seconds.max(0), i64::from(source == "wave")],
            )?;
        }
        self.bump_streak()?;
        Ok(())
    }

    pub fn history(&self, limit: i64) -> Result<Vec<Track>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT payload, MAX(played_at) AS last
             FROM history GROUP BY track_id ORDER BY last DESC LIMIT ?1",
        )?;
        let tracks: Vec<Track> = stmt
            .query_map(params![limit], |r| r.get::<_, String>(0))?
            .filter_map(|p| p.ok())
            .filter_map(|p| serde_json::from_str::<Track>(&p).ok())
            .collect();
        Ok(tracks)
    }

    pub fn recent_track_ids(&self, limit: i64) -> Result<Vec<i64>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare("SELECT track_id FROM history ORDER BY id DESC LIMIT ?1")?;
        let ids: Vec<i64> = stmt
            .query_map(params![limit], |r| r.get::<_, i64>(0))?
            .filter_map(|r| r.ok())
            .collect();
        Ok(ids)
    }

    pub fn clear_history(&self) -> Result<()> {
        self.conn.lock().execute("DELETE FROM history", [])?;
        Ok(())
    }

    pub fn top_artists(&self, limit: i64) -> Result<Vec<ArtistStat>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT payload, COUNT(*) AS plays, SUM(seconds) AS secs
             FROM history GROUP BY json_extract(payload,'$.artist_id')
             ORDER BY plays DESC LIMIT ?1",
        )?;
        let rows: Vec<(String, i64, i64)> = stmt
            .query_map(params![limit], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, Option<i64>>(2)?.unwrap_or(0),
                ))
            })?
            .filter_map(|r| r.ok())
            .collect();
        let mut out = Vec::new();
        for (payload, plays, secs) in rows {
            if let Ok(t) = serde_json::from_str::<Track>(&payload) {
                out.push(ArtistStat {
                    artist: t.artist,
                    artist_id: t.artist_id,
                    avatar: t.artist_avatar,
                    plays,
                    seconds: secs,
                });
            }
        }
        Ok(out)
    }

    pub fn top_genres(&self, limit: i64) -> Result<Vec<GenreStat>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT COALESCE(NULLIF(json_extract(payload,'$.genre'),''),'Без жанра') AS g,
                    COUNT(*) AS plays
             FROM history GROUP BY g ORDER BY plays DESC LIMIT ?1",
        )?;
        let rows: Vec<GenreStat> = stmt
            .query_map(params![limit], |r| {
                Ok(GenreStat {
                    genre: r.get::<_, String>(0)?,
                    plays: r.get::<_, i64>(1)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(rows)
    }

    pub fn stats(&self) -> Result<Stats> {
        let profile = self.profile()?;
        let top_artists = self.top_artists(10)?;
        let top_genres = self.top_genres(8)?;
        let conn = self.conn.lock();
        let unique_tracks: i64 =
            conn.query_row("SELECT COUNT(DISTINCT track_id) FROM history", [], |r| {
                r.get(0)
            })?;
        let unique_artists: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT json_extract(payload,'$.artist_id')) FROM history",
            [],
            |r| r.get(0),
        )?;
        let likes: i64 = conn.query_row("SELECT COUNT(*) FROM liked_tracks", [], |r| r.get(0))?;
        let playlists: i64 = conn.query_row("SELECT COUNT(*) FROM playlists", [], |r| r.get(0))?;

        let since = (Utc::now() - ChronoDuration::days(14)).to_rfc3339();
        let mut stmt = conn.prepare(
            "SELECT substr(played_at,1,10) AS d, SUM(seconds)/60 AS m
             FROM history WHERE played_at >= ?1 GROUP BY d ORDER BY d",
        )?;
        let last_14_days: Vec<DayStat> = stmt
            .query_map(params![since], |r| {
                Ok(DayStat {
                    day: r.get::<_, String>(0)?,
                    minutes: r.get::<_, Option<i64>>(1)?.unwrap_or(0),
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(Stats {
            tracks_played: profile.tracks_played,
            unique_tracks,
            unique_artists,
            minutes_listened: profile.seconds_listened / 60,
            likes,
            playlists,
            streak: profile.streak,
            top_artists,
            top_genres,
            last_14_days,
        })
    }

    // ------------------------------------------------------------ playlists

    pub fn create_playlist(&self, name: &str, description: &str, color: &str) -> Result<Playlist> {
        let now = Utc::now().to_rfc3339();
        let id = {
            let conn = self.conn.lock();
            conn.execute(
                "INSERT INTO playlists(name,description,color,created_at,updated_at)
                 VALUES(?1,?2,?3,?4,?4)",
                params![name, description, color, now],
            )?;
            conn.last_insert_rowid()
        };
        self.playlist(id)
    }

    pub fn update_playlist(
        &self,
        id: i64,
        name: Option<String>,
        description: Option<String>,
        cover: Option<String>,
        color: Option<String>,
        pinned: Option<bool>,
    ) -> Result<Playlist> {
        {
            let conn = self.conn.lock();
            if let Some(v) = name {
                conn.execute("UPDATE playlists SET name=?1 WHERE id=?2", params![v, id])?;
            }
            if let Some(v) = description {
                conn.execute(
                    "UPDATE playlists SET description=?1 WHERE id=?2",
                    params![v, id],
                )?;
            }
            if let Some(v) = cover {
                conn.execute("UPDATE playlists SET cover=?1 WHERE id=?2", params![v, id])?;
            }
            if let Some(v) = color {
                conn.execute("UPDATE playlists SET color=?1 WHERE id=?2", params![v, id])?;
            }
            if let Some(v) = pinned {
                conn.execute(
                    "UPDATE playlists SET pinned=?1 WHERE id=?2",
                    params![i64::from(v), id],
                )?;
            }
            conn.execute(
                "UPDATE playlists SET updated_at=?1 WHERE id=?2",
                params![Utc::now().to_rfc3339(), id],
            )?;
        }
        self.playlist(id)
    }

    pub fn delete_playlist(&self, id: i64) -> Result<()> {
        self.conn
            .lock()
            .execute("DELETE FROM playlists WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn playlists(&self) -> Result<Vec<Playlist>> {
        let ids: Vec<i64> = {
            let conn = self.conn.lock();
            let mut stmt =
                conn.prepare("SELECT id FROM playlists ORDER BY pinned DESC, updated_at DESC")?;
            let ids: Vec<i64> = stmt
                .query_map([], |r| r.get::<_, i64>(0))?
                .filter_map(|r| r.ok())
                .collect();
            ids
        };
        ids.into_iter().map(|id| self.playlist(id)).collect()
    }

    pub fn playlist(&self, id: i64) -> Result<Playlist> {
        let conn = self.conn.lock();
        let tracks: Vec<Track> = {
            let mut stmt = conn.prepare(
                "SELECT payload FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY position ASC",
            )?;
            let tracks: Vec<Track> = stmt
                .query_map(params![id], |r| r.get::<_, String>(0))?
                .filter_map(|p| p.ok())
                .filter_map(|p| serde_json::from_str::<Track>(&p).ok())
                .collect();
            tracks
        };

        let duration = tracks.iter().map(|t| t.duration).sum::<i64>();
        let cover_fallback = tracks.iter().find_map(|t| t.artwork.clone());

        conn.query_row(
            "SELECT id,name,description,cover,color,pinned,created_at,updated_at
             FROM playlists WHERE id = ?1",
            params![id],
            |r| {
                Ok(Playlist {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    description: r.get(2)?,
                    cover: r.get::<_, Option<String>>(3)?.or(cover_fallback.clone()),
                    color: r.get(4)?,
                    pinned: r.get::<_, i64>(5)? == 1,
                    track_count: tracks.len() as i64,
                    duration,
                    created_at: r.get(6)?,
                    updated_at: r.get(7)?,
                    tracks: tracks.clone(),
                })
            },
        )
        .map_err(|_| HoreumError::NotFound(format!("playlist {id}")))
    }

    pub fn add_to_playlist(&self, id: i64, tracks: &[Track]) -> Result<Playlist> {
        {
            let conn = self.conn.lock();
            let mut pos: i64 = conn
                .query_row(
                    "SELECT COALESCE(MAX(position), -1) FROM playlist_tracks WHERE playlist_id=?1",
                    params![id],
                    |r| r.get(0),
                )
                .unwrap_or(-1);
            let now = Utc::now().to_rfc3339();
            for t in tracks {
                pos += 1;
                let payload = serde_json::to_string(t)?;
                conn.execute(
                    "INSERT INTO playlist_tracks(playlist_id,track_id,payload,position,added_at)
                     VALUES(?1,?2,?3,?4,?5)
                     ON CONFLICT(playlist_id,track_id) DO UPDATE SET payload = excluded.payload",
                    params![id, t.id, payload, pos, now],
                )?;
            }
            conn.execute(
                "UPDATE playlists SET updated_at=?1 WHERE id=?2",
                params![now, id],
            )?;
        }
        self.playlist(id)
    }

    pub fn remove_from_playlist(&self, id: i64, track_id: i64) -> Result<Playlist> {
        self.conn.lock().execute(
            "DELETE FROM playlist_tracks WHERE playlist_id=?1 AND track_id=?2",
            params![id, track_id],
        )?;
        self.playlist(id)
    }

    pub fn reorder_playlist(&self, id: i64, order: &[i64]) -> Result<Playlist> {
        {
            let conn = self.conn.lock();
            for (i, track_id) in order.iter().enumerate() {
                conn.execute(
                    "UPDATE playlist_tracks SET position=?1 WHERE playlist_id=?2 AND track_id=?3",
                    params![i as i64, id, track_id],
                )?;
            }
        }
        self.playlist(id)
    }

    // --------------------------------------------------------- lyrics cache

    pub fn cache_lyrics(&self, lyrics: &Lyrics) -> Result<()> {
        let synced = serde_json::to_string(&lyrics.synced)?;
        self.conn.lock().execute(
            "INSERT INTO lyrics_cache(track_id,synced,plain,source,fetched_at)
             VALUES(?1,?2,?3,?4,?5)
             ON CONFLICT(track_id) DO UPDATE SET
                synced = excluded.synced, plain = excluded.plain,
                source = excluded.source, fetched_at = excluded.fetched_at",
            params![
                lyrics.track_id,
                synced,
                lyrics.plain,
                lyrics.source,
                Utc::now().to_rfc3339()
            ],
        )?;
        Ok(())
    }

    pub fn cached_lyrics(&self, track_id: i64) -> Result<Option<Lyrics>> {
        let conn = self.conn.lock();
        let row = conn
            .query_row(
                "SELECT synced, plain, source FROM lyrics_cache WHERE track_id = ?1",
                params![track_id],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, Option<String>>(1)?,
                        r.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()?;
        Ok(row.map(|(synced, plain, source)| Lyrics {
            track_id,
            synced: serde_json::from_str::<Vec<LyricLine>>(&synced).unwrap_or_default(),
            plain,
            source,
            matched_artist: None,
            matched_title: None,
            instrumental: false,
        }))
    }

    // --------------------------------------------------------- achievements

    pub fn achievements(&self) -> Result<Vec<Achievement>> {
        let stats = self.stats()?;
        let profile = self.profile()?;
        let wave_plays: i64 = self
            .conn
            .lock()
            .query_row("SELECT wave_plays FROM profile WHERE id = 1", [], |r| {
                r.get(0)
            })
            .unwrap_or(0);

        let conn = self.conn.lock();
        let mut out = Vec::new();
        for def in ACHIEVEMENTS.iter() {
            let current = match def.metric {
                "tracks_played" => profile.tracks_played,
                "seconds_listened" => profile.seconds_listened,
                "likes" => stats.likes,
                "playlists" => stats.playlists,
                "artists" => stats.unique_artists,
                "streak" => profile.streak,
                "wave_plays" => wave_plays,
                _ => 0,
            };
            let unlocked_at: Option<String> = conn
                .query_row(
                    "SELECT unlocked_at FROM achievements WHERE code = ?1",
                    params![def.code],
                    |r| r.get(0),
                )
                .optional()?;
            out.push(Achievement {
                code: def.code.to_string(),
                name: def.name.to_string(),
                description: def.description.to_string(),
                icon: def.icon.to_string(),
                xp: def.xp,
                unlocked: unlocked_at.is_some(),
                unlocked_at,
                progress: (current as f64 / def.threshold as f64).clamp(0.0, 1.0),
            });
        }
        Ok(out)
    }

    /// Проверяет все ачивки и выдаёт новые (с начислением XP).
    pub fn evaluate_achievements(&self) -> Result<Vec<Achievement>> {
        let all = self.achievements()?;
        let mut newly = Vec::new();
        for a in all.into_iter() {
            if !a.unlocked && a.progress >= 1.0 {
                self.conn.lock().execute(
                    "INSERT OR IGNORE INTO achievements(code, unlocked_at) VALUES(?1, ?2)",
                    params![a.code, Utc::now().to_rfc3339()],
                )?;
                self.add_xp(a.xp)?;
                newly.push(a);
            }
        }
        Ok(newly)
    }

    // --------------------------------------------------------------- blocks

    pub fn block_track(&self, track_id: i64) -> Result<()> {
        self.conn.lock().execute(
            "INSERT OR IGNORE INTO blocked_tracks(track_id, blocked_at) VALUES(?1, ?2)",
            params![track_id, Utc::now().to_rfc3339()],
        )?;
        Ok(())
    }

    pub fn blocked_ids(&self) -> Result<Vec<i64>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare("SELECT track_id FROM blocked_tracks")?;
        let ids: Vec<i64> = stmt
            .query_map([], |r| r.get::<_, i64>(0))?
            .filter_map(|r| r.ok())
            .collect();
        Ok(ids)
    }
}
