//! «Волна» и подборки по настроению.

use crate::db::Db;
use crate::error::Result;
use crate::models::Track;
use crate::soundcloud::SoundCloud;
use rand::seq::SliceRandom;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mood {
    pub id: String,
    pub name: String,
    pub emoji: String,
    pub gradient: String,
    pub queries: Vec<String>,
    pub genres: Vec<String>,
}

fn mood(
    id: &str,
    name: &str,
    emoji: &str,
    gradient: &str,
    queries: &[&str],
    genres: &[&str],
) -> Mood {
    Mood {
        id: id.into(),
        name: name.into(),
        emoji: emoji.into(),
        gradient: gradient.into(),
        queries: queries.iter().map(|s| s.to_string()).collect(),
        genres: genres.iter().map(|s| s.to_string()).collect(),
    }
}

pub fn moods() -> Vec<Mood> {
    vec![
        mood("chill", "Спокойствие", "🍃", "linear-gradient(135deg,#43cea2,#185a9d)",
            &["chill lofi", "calm ambient", "downtempo chill", "lofi beats to relax"],
            &["ambient", "deephouse"]),
        mood("euphoria", "Эйфория", "✨", "linear-gradient(135deg,#f857a6,#ff5858)",
            &["euphoric edm", "uplifting trance", "festival anthem", "melodic dance"],
            &["danceedm", "house"]),
        mood("rage", "Ярость", "🔥", "linear-gradient(135deg,#f12711,#f5af19)",
            &["hard trap", "phonk aggressive", "rage beat", "hardstyle"],
            &["trap", "dubstep", "metal"]),
        mood("melancholy", "Меланхолия", "🌧️", "linear-gradient(135deg,#3a6073,#16222a)",
            &["sad piano", "melancholic indie", "slowed reverb sad", "emotional ambient"],
            &["piano", "indie", "ambient"]),
        mood("focus", "Фокус", "🎯", "linear-gradient(135deg,#1f4037,#99f2c8)",
            &["deep focus study", "minimal techno focus", "concentration music", "instrumental work"],
            &["techno", "ambient", "classical"]),
        mood("nightdrive", "Ночная езда", "🚗", "linear-gradient(135deg,#0f2027,#2c5364)",
            &["night drive synthwave", "midnight city pop", "retrowave drive", "darksynth"],
            &["electronic", "house"]),
        mood("romance", "Романтика", "💞", "linear-gradient(135deg,#ee9ca7,#ffdde1)",
            &["romantic rnb", "love slow jam", "soulful ballad"],
            &["rbsoul", "pop"]),
        mood("party", "Вечеринка", "🎉", "linear-gradient(135deg,#8e2de2,#4a00e0)",
            &["party banger", "club hits mix", "dancefloor house"],
            &["house", "danceedm", "hiphoprap"]),
        mood("workout", "Тренировка", "💪", "linear-gradient(135deg,#ff4b1f,#1fddff)",
            &["workout motivation", "gym phonk", "running bpm 170"],
            &["trap", "drumbass"]),
        mood("dreamy", "Грёзы", "🌙", "linear-gradient(135deg,#654ea3,#eaafc8)",
            &["dream pop", "shoegaze ethereal", "ambient dreamscape"],
            &["indie", "ambient"]),
        mood("nostalgia", "Ностальгия", "📼", "linear-gradient(135deg,#c79081,#dfa579)",
            &["90s nostalgia mix", "old school hip hop", "vintage disco"],
            &["disco", "hiphoprap"]),
        mood("cosmic", "Космос", "🪐", "linear-gradient(135deg,#000428,#004e92)",
            &["space ambient", "cosmic psytrance", "deep space drone"],
            &["ambient", "techno"]),
    ]
}

fn dedupe_filter(tracks: Vec<Track>, seen: &mut HashSet<i64>, blocked: &HashSet<i64>) -> Vec<Track> {
    tracks
        .into_iter()
        .filter(|t| t.playable() && !blocked.contains(&t.id) && seen.insert(t.id))
        .collect()
}

/// «Волна»: персональный бесконечный поток.
///
/// Алгоритм:
/// 1. seed — явный трек либо случайные из лайков/истории
/// 2. related-треки к каждому seed
/// 3. треки любимых артистов
/// 4. чарты по топ-жанру для «свежей крови»
/// 5. убираем недавно слушанное, перемешиваем взвешенно (familiar / discovery)
pub async fn build_wave(
    sc: &SoundCloud,
    db: &Db,
    seed_track_id: Option<i64>,
    limit: usize,
    discovery: f32,
) -> Result<Vec<Track>> {
    let blocked: HashSet<i64> = db.blocked_ids()?.into_iter().collect();
    let recent: HashSet<i64> = db.recent_track_ids(60)?.into_iter().collect();
    let mut seen: HashSet<i64> = HashSet::new();

    let mut familiar: Vec<Track> = Vec::new();
    let mut discover: Vec<Track> = Vec::new();

    // ---- seeds
    let mut seeds: Vec<i64> = Vec::new();
    if let Some(id) = seed_track_id {
        seeds.push(id);
    }
    let liked = db.liked(120, 0)?;
    let history = db.history(60)?;
    {
        let mut rng = rand::thread_rng();
        let mut pool: Vec<i64> = liked
            .iter()
            .chain(history.iter())
            .map(|t| t.id)
            .filter(|id| !blocked.contains(id))
            .collect();
        pool.shuffle(&mut rng);
        pool.dedup();
        seeds.extend(pool.into_iter().take(4));
    }

    // знакомое: лайки, которые давно не играли
    familiar.extend(dedupe_filter(
        liked
            .iter()
            .filter(|t| !recent.contains(&t.id))
            .cloned()
            .collect(),
        &mut seen,
        &blocked,
    ));

    // ---- related
    for seed in seeds.iter().take(5) {
        if let Ok(rel) = sc.related(*seed, 30).await {
            discover.extend(dedupe_filter(rel, &mut seen, &blocked));
        }
    }

    // ---- любимые артисты
    for artist in db.top_artists(4)?.into_iter() {
        if artist.artist_id == 0 {
            continue;
        }
        if let Ok(tracks) = sc.user_tracks(artist.artist_id, 12).await {
            familiar.extend(dedupe_filter(tracks, &mut seen, &blocked));
        }
    }

    // ---- чарты любимого жанра
    let genre = db
        .top_genres(1)?
        .first()
        .map(|g| normalize_genre(&g.genre))
        .unwrap_or_else(|| "all-music".to_string());
    if let Ok(chart) = sc.charts("trending", &genre, 40).await {
        discover.extend(dedupe_filter(chart, &mut seen, &blocked));
    }

    // если библиотека пустая — стартовая волна из глобальных чартов
    if familiar.is_empty() && discover.is_empty() {
        let chart = sc.charts("top", "all-music", 50).await?;
        discover.extend(dedupe_filter(chart, &mut seen, &blocked));
    }

    let mut rng = rand::thread_rng();
    familiar.shuffle(&mut rng);
    discover.shuffle(&mut rng);

    let mut out: Vec<Track> = Vec::with_capacity(limit);
    let disc = discovery.clamp(0.0, 1.0);
    let (mut fi, mut di) = (0usize, 0usize);
    while out.len() < limit && (fi < familiar.len() || di < discover.len()) {
        let take_discover = rng.gen::<f32>() < disc;
        if take_discover && di < discover.len() {
            out.push(discover[di].clone());
            di += 1;
        } else if fi < familiar.len() {
            out.push(familiar[fi].clone());
            fi += 1;
        } else if di < discover.len() {
            out.push(discover[di].clone());
            di += 1;
        }
    }

    Ok(out)
}

/// Очередь по настроению.
pub async fn build_mood_queue(
    sc: &SoundCloud,
    db: &Db,
    mood_id: &str,
    limit: usize,
) -> Result<Vec<Track>> {
    let all = moods();
    let m = all
        .iter()
        .find(|m| m.id == mood_id)
        .cloned()
        .unwrap_or_else(|| all[0].clone());

    let blocked: HashSet<i64> = db.blocked_ids()?.into_iter().collect();
    let mut seen: HashSet<i64> = HashSet::new();
    let mut pool: Vec<Track> = Vec::new();

    for q in m.queries.iter() {
        if let Ok(found) = sc.search_tracks(q, 40, 0).await {
            pool.extend(dedupe_filter(found, &mut seen, &blocked));
        }
    }
    for g in m.genres.iter() {
        if let Ok(found) = sc.charts("trending", g, 30).await {
            pool.extend(dedupe_filter(found, &mut seen, &blocked));
        }
    }

    // Лёгкая ранжировка: популярность + свежесть + шум для разнообразия.
    let mut rng = rand::thread_rng();
    pool.sort_by(|a, b| {
        let sa = (a.likes_count as f64).sqrt() + (a.playback_count as f64).sqrt() / 4.0;
        let sb = (b.likes_count as f64).sqrt() + (b.playback_count as f64).sqrt() / 4.0;
        let na = sa * rng.gen_range(0.6..1.4);
        let nb = sb * rng.gen_range(0.6..1.4);
        nb.partial_cmp(&na).unwrap_or(std::cmp::Ordering::Equal)
    });

    pool.truncate(limit);
    Ok(pool)
}

fn normalize_genre(raw: &str) -> String {
    let g = raw.to_lowercase();
    let g = g.replace(['&', ' ', '-', '/'], "");
    match g.as_str() {
        "hiphop" | "rap" | "hiphoprap" => "hiphoprap".into(),
        "dnb" | "drumandbass" | "drumbass" => "drumbass".into(),
        "edm" | "dance" | "danceedm" => "danceedm".into(),
        "rnb" | "rbsoul" | "soul" => "rbsoul".into(),
        "" | "безжанра" => "all-music".into(),
        other => other.to_string(),
    }
}
