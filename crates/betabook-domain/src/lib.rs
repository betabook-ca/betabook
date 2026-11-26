//! Pure domain logic, validation, grade tables, password hashing, and SEO
//! helpers shared across native tests and the Cloudflare Worker.

#[cfg(test)]
mod tests {
    #[test]
    fn domain_crate_compiles() {
        assert_eq!(2 + 2, 4);
    }
}
