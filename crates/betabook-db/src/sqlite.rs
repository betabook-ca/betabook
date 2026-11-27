use std::fs;
use std::path::Path;
use std::sync::Mutex;

use async_trait::async_trait;
use rusqlite::Connection;
use rusqlite::types::{ToSqlOutput, Value, ValueRef};

use crate::executor::{DbError, DbExecutor, DbParam, DbRow, DbValue};

pub struct SqliteDb {
    conn: Mutex<Connection>,
}

impl SqliteDb {
    pub fn in_memory() -> Result<Self, DbError> {
        let conn = Connection::open_in_memory().map_err(|e| DbError::Query(e.to_string()))?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(|e| DbError::Query(e.to_string()))?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn open(path: &Path) -> Result<Self, DbError> {
        let conn = Connection::open(path).map_err(|e| DbError::Query(e.to_string()))?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(|e| DbError::Query(e.to_string()))?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn apply_migrations(&self, migrations_dir: &Path) -> Result<usize, DbError> {
        let mut entries: Vec<_> = fs::read_dir(migrations_dir)
            .map_err(|e| DbError::Query(format!("read migrations dir: {e}")))?
            .filter_map(|entry| entry.ok().map(|e| e.path()))
            .filter(|path| path.extension().and_then(|s| s.to_str()) == Some("sql"))
            .collect();
        entries.sort();

        let conn = self
            .conn
            .lock()
            .map_err(|_| DbError::Query("sqlite mutex poisoned".to_string()))?;
        for path in &entries {
            let raw = fs::read_to_string(path)
                .map_err(|e| DbError::Query(format!("read {}: {e}", path.display())))?;
            let normalized = raw.replace("\r\n", "\n");
            conn.execute_batch(&normalized)
                .map_err(|e| DbError::Query(format!("migration {}: {e}", path.display())))?;
        }
        conn.execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(|e| DbError::Query(e.to_string()))?;
        Ok(entries.len())
    }
}

fn to_sql_value(param: &DbParam) -> ToSqlOutput<'_> {
    match param {
        DbParam::Null => ToSqlOutput::Owned(Value::Null),
        DbParam::Int(i) => ToSqlOutput::Owned(Value::Integer(*i)),
        DbParam::Real(f) => ToSqlOutput::Owned(Value::Real(*f)),
        DbParam::Text(s) => ToSqlOutput::Borrowed(ValueRef::Text(s.as_bytes())),
        DbParam::Blob(b) => ToSqlOutput::Borrowed(ValueRef::Blob(b.as_slice())),
    }
}

fn from_sql_value(val: ValueRef<'_>) -> DbValue {
    match val {
        ValueRef::Null => DbValue::Null,
        ValueRef::Integer(i) => DbValue::Int(i),
        ValueRef::Real(f) => DbValue::Real(f),
        ValueRef::Text(bytes) => DbValue::Text(String::from_utf8_lossy(bytes).into_owned()),
        ValueRef::Blob(bytes) => DbValue::Blob(bytes.to_vec()),
    }
}

#[async_trait(?Send)]
impl DbExecutor for SqliteDb {
    async fn query_all(&self, sql: &str, params: &[DbParam]) -> Result<Vec<DbRow>, DbError> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| DbError::Query("sqlite mutex poisoned".to_string()))?;
        let mut stmt = conn
            .prepare(sql)
            .map_err(|e| DbError::Query(format!("{e}: {sql}")))?;
        let names: Vec<String> = stmt.column_names().map(ToString::to_string).collect();
        let bound: Vec<ToSqlOutput<'_>> = params.iter().map(to_sql_value).collect();
        let rows = stmt
            .query_map(rusqlite::params_from_iter(bound), |row| {
                let mut cols = Vec::with_capacity(names.len());
                for (idx, name) in names.iter().enumerate() {
                    let val = from_sql_value(row.get_ref(idx)?);
                    cols.push((name.clone(), val));
                }
                Ok(DbRow::from_columns(cols))
            })
            .map_err(|e| DbError::Query(e.to_string()))?;

        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| DbError::Query(e.to_string()))?);
        }
        Ok(out)
    }

    async fn execute(&self, sql: &str, params: &[DbParam]) -> Result<u64, DbError> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| DbError::Query("sqlite mutex poisoned".to_string()))?;
        let bound: Vec<ToSqlOutput<'_>> = params.iter().map(to_sql_value).collect();
        let changes = conn
            .execute(sql, rusqlite::params_from_iter(bound))
            .map_err(|e| DbError::Query(format!("{e}: {sql}")))?;
        Ok(changes as u64)
    }

    async fn batch(&self, statements: Vec<(String, Vec<DbParam>)>) -> Result<(), DbError> {
        let mut conn = self
            .conn
            .lock()
            .map_err(|_| DbError::Query("sqlite mutex poisoned".to_string()))?;
        let tx = conn
            .transaction()
            .map_err(|e| DbError::Query(e.to_string()))?;
        for (sql, params) in &statements {
            let bound: Vec<ToSqlOutput<'_>> = params.iter().map(to_sql_value).collect();
            tx.execute(sql, rusqlite::params_from_iter(bound))
                .map_err(|e| DbError::Query(format!("{e}: {sql}")))?;
        }
        tx.commit().map_err(|e| DbError::Query(e.to_string()))?;
        Ok(())
    }
}
