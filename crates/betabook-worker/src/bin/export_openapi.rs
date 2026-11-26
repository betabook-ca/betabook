fn main() -> Result<(), String> {
    let spec = betabook_worker::api_contract::document()?;
    println!(
        "{}",
        serde_json::to_string_pretty(&spec).map_err(|e| e.to_string())?
    );
    Ok(())
}
