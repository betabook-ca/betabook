use async_trait::async_trait;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DbError {
    #[error("database error: {0}")]
    Query(String),
    #[error("missing or invalid column `{0}`")]
    Column(&'static str),
    #[error("JSON serialization error: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Clone, PartialEq)]
pub enum DbParam {
    Null,
    Int(i64),
    Real(f64),
    Text(String),
    Blob(Vec<u8>),
}

impl From<i64> for DbParam {
    fn from(value: i64) -> Self {
        Self::Int(value)
    }
}

impl From<usize> for DbParam {
    fn from(value: usize) -> Self {
        Self::Int(value as i64)
    }
}

impl From<f64> for DbParam {
    fn from(value: f64) -> Self {
        Self::Real(value)
    }
}

impl From<bool> for DbParam {
    fn from(value: bool) -> Self {
        Self::Int(i64::from(value))
    }
}

impl From<String> for DbParam {
    fn from(value: String) -> Self {
        Self::Text(value)
    }
}

impl From<&str> for DbParam {
    fn from(value: &str) -> Self {
        Self::Text(value.to_string())
    }
}

impl<T: Into<DbParam>> From<Option<T>> for DbParam {
    fn from(value: Option<T>) -> Self {
        match value {
            Some(v) => v.into(),
            None => Self::Null,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum DbValue {
    Null,
    Int(i64),
    Real(f64),
    Text(String),
    Blob(Vec<u8>),
}

#[derive(Debug, Clone, Default)]
pub struct DbRow {
    columns: Vec<(String, DbValue)>,
}

impl DbRow {
    pub fn from_columns(columns: Vec<(String, DbValue)>) -> Self {
        Self { columns }
    }

    pub fn get(&self, name: &str) -> Option<&DbValue> {
        self.columns
            .iter()
            .find(|(col, _)| col == name)
            .map(|(_, val)| val)
    }

    pub fn get_i64(&self, name: &'static str) -> Result<i64, DbError> {
        match self.get(name) {
            Some(DbValue::Int(v)) => Ok(*v),
            Some(DbValue::Real(v)) if v.fract() == 0.0 => Ok(*v as i64),
            _ => Err(DbError::Column(name)),
        }
    }

    pub fn get_opt_i64(&self, name: &'static str) -> Result<Option<i64>, DbError> {
        match self.get(name) {
            Some(DbValue::Null) | None => Ok(None),
            Some(DbValue::Int(v)) => Ok(Some(*v)),
            Some(DbValue::Real(v)) if v.fract() == 0.0 => Ok(Some(*v as i64)),
            _ => Err(DbError::Column(name)),
        }
    }

    pub fn get_opt_f64(&self, name: &'static str) -> Result<Option<f64>, DbError> {
        match self.get(name) {
            Some(DbValue::Null) | None => Ok(None),
            Some(DbValue::Real(v)) => Ok(Some(*v)),
            Some(DbValue::Int(v)) => Ok(Some(*v as f64)),
            _ => Err(DbError::Column(name)),
        }
    }

    pub fn get_string(&self, name: &'static str) -> Result<String, DbError> {
        match self.get(name) {
            Some(DbValue::Text(s)) => Ok(s.clone()),
            _ => Err(DbError::Column(name)),
        }
    }

    pub fn get_opt_string(&self, name: &'static str) -> Result<Option<String>, DbError> {
        match self.get(name) {
            Some(DbValue::Null) | None => Ok(None),
            Some(DbValue::Text(s)) => Ok(Some(s.clone())),
            _ => Err(DbError::Column(name)),
        }
    }

    pub fn get_bool(&self, name: &'static str) -> Result<bool, DbError> {
        match self.get(name) {
            Some(DbValue::Int(v)) => Ok(*v != 0),
            Some(DbValue::Real(v)) => Ok(*v != 0.0),
            _ => Err(DbError::Column(name)),
        }
    }
}

#[async_trait(?Send)]
pub trait DbExecutor {
    async fn query_all(&self, sql: &str, params: &[DbParam]) -> Result<Vec<DbRow>, DbError>;

    async fn query_one(&self, sql: &str, params: &[DbParam]) -> Result<Option<DbRow>, DbError> {
        Ok(self.query_all(sql, params).await?.into_iter().next())
    }

    async fn execute(&self, sql: &str, params: &[DbParam]) -> Result<u64, DbError>;

    async fn batch(&self, statements: Vec<(String, Vec<DbParam>)>) -> Result<(), DbError>;
}
