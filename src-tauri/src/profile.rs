//! Геймификация: XP, уровни, ачивки, разблокируемые фоны / рамки / акценты.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub display_name: String,
    pub bio: String,
    pub avatar: Option<String>,
    pub banner: Option<String>,
    pub xp: i64,
    pub level: i64,
    pub level_xp: i64,
    pub next_level_xp: i64,
    pub progress: f64,
    pub title: String,
    pub background: String,
    pub frame: String,
    pub accent: String,
    pub streak: i64,
    pub tracks_played: i64,
    pub seconds_listened: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Unlockable {
    pub id: String,
    pub name: String,
    pub kind: String, // background | frame | accent
    pub level: i64,
    /// CSS-значение (градиент / цвет) для рендера во фронтенде
    pub value: String,
    pub animated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Achievement {
    pub code: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub xp: i64,
    pub unlocked: bool,
    pub unlocked_at: Option<String>,
    pub progress: f64,
}

/// Квадратичная кривая: уровень N требует 100 * (N-1)^2 XP.
pub fn xp_for_level(level: i64) -> i64 {
    if level <= 1 {
        0
    } else {
        100 * (level - 1) * (level - 1)
    }
}

pub fn level_for_xp(xp: i64) -> i64 {
    let mut level = 1;
    while xp >= xp_for_level(level + 1) && level < 200 {
        level += 1;
    }
    level
}

pub fn level_title(level: i64) -> &'static str {
    match level {
        0..=2 => "Новичок",
        3..=5 => "Слушатель",
        6..=9 => "Меломан",
        10..=14 => "Диггер",
        15..=19 => "Кратор",
        20..=29 => "Селектор",
        30..=39 => "Резидент",
        40..=54 => "Архивариус звука",
        55..=74 => "Звуковой алхимик",
        75..=99 => "Легенда эфира",
        _ => "Horeum ☆ Миф",
    }
}

pub fn unlockables() -> Vec<Unlockable> {
    let bg = |id: &str, name: &str, level: i64, value: &str, animated: bool| Unlockable {
        id: id.into(),
        name: name.into(),
        kind: "background".into(),
        level,
        value: value.into(),
        animated,
    };
    let frame = |id: &str, name: &str, level: i64, value: &str, animated: bool| Unlockable {
        id: id.into(),
        name: name.into(),
        kind: "frame".into(),
        level,
        value: value.into(),
        animated,
    };
    let accent = |id: &str, name: &str, level: i64, value: &str| Unlockable {
        id: id.into(),
        name: name.into(),
        kind: "accent".into(),
        level,
        value: value.into(),
        animated: false,
    };

    vec![
        // ---------------- backgrounds
        bg("midnight", "Полночь", 1, "linear-gradient(135deg,#0b0f1a 0%,#131a2b 100%)", false),
        bg("grape", "Виноград", 2, "linear-gradient(135deg,#2b1055 0%,#7597de 100%)", false),
        bg("sunset", "Закат", 4, "linear-gradient(135deg,#ff512f 0%,#dd2476 100%)", false),
        bg("ocean", "Глубина", 6, "linear-gradient(135deg,#005c97 0%,#363795 100%)", false),
        bg("emerald", "Изумруд", 8, "linear-gradient(135deg,#0f3443 0%,#34e89e 100%)", false),
        bg("aurora", "Северное сияние", 12, "aurora", true),
        bg("mesh", "Mesh Flow", 16, "mesh", true),
        bg("vinyl", "Винил", 20, "vinyl", true),
        bg("synthwave", "Synthwave", 25, "synthwave", true),
        bg("starfield", "Звёздное поле", 32, "starfield", true),
        bg("liquid", "Жидкий хром", 45, "liquid", true),
        bg("nebula", "Туманность Horeum", 60, "nebula", true),
        // ---------------- frames
        frame("none", "Без рамки", 1, "none", false),
        frame("thin", "Тонкая", 2, "2px solid rgba(255,255,255,.35)", false),
        frame("gold", "Золотая", 7, "3px solid #f5c451", false),
        frame("neon", "Неон", 11, "neon", true),
        frame("holo", "Голограф", 18, "holo", true),
        frame("pulse", "Пульс", 24, "pulse", true),
        frame("flame", "Пламя", 30, "flame", true),
        frame("glitch", "Глитч", 40, "glitch", true),
        frame("prism", "Призма", 55, "prism", true),
        frame("mythic", "Мифическая", 75, "mythic", true),
        // ---------------- accents
        accent("violet", "Фиолет", 1, "#8b5cf6"),
        accent("cyan", "Циан", 1, "#22d3ee"),
        accent("lime", "Лайм", 3, "#a3e635"),
        accent("rose", "Роза", 5, "#fb7185"),
        accent("amber", "Янтарь", 9, "#fbbf24"),
        accent("orchid", "Орхидея", 14, "#e879f9"),
        accent("ice", "Лёд", 22, "#93c5fd"),
        accent("crimson", "Багрянец", 35, "#ef4444"),
    ]
}

pub struct AchievementDef {
    pub code: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub icon: &'static str,
    pub xp: i64,
    /// порог по соответствующей метрике
    pub metric: &'static str,
    pub threshold: i64,
}

pub const ACHIEVEMENTS: [AchievementDef; 16] = [
    AchievementDef { code: "first_play", name: "Первый аккорд", description: "Прослушать первый трек", icon: "🎵", xp: 25, metric: "tracks_played", threshold: 1 },
    AchievementDef { code: "plays_50", name: "Разогрев", description: "50 прослушанных треков", icon: "🔥", xp: 60, metric: "tracks_played", threshold: 50 },
    AchievementDef { code: "plays_500", name: "Марафонец", description: "500 прослушанных треков", icon: "🏃", xp: 250, metric: "tracks_played", threshold: 500 },
    AchievementDef { code: "plays_5000", name: "Звуковой аддикт", description: "5000 прослушанных треков", icon: "👾", xp: 1200, metric: "tracks_played", threshold: 5000 },
    AchievementDef { code: "hours_1", name: "Час в потоке", description: "1 час прослушивания", icon: "⏱️", xp: 40, metric: "seconds_listened", threshold: 3600 },
    AchievementDef { code: "hours_24", name: "Сутки звука", description: "24 часа прослушивания", icon: "🌙", xp: 300, metric: "seconds_listened", threshold: 86_400 },
    AchievementDef { code: "hours_240", name: "Десять суток", description: "240 часов прослушивания", icon: "🌌", xp: 1500, metric: "seconds_listened", threshold: 864_000 },
    AchievementDef { code: "likes_10", name: "Сердцеед", description: "10 лайков", icon: "❤️", xp: 50, metric: "likes", threshold: 10 },
    AchievementDef { code: "likes_100", name: "Коллекционер", description: "100 лайков", icon: "💞", xp: 200, metric: "likes", threshold: 100 },
    AchievementDef { code: "playlists_3", name: "Куратор", description: "Создать 3 плейлиста", icon: "🗂️", xp: 80, metric: "playlists", threshold: 3 },
    AchievementDef { code: "playlists_10", name: "Архитектор подборок", description: "Создать 10 плейлистов", icon: "🏛️", xp: 260, metric: "playlists", threshold: 10 },
    AchievementDef { code: "artists_50", name: "Исследователь", description: "50 разных артистов", icon: "🧭", xp: 180, metric: "artists", threshold: 50 },
    AchievementDef { code: "artists_250", name: "Диггер глубин", description: "250 разных артистов", icon: "⛏️", xp: 700, metric: "artists", threshold: 250 },
    AchievementDef { code: "streak_7", name: "Неделя в ритме", description: "7 дней подряд", icon: "📅", xp: 150, metric: "streak", threshold: 7 },
    AchievementDef { code: "streak_30", name: "Месяц без пауз", description: "30 дней подряд", icon: "🏆", xp: 600, metric: "streak", threshold: 30 },
    AchievementDef { code: "wave_100", name: "Сёрфер волны", description: "100 треков из «Волны»", icon: "🌊", xp: 320, metric: "wave_plays", threshold: 100 },
];
