use serde::{Deserialize, Serialize};
use serde_json::Value;

fn art(url: Option<&str>) -> Option<String> {
    url.map(|u| {
        u.replace("-large.jpg", "-t500x500.jpg")
            .replace("-large.png", "-t500x500.png")
    })
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Track {
    pub id: i64,
    pub title: String,
    pub artist: String,
    pub artist_id: i64,
    pub artist_avatar: Option<String>,
    /// milliseconds
    pub duration: i64,
    pub artwork: Option<String>,
    pub permalink_url: String,
    pub genre: Option<String>,
    pub tags: Vec<String>,
    pub playback_count: i64,
    pub likes_count: i64,
    pub reposts_count: i64,
    pub comment_count: i64,
    pub created_at: Option<String>,
    pub description: Option<String>,
    pub waveform_url: Option<String>,
    pub bpm: Option<i64>,
    pub streamable: bool,
    pub policy: Option<String>,
    pub has_transcodings: bool,
}

impl Track {
    pub fn from_json(v: &Value) -> Option<Track> {
        let id = v.get("id")?.as_i64()?;
        let title = v.get("title")?.as_str()?.to_string();
        let user = v.get("user");
        let artist = user
            .and_then(|u| u.get("username"))
            .and_then(|u| u.as_str())
            .unwrap_or("Unknown artist")
            .to_string();
        let artist_id = user
            .and_then(|u| u.get("id"))
            .and_then(|u| u.as_i64())
            .unwrap_or(0);
        let artist_avatar = art(user
            .and_then(|u| u.get("avatar_url"))
            .and_then(|u| u.as_str()));
        let artwork = art(v.get("artwork_url").and_then(|a| a.as_str())).or(artist_avatar.clone());
        let tags = v
            .get("tag_list")
            .and_then(|t| t.as_str())
            .map(parse_tag_list)
            .unwrap_or_default();
        let has_transcodings = v
            .get("media")
            .and_then(|m| m.get("transcodings"))
            .and_then(|t| t.as_array())
            .map(|a| !a.is_empty())
            .unwrap_or(false);

        Some(Track {
            id,
            title,
            artist,
            artist_id,
            artist_avatar,
            duration: v
                .get("full_duration")
                .and_then(|d| d.as_i64())
                .or_else(|| v.get("duration").and_then(|d| d.as_i64()))
                .unwrap_or(0),
            artwork,
            permalink_url: v
                .get("permalink_url")
                .and_then(|p| p.as_str())
                .unwrap_or_default()
                .to_string(),
            genre: v
                .get("genre")
                .and_then(|g| g.as_str())
                .filter(|g| !g.is_empty())
                .map(|g| g.to_string()),
            tags,
            playback_count: v.get("playback_count").and_then(|p| p.as_i64()).unwrap_or(0),
            likes_count: v.get("likes_count").and_then(|p| p.as_i64()).unwrap_or(0),
            reposts_count: v.get("reposts_count").and_then(|p| p.as_i64()).unwrap_or(0),
            comment_count: v.get("comment_count").and_then(|p| p.as_i64()).unwrap_or(0),
            created_at: v
                .get("created_at")
                .and_then(|c| c.as_str())
                .map(|c| c.to_string()),
            description: v
                .get("description")
                .and_then(|c| c.as_str())
                .map(|c| c.to_string()),
            waveform_url: v
                .get("waveform_url")
                .and_then(|c| c.as_str())
                .map(|c| c.to_string()),
            bpm: v.get("bpm").and_then(|b| b.as_i64()),
            streamable: v
                .get("streamable")
                .and_then(|s| s.as_bool())
                .unwrap_or(true),
            policy: v
                .get("policy")
                .and_then(|p| p.as_str())
                .map(|p| p.to_string()),
            has_transcodings,
        })
    }

    pub fn playable(&self) -> bool {
        self.has_transcodings && self.policy.as_deref() != Some("BLOCK")
    }
}

fn parse_tag_list(raw: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut buf = String::new();
    let mut quoted = false;
    for ch in raw.chars() {
        match ch {
            '"' => {
                quoted = !quoted;
                if !quoted && !buf.trim().is_empty() {
                    out.push(buf.trim().to_string());
                    buf.clear();
                }
            }
            ' ' if !quoted => {
                if !buf.trim().is_empty() {
                    out.push(buf.trim().to_string());
                }
                buf.clear();
            }
            _ => buf.push(ch),
        }
    }
    if !buf.trim().is_empty() {
        out.push(buf.trim().to_string());
    }
    out.into_iter().take(12).collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamInfo {
    pub url: String,
    /// "progressive" | "hls"
    pub protocol: String,
    pub mime_type: String,
    pub preset: String,
    pub quality: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScPlaylist {
    pub id: i64,
    pub title: String,
    pub artwork: Option<String>,
    pub owner: String,
    pub track_count: i64,
    pub permalink_url: String,
    pub tracks: Vec<Track>,
}

impl ScPlaylist {
    pub fn from_json(v: &Value) -> Option<ScPlaylist> {
        let tracks = v
            .get("tracks")
            .and_then(|t| t.as_array())
            .map(|arr| arr.iter().filter_map(Track::from_json).collect())
            .unwrap_or_default();
        Some(ScPlaylist {
            id: v.get("id")?.as_i64()?,
            title: v.get("title")?.as_str()?.to_string(),
            artwork: v
                .get("artwork_url")
                .and_then(|a| a.as_str())
                .map(|a| a.replace("-large", "-t500x500")),
            owner: v
                .get("user")
                .and_then(|u| u.get("username"))
                .and_then(|u| u.as_str())
                .unwrap_or("")
                .to_string(),
            track_count: v.get("track_count").and_then(|t| t.as_i64()).unwrap_or(0),
            permalink_url: v
                .get("permalink_url")
                .and_then(|p| p.as_str())
                .unwrap_or_default()
                .to_string(),
            tracks,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScUser {
    pub id: i64,
    pub username: String,
    pub avatar: Option<String>,
    pub followers: i64,
    pub followings: i64,
    pub track_count: i64,
    pub city: Option<String>,
    pub country: Option<String>,
    pub description: Option<String>,
    pub permalink_url: String,
}

impl ScUser {
    pub fn from_json(v: &Value) -> Option<ScUser> {
        Some(ScUser {
            id: v.get("id")?.as_i64()?,
            username: v.get("username")?.as_str()?.to_string(),
            avatar: art(v.get("avatar_url").and_then(|a| a.as_str())),
            followers: v
                .get("followers_count")
                .and_then(|f| f.as_i64())
                .unwrap_or(0),
            followings: v
                .get("followings_count")
                .and_then(|f| f.as_i64())
                .unwrap_or(0),
            track_count: v.get("track_count").and_then(|f| f.as_i64()).unwrap_or(0),
            city: v.get("city").and_then(|c| c.as_str()).map(String::from),
            country: v
                .get("country_code")
                .and_then(|c| c.as_str())
                .map(String::from),
            description: v
                .get("description")
                .and_then(|c| c.as_str())
                .map(String::from),
            permalink_url: v
                .get("permalink_url")
                .and_then(|p| p.as_str())
                .unwrap_or_default()
                .to_string(),
        })
    }
}
