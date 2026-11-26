fn main() -> Result<(), String> {
    let complete = !std::env::args().any(|arg| arg == "--partial");
    let spec = betabook_worker::api_contract::document(complete)?;
    println!(
        "{}",
        serde_json::to_string_pretty(&spec).map_err(|e| e.to_string())?
    );
    Ok(())
}
