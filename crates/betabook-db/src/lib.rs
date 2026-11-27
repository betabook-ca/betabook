//! Database abstraction and SQL query modules backed by Cloudflare D1 in
//! production and bundled SQLite in local tests.

#[cfg(test)]
mod tests {
    #[test]
    fn db_crate_compiles() {
        assert_eq!(2 + 2, 4);
    }
}
