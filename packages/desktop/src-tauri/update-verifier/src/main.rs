//! Release gate: verify final package bytes with the public key shipped in the application.
use base64::{engine::general_purpose::STANDARD, Engine};
use minisign_verify::{PublicKey, Signature};
use std::{env, error::Error, fs};

fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<String> = env::args().collect();
    if args.len() != 3 { return Err("usage: verify-update <version> <package>".into()); }
    let config: serde_json::Value = serde_json::from_str(include_str!("../../tauri.conf.json"))?;
    let public = String::from_utf8(STANDARD.decode(config["plugins"]["updater"]["pubkey"].as_str().ok_or("missing updater public key")?)?)?;
    let signature = String::from_utf8(STANDARD.decode(fs::read_to_string(format!("{}.sig", args[2]))?.trim())?)?;
    let public = PublicKey::decode(&public)?;
    let signature = Signature::decode(&signature)?;
    public.verify(&fs::read(&args[2])?, &signature, false)?;
    let expected = format!("version:{}", args[1]);
    if !signature.trusted_comment().split('\t').any(|field| field == expected) {
        return Err("signed version differs from release version".into());
    }
    println!("Verified final package signature and version: {}", args[1]);
    Ok(())
}
