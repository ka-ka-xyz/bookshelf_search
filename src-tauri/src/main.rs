// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn file_exists(path_str: &str) -> bool {
    use std::path::Path;
    return Path::new(path_str).exists().into();
}

use reqwest::{StatusCode, Error};
use serde::{Deserialize, Serialize};
use std::{u16};

#[derive(Serialize, Deserialize, Debug)]
struct Resp {
    status: u16,
    text: String,
}

fn make_err_to_resp(err: &Error) -> Resp {
    return Resp {
        status: err.status().unwrap_or(StatusCode::BAD_REQUEST).as_u16(),
        text: err.to_string(),
    };
}

#[tauri::command]
fn fetch(url: &str, auth_str: &str, post_body_json_str: &str) -> String {

    let client = reqwest::blocking::Client::new();

    let builder;
    if !&auth_str.is_empty() {
        builder = client.post(url)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header(reqwest::header::ACCEPT, "application/json")
        .header(reqwest::header::PRAGMA, "no-cache")
        .header(reqwest::header::AUTHORIZATION, auth_str);
    } else {
        builder = client.post(url)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header(reqwest::header::ACCEPT, "application/json")
        .header(reqwest::header::PRAGMA, "no-cache");
    }

    let resp: Result<reqwest::blocking::Response, reqwest::Error> = builder.body(post_body_json_str.to_string()).send();
    let json_parse_error_str = "{status: '400', text: 'JSON Parse Error'}".to_string();

    let r = match resp {
        Ok(r) => r,
        Err(ref error) => {
            let err_rtn = make_err_to_resp(error);
            return serde_json::to_string(&err_rtn).unwrap_or(json_parse_error_str);
        } 
    };
    //let r = resp.unwrap();
    let status = r.status();
    let binding = r.text();
    let text = match binding {
        Ok(t) => t,
        Err(ref error) => {
            let err_rtn = make_err_to_resp(error);
            return serde_json::to_string(&err_rtn).unwrap_or(json_parse_error_str);
        }
    };
    let resp_json = Resp { status: status.as_u16(), text: text.to_string() };
    return serde_json::to_string(&resp_json).unwrap_or(json_parse_error_str);
}


fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![file_exists, fetch])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
