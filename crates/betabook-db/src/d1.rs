use async_trait::async_trait;
use serde_json::{Map, Value};
use worker::d1::{D1Database, D1PreparedStatement};
use worker::wasm_bindgen::JsValue;

use crate::executor::{DbError, DbExecutor, DbParam, DbRow, DbValue};

pub struct D1Db {
    inner: D1Database,
}

impl D1Db {
    pub fn new(inner: D1Database) -> Self {
        Self { inner }
    }

    fn prepare_bound(&self, sql: &str, params: &[DbParam]) -> Result<D1PreparedStatement, DbError> {
        let stmt = self.inner.prepare(sql);
        if params.is_empty() {
            return Ok(stmt);
        }
        let values: Vec<JsValue> = params.iter().map(param_to_js).collect();
        stmt.bind(&values)
            .map_err(|e| DbError::Query(e.to_string()))
    }
}

fn param_to_js(param: &DbParam) -> JsValue {
    match param {
        DbParam::Null => JsValue::NULL,
        DbParam::Int(i) => JsValue::from_f64(*i as f64),
        DbParam::Real(f) => JsValue::from_f64(*f),
        DbParam::Text(s) => JsValue::from_str(s),
        DbParam::Blob(bytes) => {
            let array = worker::js_sys::Uint8Array::from(bytes.as_slice());
            array.into()
        }
    }
}

fn json_to_db_value(value: Value) -> DbValue {
    match value {
        Value::Null => DbValue::Null,
        Value::Bool(b) => DbValue::Int(i64::from(b)),
        Value::Number(num) => {
            if let Some(i) = num.as_i64() {
                DbValue::Int(i)
            } else if let Some(f) = num.as_f64() {
                DbValue::Real(f)
            } else {
                DbValue::Null
            }
        }
        Value::String(s) => DbValue::Text(s),
        other => DbValue::Text(other.to_string()),
    }
}

fn map_to_row(map: Map<String, Value>) -> DbRow {
    let cols = map
        .into_iter()
        .map(|(k, v)| (k, json_to_db_value(v)))
        .collect();
    DbRow::from_columns(cols)
}

#[async_trait(?Send)]
impl DbExecutor for D1Db {
    async fn query_all(&self, sql: &str, params: &[DbParam]) -> Result<Vec<DbRow>, DbError> {
        let stmt = self.prepare_bound(sql, params)?;
        let result = stmt
            .all()
            .await
            .map_err(|e| DbError::Query(e.to_string()))?;
        let maps = result
            .results::<Map<String, Value>>()
            .map_err(|e| DbError::Query(e.to_string()))?;
        Ok(maps.into_iter().map(map_to_row).collect())
    }

    async fn execute(&self, sql: &str, params: &[DbParam]) -> Result<u64, DbError> {
        let stmt = self.prepare_bound(sql, params)?;
        let result = stmt
            .run()
            .await
            .map_err(|e| DbError::Query(e.to_string()))?;
        let changes = result
            .meta()
            .map_err(|e| DbError::Query(e.to_string()))?
            .and_then(|m| m.changes)
            .unwrap_or(0);
        Ok(changes as u64)
    }

    async fn batch(&self, statements: Vec<(String, Vec<DbParam>)>) -> Result<(), DbError> {
        if statements.is_empty() {
            return Ok(());
        }
        let mut prepared = Vec::with_capacity(statements.len());
        for (sql, params) in &statements {
            prepared.push(self.prepare_bound(sql, params)?);
        }
        self.inner
            .batch(prepared)
            .await
            .map_err(|e| DbError::Query(e.to_string()))?;
        Ok(())
    }
}
