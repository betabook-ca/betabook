//! Database abstraction and SQL query modules backed by Cloudflare D1 in
//! production and bundled SQLite in local tests.

pub mod auth;
pub mod catalog_export;
#[cfg(feature = "d1")]
pub mod d1;
pub mod executor;
pub mod fts;
pub mod public_catalog;
#[cfg(feature = "sqlite")]
pub mod sqlite;

pub use executor::{DbError, DbExecutor, DbParam, DbRow, DbValue};
