//! Database abstraction and SQL query modules backed by Cloudflare D1 in
//! production and bundled SQLite in local tests.

pub mod analytics;
pub mod auth;
pub mod catalog_export;
pub mod climb_lists;
pub mod content_access;
#[cfg(feature = "d1")]
pub mod d1;
pub mod executor;
pub mod feed;
pub mod fts;
pub mod goal_achievements;
pub mod goal_history;
pub mod goals;
pub mod imports;
pub mod journal;
pub mod member_catalog;
pub mod moderation;
pub mod projects;
pub mod public_catalog;
pub mod send_alerts;
pub mod sends;
pub mod social;
#[cfg(feature = "sqlite")]
pub mod sqlite;

pub use executor::{DbError, DbExecutor, DbParam, DbRow, DbValue};
pub mod trips;
