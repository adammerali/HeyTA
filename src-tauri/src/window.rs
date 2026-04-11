//! Window management — positioning, creation, and lifecycle control.
//!
//! # Window Topology
//!
//! Hey TA uses a multi-window architecture where each window has a distinct role:
//!
//! | Window | Type | Visibility | Purpose |
//! |--------|------|------------|---------|
//! | `overlay` | NSPanel | Always visible | Floating control bar |
//! | `dashboard` | Standard | Toggle on demand | Response, history, settings |
//! | `capture-overlay-{N}` | Transparent | Ephemeral | Region selection during screenshot |
//!
//! # Hide-on-Close Pattern
//!
//! The dashboard intercepts `CloseRequested` and hides instead of destroying.
//! This preserves React state (current tab, scroll position, streaming response)
//! across toggle cycles. Destroying and recreating would reset all state and
//! cause a visible flash as the webview re-renders.

use tauri::{App, AppHandle, Manager, Runtime, WebviewWindow, WebviewWindowBuilder};

#[cfg(target_os = "macos")]
use tauri::LogicalPosition;

/// Vertical offset from the screen top for the overlay bar (physical pixels).
/// 54px clears the macOS menu bar (22px) plus a comfortable margin.
const TOP_OFFSET: i32 = 54;

/// Position the main overlay window at the top-center of the primary monitor.
///
/// Called once during app setup. The overlay is centered horizontally and offset
/// from the top by `TOP_OFFSET` to sit just below the macOS menu bar.
pub fn setup_main_window(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let window = app
        .get_webview_window("overlay")
        .or_else(|| app.get_webview_window("main"))
        .or_else(|| app.webview_windows().values().next().cloned())
        .ok_or("No window found")?;

    position_window_top_center(&window, TOP_OFFSET)?;
    Ok(())
}

/// Center a window horizontally on the primary monitor at the given Y offset.
fn position_window_top_center(
    window: &WebviewWindow,
    y_offset: i32,
) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(monitor) = window.primary_monitor()? {
        let monitor_size = monitor.size();
        let window_size = window.outer_size()?;
        let center_x = (monitor_size.width as i32 - window_size.width as i32) / 2;
        window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: center_x,
            y: y_offset,
        }))?;
    }
    Ok(())
}

/// Dynamically resize the overlay bar height.
///
/// Called by the frontend when popovers (camera preview, mic visualizer, API key entry)
/// expand or collapse. The width stays fixed at 680 logical pixels (the overlay bar's
/// design width), only the height changes.
#[tauri::command]
pub fn set_window_height(window: tauri::WebviewWindow, height: u32) -> Result<(), String> {
    use tauri::{LogicalSize, Size};
    let new_size = LogicalSize::new(680.0, height as f64);
    window
        .set_size(Size::Logical(new_size))
        .map_err(|e| format!("Failed to resize: {}", e))?;
    Ok(())
}

/// Show the dashboard window (creating it if needed).
#[tauri::command]
pub fn open_dashboard(app: tauri::AppHandle) -> Result<(), String> {
    show_dashboard_window(&app)
}

/// Toggle dashboard visibility — show if hidden, hide if visible.
///
/// This is the primary entry point for the Cmd+Shift+P shortcut and the
/// panel button in the overlay bar.
#[tauri::command]
pub fn toggle_dashboard(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(dw) = app.get_webview_window("dashboard") {
        match dw.is_visible() {
            Ok(true) => {
                dw.hide().map_err(|e| format!("Failed to hide: {}", e))?;
            }
            Ok(false) => {
                dw.show().map_err(|e| format!("Failed to show: {}", e))?;
                dw.set_focus()
                    .map_err(|e| format!("Failed to focus: {}", e))?;
            }
            Err(e) => return Err(format!("Failed to check visibility: {}", e)),
        }
    } else {
        show_dashboard_window(&app)?;
    }
    Ok(())
}

/// Create the dashboard window with platform-appropriate styling.
///
/// # macOS-Specific Styling
///
/// On macOS, the dashboard uses:
/// - `hidden_title(true)` + `TitleBarStyle::Overlay`: Creates a clean look where
///   the traffic lights (close/minimize/fullscreen) sit directly on the content
/// - `traffic_light_position(14, 18)`: Positions traffic lights to align with
///   the custom title bar area in the React UI
///
/// The window starts hidden and is shown explicitly after creation. This avoids
/// the brief flash of an empty webview while React mounts.
pub fn create_dashboard_window<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<WebviewWindow<R>, tauri::Error> {
    let base = WebviewWindowBuilder::new(
        app,
        "dashboard",
        tauri::WebviewUrl::App("/#/dashboard".into()),
    );

    #[cfg(target_os = "macos")]
    let base = base
        .title("Hey TA")
        .center()
        .decorations(true)
        .inner_size(960.0, 700.0)
        .min_inner_size(700.0, 500.0)
        .hidden_title(true)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .visible(false)
        .traffic_light_position(LogicalPosition::new(14.0, 18.0));

    #[cfg(not(target_os = "macos"))]
    let base = base
        .title("Hey TA")
        .center()
        .decorations(true)
        .inner_size(960.0, 700.0)
        .min_inner_size(700.0, 500.0)
        .visible(false);

    let window = base.build()?;
    setup_dashboard_close_handler(&window);
    Ok(window)
}

/// Intercept close events to hide instead of destroy.
///
/// Without this, clicking the red traffic light would destroy the window,
/// losing all React state. With it, the window just hides — the next toggle
/// shows it instantly with all state preserved.
fn setup_dashboard_close_handler<R: Runtime>(window: &WebviewWindow<R>) {
    let wc = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            if let Err(e) = wc.hide() {
                eprintln!("Failed to hide dashboard on close: {}", e);
            }
        }
    });
}

/// Show (or create + show) the dashboard window with focus.
pub fn show_dashboard_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(dw) = app.get_webview_window("dashboard") {
        dw.show().map_err(|e| format!("Failed to show: {}", e))?;
        dw.set_focus()
            .map_err(|e| format!("Failed to focus: {}", e))?;
    } else {
        let w = create_dashboard_window(app)
            .map_err(|e| format!("Failed to create dashboard: {}", e))?;
        w.show().map_err(|e| format!("Failed to show: {}", e))?;
        w.set_focus()
            .map_err(|e| format!("Failed to focus: {}", e))?;
    }
    Ok(())
}
