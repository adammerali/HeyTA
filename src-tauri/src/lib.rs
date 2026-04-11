mod api;
mod capture;
mod window;

use capture::CaptureState;
use tauri::Manager;

#[cfg(target_os = "macos")]
#[allow(deprecated)]
use tauri_nspanel::{cocoa::appkit::NSWindowCollectionBehavior, panel_delegate, WebviewWindowExt};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .manage(CaptureState::default())
        .plugin(tauri_plugin_opener::init());

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

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

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
