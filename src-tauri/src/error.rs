use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum HoreumError {
    #[error("network error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("soundcloud: {0}")]
    SoundCloud(String),
    #[error("auth required: {0}")]
    Auth(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("{0}")]
    Other(String),
}

impl Serialize for HoreumError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, HoreumError>;

impl From<String> for HoreumError {
    fn from(v: String) -> Self {
        HoreumError::Other(v)
    }
}
