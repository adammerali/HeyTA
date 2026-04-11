use serde::{Deserialize, Serialize};
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// Holds the spawned Python speech process so we can kill it on exit.
struct SpeechProcess(Mutex<Option<Child>>);

#[cfg(target_os = "macos")]
#[allow(deprecated)]
use tauri_nspanel::{cocoa::appkit::NSWindowCollectionBehavior, panel_delegate, WebviewWindowExt};

#[derive(Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Serialize, Deserialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    system: String,
    messages: Vec<ChatMessage>,
}

#[derive(Deserialize)]
struct AnthropicContent {
    text: String,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContent>,
}

#[tauri::command]
async fn open_chat_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("chat") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    } else {
        WebviewWindowBuilder::new(&app, "chat", WebviewUrl::App("/#/chat".into()))
            .title("Hey TA")
            .inner_size(960.0, 680.0)
            .center()
            .build()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn send_message(
    api_key: String,
    messages: Vec<ChatMessage>,
    system_prompt: String,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    let body = AnthropicRequest {
        model: "claude-sonnet-4-6".to_string(),
        max_tokens: 1024,
        system: system_prompt,
        messages,
    };

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let err = response.text().await.unwrap_or_default();
        return Err(format!("API error: {}", err));
    }

    let parsed: AnthropicResponse = response.json().await.map_err(|e| e.to_string())?;

    parsed
        .content
        .into_iter()
        .next()
        .map(|c| c.text)
        .ok_or_else(|| "Empty response from API".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_nspanel::init());
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![open_chat_window, send_message])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            init_overlay_panel(app.handle());

            // Spawn the Python speech module — path resolved at compile time
            let speech_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../speech");

            match Command::new("python3")
                .arg("main.py")
                .current_dir(&speech_dir)
                .spawn()
            {
                Ok(child) => {
                    app.manage(SpeechProcess(Mutex::new(Some(child))));
                    println!("[TA] Speech module started.");
                }
                Err(e) => {
                    eprintln!("[TA] Failed to start speech module: {e}");
                    app.manage(SpeechProcess(Mutex::new(None)));
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Kill Python when the last window closes
            if let tauri::WindowEvent::Destroyed = event {
                let app = window.app_handle();
                if app.webview_windows().is_empty() {
                    if let Some(state) = app.try_state::<SpeechProcess>() {
                        if let Ok(mut guard) = state.0.lock() {
                            if let Some(mut child) = guard.take() {
                                let _ = child.kill();
                            }
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Convert the overlay window to a floating NSPanel — copied from Pluely's lib.rs init()
#[cfg(target_os = "macos")]
#[allow(deprecated, unexpected_cfgs)]
fn init_overlay_panel(app_handle: &tauri::AppHandle) {
    let window = app_handle.get_webview_window("overlay").unwrap();
    let panel = window.to_panel().unwrap();

    let delegate = panel_delegate!(HeyTAPanelDelegate {
        window_did_become_key,
        window_did_resign_key
    });

    delegate.set_listener(Box::new(move |delegate_name: String| {
        match delegate_name.as_str() {
            "window_did_become_key" => {}
            "window_did_resign_key" => {}
            _ => {}
        }
    }));

    // Float above all other windows (NSFloatWindowLevel = 4)
    #[allow(non_upper_case_globals)]
    const NSFloatWindowLevel: i32 = 4;
    panel.set_level(NSFloatWindowLevel);

    // Don't steal focus from other apps when clicked
    #[allow(non_upper_case_globals)]
    const NSWindowStyleMaskNonActivatingPanel: i32 = 1 << 7;
    panel.set_style_mask(NSWindowStyleMaskNonActivatingPanel);

    // Show on all Spaces, including fullscreen apps
    #[allow(deprecated)]
    panel.set_collection_behaviour(
        NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces,
    );

    panel.set_delegate(delegate);
}
