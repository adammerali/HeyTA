//! Hey TA — Tauri application entry point and orchestration layer.
//!
//! # Architecture Decision: Single-Process Tauri App
//!
//! We chose Tauri 2 over Electron for three critical reasons:
//! 1. **Native API access**: Tauri's Rust backend gives us direct access to macOS
//!    private APIs (NSPanel) needed for the non-activating overlay behavior.
//! 2. **CORS bypass**: By routing all OpenAI HTTP requests through Rust's `reqwest`,
//!    we avoid browser CORS restrictions entirely — no proxy server needed.
//! 3. **Binary size**: Tauri produces ~8MB binaries vs Electron's ~150MB, which matters
//!    for a tool students download and run locally.
//!
//! # Window Architecture
//!
//! The app runs three types of windows:
//! - **Overlay bar** (`overlay`): NSPanel-based floating bar, always visible, non-activating
//! - **Dashboard** (`dashboard`): Standard window with tabs for response, history, notes
//! - **Capture overlays** (`capture-overlay-{N}`): Ephemeral fullscreen transparent windows
//!   created per-monitor during screenshot selection, destroyed after use

mod api;
mod capture;
pub mod error;
mod window;

use api::StreamCancelFlag;
use capture::CaptureState;
use tauri::{Emitter, Manager};

#[cfg(target_os = "macos")]
#[allow(deprecated)]
use tauri_nspanel::{cocoa::appkit::NSWindowCollectionBehavior, panel_delegate, WebviewWindowExt};

/// Build and launch the Tauri application.
///
/// # State Management
///
/// Two pieces of shared state are registered via `manage()`:
/// - `CaptureState`: Holds per-monitor screenshots during the region selection workflow,
///   plus an atomic bool tracking whether the capture overlay is active.
/// - `StreamCancelFlag`: An atomic bool that the frontend can set via `cancel_stream`
///   to abort an in-flight GPT-4o SSE stream from the Rust side.
///
/// # Plugin Registration
///
/// - `tauri-plugin-opener`: System default app opening
/// - `tauri-plugin-global-shortcut`: Registers Cmd+Shift+H/P/S for hands-free control
/// - `tauri-nspanel` (macOS only): Converts the overlay webview into an NSPanel
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .manage(CaptureState::default())
        .manage(StreamCancelFlag::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build());

    // NSPanel plugin is macOS-only — on other platforms, the overlay falls back to
    // a standard always-on-top window (losing non-activating behavior but keeping
    // all other functionality). This is our mitigation for the platform dependency.
    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_nspanel::init());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            window::set_window_height,
            window::open_dashboard,
            window::toggle_dashboard,
            capture::capture_to_base64,
            capture::start_screen_capture,
            capture::capture_selected_area,
            capture::close_overlay_window,
            api::transcribe_audio,
            api::chat_stream_response,
            api::cancel_stream,
            api::send_message_simple,
            api::fetch_tts_audio,
            api::native_screenshot,
        ])
        .setup(|app| {
            window::setup_main_window(app).expect("Failed to setup main window");

            #[cfg(target_os = "macos")]
            init_overlay_panel(app.handle());

            // Pre-create the dashboard window hidden so toggling it is instant.
            // Without this, the first toggle would have a visible creation delay.
            if app.get_webview_window("dashboard").is_none() {
                if let Err(e) = window::create_dashboard_window(app.handle()) {
                    eprintln!("Failed to pre-create dashboard window: {}", e);
                }
            }

            register_global_shortcuts(app.handle());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Register global keyboard shortcuts for hands-free operation.
///
/// # Design Decision: Global vs. App-scoped Shortcuts
///
/// We use *global* shortcuts (work even when Hey TA isn't focused) because the entire
/// product philosophy is hands-free operation while the student uses other apps.
/// App-scoped shortcuts would defeat the purpose — the student would need to click
/// the overlay first, which is exactly the context-switch we're eliminating.
///
/// # Shortcut Assignments
///
/// - **Cmd+Shift+H**: Toggle overlay bar visibility (H = Hey TA)
/// - **Cmd+Shift+P**: Toggle dashboard panel (P = Panel)
/// - **Cmd+Shift+S**: Take a native screenshot (S = Screenshot)
///
/// Each shortcut only fires on `Pressed` (not `Released`) to prevent double-triggers.
/// Failures are logged but don't crash — shortcuts are a convenience, not critical path.
fn register_global_shortcuts(app: &tauri::AppHandle) {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

    let app_handle = app.clone();
    let result = app.global_shortcut().on_shortcut("CmdOrCtrl+Shift+H", move |_app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            if let Some(w) = app_handle.get_webview_window("overlay") {
                match w.is_visible() {
                    Ok(true) => { w.hide().ok(); }
                    Ok(false) => { w.show().ok(); }
                    _ => {}
                }
            }
        }
    });
    if let Err(e) = result {
        eprintln!("Failed to register Cmd+Shift+H shortcut: {}", e);
    }

    let app_handle = app.clone();
    let result = app.global_shortcut().on_shortcut("CmdOrCtrl+Shift+P", move |_app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            let _ = window::toggle_dashboard(app_handle.clone());
        }
    });
    if let Err(e) = result {
        eprintln!("Failed to register Cmd+Shift+P shortcut: {}", e);
    }

    let app_handle = app.clone();
    let result = app.global_shortcut().on_shortcut("CmdOrCtrl+Shift+S", move |_app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            let handle = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                let _ = api::native_screenshot().await;
                if let Some(w) = handle.get_webview_window("overlay") {
                    let _ = w.emit("shortcut-screenshot", ());
                }
            });
        }
    });
    if let Err(e) = result {
        eprintln!("Failed to register Cmd+Shift+S shortcut: {}", e);
    }
}

/// Convert the overlay webview into a macOS NSPanel with non-activating behavior.
///
/// # Why NSPanel?
///
/// Standard macOS windows steal keyboard focus when clicked. For a tutoring overlay,
/// this is unacceptable — if a student clicks the mic button, they'd lose cursor position
/// in their textbook PDF or homework editor. NSPanel with `NSWindowStyleMaskNonActivatingPanel`
/// lets the overlay receive clicks WITHOUT becoming the active window.
///
/// This is Hey TA's most important UX differentiator: no other AI tutoring tool
/// preserves application focus when interacting with the overlay.
///
/// # Panel Configuration
///
/// - **Level 4 (NSFloatWindowLevel)**: Floats above all normal windows but below
///   system dialogs and the menu bar. Chosen over higher levels to avoid blocking
///   macOS permission prompts.
///
/// - **NSWindowStyleMaskNonActivatingPanel (1 << 7)**: The critical flag — prevents
///   the panel from becoming key/main window. Clicks are delivered but focus stays
///   in whatever app the student was using.
///
/// - **FullScreenAuxiliary + CanJoinAllSpaces**: Ensures the overlay is visible
///   alongside fullscreen apps (e.g., a student using a textbook in fullscreen) and
///   across all Mission Control desktops. Without this, switching desktops would
///   hide the overlay.
///
/// # Fallback Strategy
///
/// If `tauri-nspanel` (sourced from a git branch, not a versioned crate) fails to
/// build, the overlay degrades to a standard Tauri always-on-top window. This loses
/// the non-activating behavior but preserves all other functionality. The change
/// requires only removing this function and the NSPanel plugin registration (~20 lines).
#[cfg(target_os = "macos")]
#[allow(deprecated, unexpected_cfgs)]
fn init_overlay_panel(app_handle: &tauri::AppHandle) {
    let window = app_handle.get_webview_window("overlay").unwrap();
    let panel = window.to_panel().unwrap();

    let delegate = panel_delegate!(HeyTAPanelDelegate {
        window_did_become_key,
        window_did_resign_key
    });

    // Delegate callbacks are intentionally empty — we don't need to react to
    // focus changes on the panel itself. They're required by the delegate macro.
    delegate.set_listener(Box::new(move |delegate_name: String| {
        match delegate_name.as_str() {
            "window_did_become_key" => {}
            "window_did_resign_key" => {}
            _ => {}
        }
    }));

    #[allow(non_upper_case_globals)]
    const NSFloatWindowLevel: i32 = 4;
    panel.set_level(NSFloatWindowLevel);

    #[allow(non_upper_case_globals)]
    const NSWindowStyleMaskNonActivatingPanel: i32 = 1 << 7;
    panel.set_style_mask(NSWindowStyleMaskNonActivatingPanel);

    #[allow(deprecated)]
    panel.set_collection_behaviour(
        NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces,
    );

    panel.set_delegate(delegate);
}
