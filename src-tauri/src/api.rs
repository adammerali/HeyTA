//! OpenAI API integration — all external HTTP requests route through Rust.
//!
//! # Architecture Decision: Rust-Side HTTP
//!
//! Every OpenAI call (Whisper, GPT-4o, TTS) goes through this module instead of
//! the browser's `fetch()`. This solves three problems simultaneously:
//!
//! 1. **CORS bypass**: OpenAI's API doesn't set CORS headers for browser origins.
//!    Browser fetch would fail. Rust's reqwest has no CORS restrictions.
//!
//! 2. **API key security**: The key never appears in browser DevTools network tab.
//!    While localStorage storage is a v1 simplification, at least network traffic
//!    is invisible to casual inspection.
//!
//! 3. **Streaming control**: SSE streaming via reqwest gives us byte-level control
//!    over the stream, enabling the cancellation flag pattern and chunk-by-chunk
//!    parsing that would be harder with browser EventSource.

use base64::{engine::general_purpose, Engine as _};
use futures_util::StreamExt;
use reqwest::multipart::{Form, Part};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

use crate::error::{classify_api_error, AppError};

/// Shared cancellation flag for the active SSE stream.
///
/// # Design Decision: Atomic Bool vs. Channel
///
/// We use an AtomicBool rather than a tokio channel because:
/// - Only one stream is active at a time (single-user desktop app)
/// - The flag is checked on every SSE chunk (cheap atomic load)
/// - No need for the complexity of channel lifecycle management
/// - The frontend calls `cancel_stream` which sets this to true;
///   the SSE loop in `chat_stream_response` checks it and breaks out
pub struct StreamCancelFlag(pub Arc<AtomicBool>);

impl Default for StreamCancelFlag {
    fn default() -> Self {
        Self(Arc::new(AtomicBool::new(false)))
    }
}

/// Structured response from the Whisper transcription endpoint.
/// Uses `success` flag pattern rather than Result because the frontend
/// needs to distinguish "API error" from "network error" for UI messaging.
#[derive(Debug, Serialize, Deserialize)]
pub struct AudioResponse {
    pub success: bool,
    pub transcription: Option<String>,
    pub error: Option<String>,
}

/// Transcribe an audio blob via the OpenAI Whisper API.
///
/// # Audio Format Handling
///
/// WKWebView (macOS Tauri's webview) doesn't support `audio/webm` recording —
/// it outputs `audio/mp4` instead. The frontend detects the supported MIME type
/// at startup and sends the correct type here. We map MIME types to file extensions
/// because Whisper uses the extension to determine the codec.
///
/// # Base64 Transport
///
/// Audio is sent as base64 over Tauri's IPC because Tauri invoke doesn't support
/// binary blob arguments directly. The overhead (~33% size increase) is acceptable
/// for ~4-second audio chunks (~50KB base64 for a 4s mp4 recording).
#[tauri::command]
pub async fn transcribe_audio(
    audio_base64: String,
    api_key: String,
    mime_type: Option<String>,
) -> Result<AudioResponse, AppError> {
    // Strip data-URI prefix if present (e.g., "data:audio/mp4;base64,...")
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

    // Return API errors as AudioResponse (not Err) so the frontend can show
    // user-friendly messages rather than generic error toasts
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
/// # Streaming Architecture
///
/// This function bridges Rust's async HTTP streaming to the frontend via Tauri events:
///
/// ```text
/// OpenAI SSE stream → reqwest bytes_stream → parse SSE lines → emit Tauri events
///                                                                    ↓
///                                              Frontend async queue ← listen("chat_stream_chunk")
/// ```
///
/// Each SSE `data:` line is parsed to extract the content delta token. We emit two
/// event types:
/// - `chat_stream_chunk`: Individual content token (e.g., "The", " derivative", " is")
/// - `chat_stream_complete`: Full accumulated response text (signals stream end)
///
/// # Cancellation
///
/// The `StreamCancelFlag` atomic bool is checked on every chunk. When the frontend
/// calls `cancel_stream`, the flag is set to true and the loop breaks immediately.
/// This is faster than dropping the reqwest response (which waits for TCP shutdown).
///
/// # SSE Parsing
///
/// SSE lines arrive as raw bytes that may split across TCP chunks. We maintain a
/// `buffer` of incomplete data and only process complete lines (split on `\n`).
/// The last incomplete segment is preserved for the next chunk iteration.
#[tauri::command]
pub async fn chat_stream_response(
    app: AppHandle,
    api_key: String,
    messages_json: String,
    model: String,
) -> Result<String, AppError> {
    let messages: serde_json::Value = serde_json::from_str(&messages_json)?;

    // Reset cancel flag at the start of each new stream
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
        // Check cancellation flag before processing each chunk
        if cancel.0.load(Ordering::SeqCst) {
            let _ = app.emit("chat_stream_complete", &full_response);
            return Err(AppError::Cancelled);
        }

        let bytes = chunk?;
        let chunk_str = String::from_utf8_lossy(&bytes);
        buffer.push_str(&chunk_str);

        // Split on newlines; the last element may be incomplete (no trailing \n)
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
///
/// SSE format from OpenAI:
/// ```text
/// data: {"choices":[{"delta":{"content":"Hello"}}]}
/// data: {"choices":[{"delta":{"role":"assistant"}}]}  // no content — skip
/// data: [DONE]                                         // stream end — skip
/// : keep-alive                                         // comment — skip
/// ```
///
/// Returns `None` for non-content lines (comments, role deltas, DONE, empty).
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
///
/// Called by the frontend when the user aborts (e.g., via AbortController or
/// starting a new question). The SSE loop checks this flag on every chunk and
/// breaks immediately, avoiding wasted API tokens and network bandwidth.
#[tauri::command]
pub fn cancel_stream(app: AppHandle) {
    let cancel = app.state::<StreamCancelFlag>();
    cancel.0.store(true, Ordering::SeqCst);
}

/// Send a non-streaming chat completion request.
///
/// Used for recap generation and other non-interactive requests where streaming
/// adds complexity without UX benefit. The student isn't watching the recap
/// generate token-by-token, so a single response is simpler and more reliable.
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
/// # Design Decision: Server-Side TTS via Rust
///
/// We fetch TTS through Rust rather than browser-side for consistency with our
/// CORS-bypass architecture. The audio is returned as base64 MP3, decoded in the
/// frontend via Web Audio API's `decodeAudioData`. The "shimmer" voice was chosen
/// for its natural, encouraging tone that fits the tutoring context.
///
/// # Audio Format
///
/// MP3 was chosen over opus/ogg because Web Audio API's `decodeAudioData` has
/// the most reliable MP3 support across all WebKit/WKWebView versions.
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

/// Take an interactive screenshot using the native macOS `screencapture -i` command.
///
/// # Why `screencapture` Instead of xcap?
///
/// xcap captures the screen non-interactively. For the "capture a problem from your screen"
/// workflow, we need the user to select a region. macOS's built-in `screencapture -i` provides
/// the native selection UI (crosshair cursor, drag-to-select, Esc to cancel) with zero
/// additional code. The file is written to a temp path, read back, base64-encoded, and cleaned up.
///
/// Returns `AppError::Cancelled` if the user presses Escape or clicks without dragging.
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
