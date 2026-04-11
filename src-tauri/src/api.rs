use base64::{engine::general_purpose, Engine as _};
use futures_util::StreamExt;
use reqwest::multipart::{Form, Part};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use std::process::Command as StdCommand;

#[derive(Debug, Serialize, Deserialize)]
pub struct AudioResponse {
    pub success: bool,
    pub transcription: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn transcribe_audio(
    audio_base64: String,
    api_key: String,
    mime_type: Option<String>,
) -> Result<AudioResponse, String> {
    let trimmed = audio_base64.trim();
    let b64_data = if let Some(idx) = trimmed.find(',') {
        &trimmed[idx + 1..]
    } else {
        trimmed
    };

    let audio_bytes = general_purpose::STANDARD
        .decode(b64_data)
        .map_err(|e| format!("Failed to decode audio: {}", e))?;

    let mime = mime_type.unwrap_or_else(|| "audio/mp4".to_string());
    let ext = if mime.contains("webm") { "webm" }
        else if mime.contains("mp4") || mime.contains("m4a") { "m4a" }
        else if mime.contains("ogg") { "ogg" }
        else { "mp4" };

    let audio_part = Part::bytes(audio_bytes)
        .file_name(format!("audio.{}", ext))
        .mime_str(&mime)
        .map_err(|e| format!("Failed to prepare audio: {}", e))?;

    let form = Form::new()
        .part("file", audio_part)
        .text("model", "whisper-1".to_string())
        .text("language", "en".to_string());

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .bearer_auth(&api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Transcription request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let err = response.text().await.unwrap_or_default();
        return Ok(AudioResponse {
            success: false,
            transcription: None,
            error: Some(format!("Whisper API error ({}): {}", status, err)),
        });
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let text = body
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Ok(AudioResponse {
        success: true,
        transcription: Some(text),
        error: None,
    })
}

#[tauri::command]
pub async fn chat_stream_response(
    app: AppHandle,
    api_key: String,
    messages_json: String,
    model: String,
) -> Result<String, String> {
    let messages: serde_json::Value = serde_json::from_str(&messages_json)
        .map_err(|e| format!("Invalid messages JSON: {}", e))?;

    let request_body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": true,
        "max_tokens": 2048,
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Content-Type", "application/json")
        .bearer_auth(&api_key)
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("API request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let err = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI API error ({}): {}", status, err));
    }

    let mut stream = response.bytes_stream();
    let mut full_response = String::new();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(bytes) => {
                let chunk_str = String::from_utf8_lossy(&bytes);
                buffer.push_str(&chunk_str);

                let lines: Vec<&str> = buffer.split('\n').collect();
                let incomplete = lines.last().unwrap_or(&"").to_string();

                for line in &lines[..lines.len() - 1] {
                    let trimmed = line.trim();
                    if let Some(json_str) = trimmed.strip_prefix("data: ") {
                        if json_str == "[DONE]" {
                            break;
                        }
                        if !json_str.is_empty() {
                            if let Ok(parsed) =
                                serde_json::from_str::<serde_json::Value>(json_str)
                            {
                                if let Some(content) = parsed
                                    .get("choices")
                                    .and_then(|c| c.as_array())
                                    .and_then(|arr| arr.first())
                                    .and_then(|choice| choice.get("delta"))
                                    .and_then(|delta| delta.get("content"))
                                    .and_then(|c| c.as_str())
                                {
                                    full_response.push_str(content);
                                    let _ = app.emit("chat_stream_chunk", content);
                                }
                            }
                        }
                    }
                }
                buffer = incomplete;
            }
            Err(e) => {
                return Err(format!("Stream error: {}", e));
            }
        }
    }

    let _ = app.emit("chat_stream_complete", &full_response);
    Ok(full_response)
}

#[tauri::command]
pub async fn send_message_simple(
    api_key: String,
    messages_json: String,
    model: String,
) -> Result<String, String> {
    let messages: serde_json::Value = serde_json::from_str(&messages_json)
        .map_err(|e| format!("Invalid messages JSON: {}", e))?;

    let request_body = serde_json::json!({
        "model": model,
        "messages": messages,
        "max_tokens": 4096,
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Content-Type", "application/json")
        .bearer_auth(&api_key)
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("API request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let err = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI API error ({}): {}", status, err));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let content = body
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|msg| msg.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();

    Ok(content)
}

#[tauri::command]
pub async fn fetch_tts_audio(
    text: String,
    api_key: String,
    voice: Option<String>,
) -> Result<String, String> {
    let voice = voice.unwrap_or_else(|| "shimmer".to_string());

    let request_body = serde_json::json!({
        "model": "tts-1",
        "voice": voice,
        "input": text,
        "response_format": "mp3",
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.openai.com/v1/audio/speech")
        .header("Content-Type", "application/json")
        .bearer_auth(&api_key)
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("TTS request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let err = response.text().await.unwrap_or_default();
        return Err(format!("TTS API error ({}): {}", status, err));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read TTS audio: {}", e))?;

    let b64 = general_purpose::STANDARD.encode(&bytes);
    Ok(b64)
}

#[tauri::command]
pub async fn native_screenshot() -> Result<String, String> {
    let tmp = std::env::temp_dir().join(format!("heyta_screenshot_{}.png", uuid::Uuid::new_v4()));
    let tmp_str = tmp.to_string_lossy().to_string();

    let status = StdCommand::new("screencapture")
        .args(["-i", &tmp_str])
        .status()
        .map_err(|e| format!("Failed to run screencapture: {}", e))?;

    if !status.success() {
        return Err("Screenshot cancelled".to_string());
    }

    if !tmp.exists() {
        return Err("Screenshot cancelled".to_string());
    }

    let bytes = std::fs::read(&tmp)
        .map_err(|e| format!("Failed to read screenshot: {}", e))?;
    let _ = std::fs::remove_file(&tmp);

    let b64 = general_purpose::STANDARD.encode(&bytes);
    Ok(b64)
}
