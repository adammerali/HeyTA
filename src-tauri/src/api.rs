//! OpenAI API integration — all external HTTP requests route through Rust
//! to bypass CORS restrictions and keep API keys out of the browser network inspector.

use base64::{engine::general_purpose, Engine as _};
use futures_util::StreamExt;
use reqwest::multipart::{Form, Part};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

use crate::error::{classify_api_error, AppError};

/// Holds a cancellation flag for the active SSE stream, allowing the
/// frontend to abort an in-flight GPT-4o request from the Rust side.
pub struct StreamCancelFlag(pub Arc<AtomicBool>);

impl Default for StreamCancelFlag {
    fn default() -> Self {
        Self(Arc::new(AtomicBool::new(false)))
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AudioResponse {
    pub success: bool,
    pub transcription: Option<String>,
    pub error: Option<String>,
}

/// Transcribe an audio blob via the OpenAI Whisper API.
///
/// Accepts base64-encoded audio (with or without a data-URI prefix),
/// converts to bytes, and sends as multipart form to `/v1/audio/transcriptions`.
/// Returns a structured response with the transcript or an error message.
#[tauri::command]
pub async fn transcribe_audio(
    audio_base64: String,
    api_key: String,
    mime_type: Option<String>,
) -> Result<AudioResponse, AppError> {
    let trimmed = audio_base64.trim();
    let b64_data = if let Some(idx) = trimmed.find(',') {
        &trimmed[idx + 1..]
    } else {
        trimmed
    };

    let audio_bytes = general_purpose::STANDARD.decode(b64_data)?;

    let mime = mime_type.unwrap_or_else(|| "audio/mp4".to_string());
    let ext = if mime.contains("webm") { "webm" }
        else if mime.contains("mp4") || mime.contains("m4a") { "m4a" }
        else if mime.contains("ogg") { "ogg" }
        else { "mp4" };

    let audio_part = Part::bytes(audio_bytes)
        .file_name(format!("audio.{}", ext))
        .mime_str(&mime)
        .map_err(|e| AppError::Encoding(format!("MIME: {}", e)))?;

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
        .await?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let err = response.text().await.unwrap_or_default();
        return Ok(AudioResponse {
            success: false,
            transcription: None,
            error: Some(classify_api_error(status, err).to_string()),
        });
    }

    let body: serde_json::Value = response.json().await?;

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

/// Stream a chat completion from GPT-4o via Server-Sent Events (SSE).
///
/// The function opens a streaming HTTP connection to OpenAI, parses each
/// SSE `data:` line, and emits `chat_stream_chunk` Tauri events as content
/// tokens arrive. A final `chat_stream_complete` event carries the full text.
///
/// The SSE loop checks a shared `StreamCancelFlag` on every chunk so the
/// frontend can abort mid-stream via the `cancel_stream` command.
#[tauri::command]
pub async fn chat_stream_response(
    app: AppHandle,
    api_key: String,
    messages_json: String,
    model: String,
) -> Result<String, AppError> {
    let messages: serde_json::Value = serde_json::from_str(&messages_json)?;

    let cancel = app.state::<StreamCancelFlag>();
    cancel.0.store(false, Ordering::SeqCst);

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
        .await?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let err = response.text().await.unwrap_or_default();
        return Err(classify_api_error(status, err));
    }

    let mut stream = response.bytes_stream();
    let mut full_response = String::new();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        if cancel.0.load(Ordering::SeqCst) {
            let _ = app.emit("chat_stream_complete", &full_response);
            return Err(AppError::Cancelled);
        }

        let bytes = chunk?;
        let chunk_str = String::from_utf8_lossy(&bytes);
        buffer.push_str(&chunk_str);

        let lines: Vec<&str> = buffer.split('\n').collect();
        let incomplete = lines.last().unwrap_or(&"").to_string();

        for line in &lines[..lines.len() - 1] {
            if let Some(content) = parse_sse_content(line) {
                full_response.push_str(&content);
                let _ = app.emit("chat_stream_chunk", &content);
            }
        }
        buffer = incomplete;
    }

    let _ = app.emit("chat_stream_complete", &full_response);
    Ok(full_response)
}

/// Parse a single SSE line and extract the content delta if present.
/// Returns `None` for non-data lines, empty data, and the `[DONE]` sentinel.
fn parse_sse_content(line: &str) -> Option<String> {
    let trimmed = line.trim();
    let json_str = trimmed.strip_prefix("data: ")?;

    if json_str == "[DONE]" || json_str.is_empty() {
        return None;
    }

    let parsed: serde_json::Value = serde_json::from_str(json_str).ok()?;
    parsed
        .get("choices")?
        .as_array()?
        .first()?
        .get("delta")?
        .get("content")?
        .as_str()
        .map(|s| s.to_string())
}

/// Cancel an in-flight streaming response by setting the atomic cancel flag.
/// The SSE loop in `chat_stream_response` checks this flag on every chunk.
#[tauri::command]
pub fn cancel_stream(app: AppHandle) {
    let cancel = app.state::<StreamCancelFlag>();
    cancel.0.store(true, Ordering::SeqCst);
}

/// Send a non-streaming chat completion request (used for recap generation).
#[tauri::command]
pub async fn send_message_simple(
    api_key: String,
    messages_json: String,
    model: String,
) -> Result<String, AppError> {
    let messages: serde_json::Value = serde_json::from_str(&messages_json)?;

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
        .await?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let err = response.text().await.unwrap_or_default();
        return Err(classify_api_error(status, err));
    }

    let body: serde_json::Value = response.json().await?;

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

/// Fetch synthesized speech audio from the OpenAI TTS API.
///
/// Returns the audio as a base64-encoded MP3 string for playback
/// via the Web Audio API in the frontend.
#[tauri::command]
pub async fn fetch_tts_audio(
    text: String,
    api_key: String,
    voice: Option<String>,
) -> Result<String, AppError> {
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
        .await?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let err = response.text().await.unwrap_or_default();
        return Err(classify_api_error(status, err));
    }

    let bytes = response.bytes().await?;
    let b64 = general_purpose::STANDARD.encode(&bytes);
    Ok(b64)
}

/// Take an interactive screenshot using the macOS `screencapture -i` command.
/// Returns the captured image as a base64-encoded PNG string.
#[tauri::command]
pub async fn native_screenshot() -> Result<String, AppError> {
    let tmp = std::env::temp_dir().join(format!("heyta_screenshot_{}.png", uuid::Uuid::new_v4()));
    let tmp_str = tmp.to_string_lossy().to_string();

    let status = std::process::Command::new("screencapture")
        .args(["-i", &tmp_str])
        .status()?;

    if !status.success() || !tmp.exists() {
        return Err(AppError::Cancelled);
    }

    let bytes = std::fs::read(&tmp)?;
    let _ = std::fs::remove_file(&tmp);

    let b64 = general_purpose::STANDARD.encode(&bytes);
    Ok(b64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_sse_content_extracts_delta() {
        let line = r#"data: {"choices":[{"delta":{"content":"Hello"}}]}"#;
        assert_eq!(parse_sse_content(line), Some("Hello".to_string()));
    }

    #[test]
    fn parse_sse_content_returns_none_for_done() {
        assert_eq!(parse_sse_content("data: [DONE]"), None);
    }

    #[test]
    fn parse_sse_content_returns_none_for_empty_data() {
        assert_eq!(parse_sse_content("data: "), None);
    }

    #[test]
    fn parse_sse_content_returns_none_for_non_data_line() {
        assert_eq!(parse_sse_content(": keep-alive"), None);
        assert_eq!(parse_sse_content(""), None);
    }

    #[test]
    fn parse_sse_content_handles_role_delta() {
        let line = r#"data: {"choices":[{"delta":{"role":"assistant"}}]}"#;
        assert_eq!(parse_sse_content(line), None);
    }

    #[test]
    fn parse_sse_content_handles_malformed_json() {
        assert_eq!(parse_sse_content("data: {invalid json}"), None);
    }

    #[test]
    fn parse_sse_content_handles_whitespace() {
        let line = r#"  data: {"choices":[{"delta":{"content":"world"}}]}  "#;
        assert_eq!(parse_sse_content(line), Some("world".to_string()));
    }
}
