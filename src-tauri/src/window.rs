use tauri::{App, AppHandle, Manager, Runtime, WebviewWindow, WebviewWindowBuilder};

#[cfg(target_os = "macos")]
use tauri::LogicalPosition;

const TOP_OFFSET: i32 = 54;

pub fn setup_main_window(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let window = app
        .get_webview_window("overlay")
        .or_else(|| app.get_webview_window("main"))
        .or_else(|| app.webview_windows().values().next().cloned())
        .ok_or("No window found")?;

    position_window_top_center(&window, TOP_OFFSET)?;
    Ok(())
}

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

#[tauri::command]
pub fn set_window_height(window: tauri::WebviewWindow, height: u32) -> Result<(), String> {
    use tauri::{LogicalSize, Size};
    let new_size = LogicalSize::new(680.0, height as f64);
    window
        .set_size(Size::Logical(new_size))
        .map_err(|e| format!("Failed to resize: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn open_dashboard(app: tauri::AppHandle) -> Result<(), String> {
    show_dashboard_window(&app)
}

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
