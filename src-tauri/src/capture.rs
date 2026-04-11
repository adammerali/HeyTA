//! Screen capture and region selection — handles multi-monitor DPI-aware capture
//! via the `xcap` crate and provides a capture overlay for user-driven region selection.

use base64::Engine;
use image::codecs::png::PngEncoder;
use image::{ColorType, GenericImageView, ImageEncoder};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::{thread, time::Duration};
use tauri::Emitter;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use xcap::Monitor;

use crate::error::AppError;

/// Coordinates and dimensions for a user-selected capture region.
/// Values are in physical (pixel) coordinates after DPI scaling.
#[derive(Debug, Serialize, Deserialize)]
pub struct SelectionCoords {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Stores the raw captured RGBA image for a single monitor.
#[derive(Debug, Clone)]
pub struct MonitorInfo {
    pub image: image::RgbaImage,
}

/// Shared state for the capture workflow — stores per-monitor screenshots
/// and tracks whether the capture overlay is currently active.
pub struct CaptureState {
    pub captured_monitors: Arc<Mutex<HashMap<usize, MonitorInfo>>>,
    pub overlay_active: Arc<AtomicBool>,
}

impl Default for CaptureState {
    fn default() -> Self {
        Self {
            captured_monitors: Arc::default(),
            overlay_active: Arc::new(AtomicBool::new(false)),
        }
    }
}

/// Launch the screen capture workflow: snapshot each monitor, then create
/// transparent overlay windows on each display for the user to draw a
/// selection rectangle.
///
/// The overlay windows route to the `capture-overlay-{index}` label which
/// the frontend uses to render the selection UI (see `Overlay.tsx`).
#[tauri::command]
pub async fn start_screen_capture(app: tauri::AppHandle) -> Result<(), AppError> {
    let capture_monitors =
        Monitor::all().map_err(|e| AppError::Capture(format!("Failed to get monitors: {}", e)))?;

    if capture_monitors.is_empty() {
        return Err(AppError::Capture("No monitors found".to_string()));
    }

    let tauri_monitors = app
        .available_monitors()
        .map_err(|e| AppError::Capture(format!("Failed to get monitor layout: {}", e)))?;

    let state = app.state::<CaptureState>();
    if state.overlay_active.load(Ordering::SeqCst) {
        let _ = close_overlay_window(app.clone());
    }
    state.overlay_active.store(true, Ordering::SeqCst);
    let mut captured_monitors = HashMap::new();

    for (idx, monitor) in capture_monitors.iter().enumerate() {
        let captured_image = monitor.capture_image().map_err(|e| {
            state.overlay_active.store(false, Ordering::SeqCst);
            AppError::Capture(format!("Failed to capture monitor {}: {}", idx, e))
        })?;
        captured_monitors.insert(idx, MonitorInfo { image: captured_image });
    }

    *state.captured_monitors.lock().unwrap() = captured_monitors;

    for (label, window) in app.webview_windows() {
        if label.starts_with("capture-overlay-") {
            window.destroy().ok();
        }
    }

    for (idx, monitor) in capture_monitors.iter().enumerate() {
        // Convert physical pixel coordinates to logical coordinates
        // to account for HiDPI/Retina scaling differences between
        // xcap (physical pixels) and Tauri (logical points).
        let (logical_width, logical_height, logical_x, logical_y) =
            if let Some(display) = tauri_monitors.get(idx) {
                let sf = display.scale_factor();
                let size = display.size();
                let pos = display.position();
                (
                    size.width as f64 / sf,
                    size.height as f64 / sf,
                    pos.x as f64 / sf,
                    pos.y as f64 / sf,
                )
            } else {
                (
                    monitor.width() as f64,
                    monitor.height() as f64,
                    monitor.x() as f64,
                    monitor.y() as f64,
                )
            };

        let window_label = format!("capture-overlay-{}", idx);

        let overlay = WebviewWindowBuilder::new(
            &app,
            &window_label,
            WebviewUrl::App("index.html".into()),
        )
        .title("Screen Capture")
        .inner_size(logical_width, logical_height)
        .position(logical_x, logical_y)
        .transparent(true)
        .always_on_top(true)
        .decorations(false)
        .skip_taskbar(true)
        .resizable(false)
        .closable(false)
        .minimizable(false)
        .maximizable(false)
        .visible(false)
        .focused(true)
        .accept_first_mouse(true)
        .build()
        .map_err(|e| {
            state.overlay_active.store(false, Ordering::SeqCst);
            AppError::Window(format!("Failed to create overlay window {}: {}", idx, e))
        })?;

        thread::sleep(Duration::from_millis(100));
        overlay.show().ok();
        overlay.set_always_on_top(true).ok();

        if monitor.is_primary() {
            overlay.set_focus().ok();
            overlay
                .request_user_attention(Some(tauri::UserAttentionType::Critical))
                .ok();
        }
    }

    thread::sleep(Duration::from_millis(100));
    for (idx, monitor) in capture_monitors.iter().enumerate() {
        if monitor.is_primary() {
            let label = format!("capture-overlay-{}", idx);
            if let Some(window) = app.get_webview_window(&label) {
                window.set_focus().ok();
            }
            break;
        }
    }

    Ok(())
}

/// Close all capture overlay windows and reset capture state.
#[tauri::command]
pub fn close_overlay_window(app: tauri::AppHandle) -> Result<(), AppError> {
    let webview_windows = app.webview_windows();
    for (label, window) in webview_windows.iter() {
        if label.starts_with("capture-overlay-") {
            window.destroy().ok();
        }
    }

    let state = app.state::<CaptureState>();
    state.captured_monitors.lock().unwrap().clear();
    state.overlay_active.store(false, Ordering::SeqCst);

    if let Some(main_window) = app.get_webview_window("overlay") {
        main_window.emit("capture-closed", ()).unwrap_or(());
    }

    Ok(())
}

/// Crop the user-selected region from a previously captured monitor image.
///
/// Coordinates are in physical pixels (the frontend multiplies by `devicePixelRatio`
/// before invoking). The cropped region is encoded as a base64 PNG and emitted
/// as a `captured-selection` Tauri event for cross-window delivery.
#[tauri::command]
pub async fn capture_selected_area(
    app: tauri::AppHandle,
    coords: SelectionCoords,
    monitor_index: usize,
) -> Result<String, AppError> {
    let state = app.state::<CaptureState>();
    let mut captured_monitors = state.captured_monitors.lock().unwrap();

    let monitor_info = captured_monitors.remove(&monitor_index).ok_or({
        state.overlay_active.store(false, Ordering::SeqCst);
        AppError::Capture(format!("No captured image found for monitor {}", monitor_index))
    })?;

    if coords.width == 0 || coords.height == 0 {
        return Err(AppError::Capture("Invalid selection dimensions".to_string()));
    }

    // Clamp coordinates to image bounds to prevent out-of-bounds access
    let img_width = monitor_info.image.width();
    let img_height = monitor_info.image.height();
    let x = coords.x.min(img_width.saturating_sub(1));
    let y = coords.y.min(img_height.saturating_sub(1));
    let width = coords.width.min(img_width - x);
    let height = coords.height.min(img_height - y);

    let cropped = monitor_info.image.view(x, y, width, height).to_image();

    let mut png_buffer = Vec::new();
    PngEncoder::new(&mut png_buffer)
        .write_image(
            cropped.as_raw(),
            cropped.width(),
            cropped.height(),
            ColorType::Rgba8.into(),
        )
        .map_err(|e| AppError::Encoding(format!("PNG encode: {}", e)))?;

    let base64_str = base64::engine::general_purpose::STANDARD.encode(png_buffer);

    captured_monitors.clear();
    drop(captured_monitors);

    let webview_windows = app.webview_windows();
    for (label, window) in webview_windows.iter() {
        if label.starts_with("capture-overlay-") {
            window.destroy().ok();
        }
    }

    app.emit("captured-selection", &base64_str)
        .map_err(|e| AppError::Internal(format!("Failed to emit event: {}", e)))?;

    state.overlay_active.store(false, Ordering::SeqCst);
    Ok(base64_str)
}

/// Capture the full monitor that the calling window occupies as a base64 PNG.
///
/// Uses overlap-area heuristic to determine which monitor the window sits on,
/// falling back to closest-center distance if no overlap exists. This handles
/// multi-monitor setups where the window may span display boundaries.
#[tauri::command]
pub async fn capture_to_base64(window: tauri::WebviewWindow) -> Result<String, AppError> {
    let monitor_fallback = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());

    let geometry = match (window.outer_position(), window.outer_size()) {
        (Ok(position), Ok(size)) => {
            let w = size.width.min(i32::MAX as u32) as i32;
            let h = size.height.min(i32::MAX as u32) as i32;
            (position.x, position.y, position.x + w, position.y + h, position.x + w / 2, position.y + h / 2)
        }
        _ => {
            if let Some(m) = &monitor_fallback {
                let pos = m.position();
                let size = m.size();
                let w = size.width.min(i32::MAX as u32) as i32;
                let h = size.height.min(i32::MAX as u32) as i32;
                (pos.x, pos.y, pos.x + w, pos.y + h, pos.x + w / 2, pos.y + h / 2)
            } else {
                (0, 0, 0, 0, 0, 0)
            }
        }
    };

    let (wl, wt, wr, wb, wcx, wcy) = geometry;

    tauri::async_runtime::spawn_blocking(move || {
        let monitors = Monitor::all()
            .map_err(|e| AppError::Capture(format!("Failed to get monitors: {}", e)))?;
        if monitors.is_empty() {
            return Err(AppError::Capture("No monitors found".to_string()));
        }

        let target_idx = find_best_monitor(&monitors, wl, wt, wr, wb, wcx, wcy);

        let monitor = monitors
            .into_iter()
            .nth(target_idx)
            .ok_or_else(|| AppError::Capture("Failed to determine target monitor".to_string()))?;

        let img = monitor
            .capture_image()
            .map_err(|e| AppError::Capture(format!("Failed to capture image: {}", e)))?;
        let mut png_buffer = Vec::new();
        PngEncoder::new(&mut png_buffer)
            .write_image(img.as_raw(), img.width(), img.height(), ColorType::Rgba8.into())
            .map_err(|e| AppError::Encoding(format!("PNG encode: {}", e)))?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(png_buffer);
        Ok(b64)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Task panicked: {}", e)))?
}

/// Find the monitor with the most overlap area with the given window rect.
/// Falls back to closest-center distance if no overlap exists.
fn find_best_monitor(
    monitors: &[Monitor],
    wl: i32, wt: i32, wr: i32, wb: i32,
    wcx: i32, wcy: i32,
) -> usize {
    let mut best_idx: Option<usize> = None;
    let mut best_area: i64 = 0;

    for (idx, monitor) in monitors.iter().enumerate() {
        let ml = monitor.x();
        let mt = monitor.y();
        let mr = ml + monitor.width() as i32;
        let mb = mt + monitor.height() as i32;

        let ow = (wr.min(mr) - wl.max(ml)).max(0);
        let oh = (wb.min(mb) - wt.max(mt)).max(0);
        let area = (ow as i64) * (oh as i64);

        if area > best_area {
            best_area = area;
            best_idx = Some(idx);
        }
    }

    best_idx.unwrap_or_else(|| {
        let mut ci = 0usize;
        let mut cd = i128::MAX;
        for (idx, monitor) in monitors.iter().enumerate() {
            let mcx = monitor.x() + monitor.width() as i32 / 2;
            let mcy = monitor.y() + monitor.height() as i32 / 2;
            let dx = (wcx - mcx) as i128;
            let dy = (wcy - mcy) as i128;
            let d = dx * dx + dy * dy;
            if d < cd {
                cd = d;
                ci = idx;
            }
        }
        ci
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamp_coords_within_image_bounds() {
        let img_width: u32 = 1920;
        let img_height: u32 = 1080;

        // Coordinates within bounds
        let x: u32 = 100;
        let y: u32 = 100;
        let clamped_x = x.min(img_width.saturating_sub(1));
        let clamped_y = y.min(img_height.saturating_sub(1));
        assert_eq!(clamped_x, 100);
        assert_eq!(clamped_y, 100);

        // Coordinates exceeding bounds
        let x2: u32 = 2000;
        let y2: u32 = 1200;
        let clamped_x2 = x2.min(img_width.saturating_sub(1));
        let clamped_y2 = y2.min(img_height.saturating_sub(1));
        assert_eq!(clamped_x2, 1919);
        assert_eq!(clamped_y2, 1079);
    }

    #[test]
    fn clamp_width_to_remaining_space() {
        let img_width: u32 = 1920;
        let x: u32 = 1800;
        let requested_width: u32 = 500;
        let actual_width = requested_width.min(img_width - x);
        assert_eq!(actual_width, 120);
    }

    #[test]
    fn saturating_sub_prevents_underflow() {
        let img_width: u32 = 0;
        let result = img_width.saturating_sub(1);
        assert_eq!(result, 0);
    }
}
