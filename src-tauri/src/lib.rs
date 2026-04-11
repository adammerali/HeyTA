//! Hey TA — Tauri application entry point.
//!
//! Initializes the Tauri app with:
//! - NSPanel-based non-activating overlay (macOS)
//! - Global keyboard shortcuts for hands-free control
//! - All Tauri command registrations
//! - Dashboard window pre-creation

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

/// Main app entry point — builds the Tauri application with all plugins,
/// commands, managed state, and platform-specific setup.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .manage(CaptureState::default())
        .manage(StreamCancelFlag::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build());

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

/// Register global keyboard shortcuts for hands-free operation:
/// - Cmd+Shift+H — Toggle overlay bar visibility
/// - Cmd+Shift+P — Toggle dashboard panel
/// - Cmd+Shift+S — Trigger native screenshot
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

/// Initialize the overlay window as an NSPanel — a non-activating panel that
/// floats above other windows without stealing keyboard focus from the
/// student's active application.
///
/// Panel configuration:
/// - `NSFloatWindowLevel` (4): Floats above normal windows
/// - `NSWindowStyleMaskNonActivatingPanel` (1 << 7): Clicks don't activate the app
/// - `NSWindowCollectionBehaviorFullScreenAuxiliary`: Visible alongside fullscreen apps
/// - `NSWindowCollectionBehaviorCanJoinAllSpaces`: Appears on all macOS desktops
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

    // NSFloatWindowLevel = 4 — places the panel above standard windows
    #[allow(non_upper_case_globals)]
    const NSFloatWindowLevel: i32 = 4;
    panel.set_level(NSFloatWindowLevel);

    // NSWindowStyleMaskNonActivatingPanel (1 << 7) — prevents the panel from
    // becoming the active window, so the student's app retains keyboard focus
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
