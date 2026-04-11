use serde::Serialize;

/// Typed error enum for all Tauri commands, enabling the frontend
/// to distinguish between error categories (auth, rate-limit, network, etc.).
#[derive(Debug)]
pub enum AppError {
    /// 401 — API key is invalid or missing
    Unauthorized,
    /// 429 — Rate limited by the API provider
    RateLimit { retry_after_secs: Option<u64> },
    /// 4xx/5xx — Generic API error with status and body
    Api { status: u16, message: String },
    /// Network or connection failure
    Network(String),
    /// Error encoding/decoding data (base64, JSON, image)
    Encoding(String),
    /// Screen capture or monitor access failure
    Capture(String),
    /// Window management error
    Window(String),
    /// Request was cancelled by the user
    Cancelled,
    /// Any other internal error
    Internal(String),
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::Unauthorized => write!(f, "Unauthorized — check your API key"),
            AppError::RateLimit { retry_after_secs } => {
                if let Some(secs) = retry_after_secs {
                    write!(f, "Rate limited — retry after {}s", secs)
                } else {
                    write!(f, "Rate limited — please wait before retrying")
                }
            }
            AppError::Api { status, message } => write!(f, "API error ({}): {}", status, message),
            AppError::Network(msg) => write!(f, "Network error: {}", msg),
            AppError::Encoding(msg) => write!(f, "Encoding error: {}", msg),
            AppError::Capture(msg) => write!(f, "Capture error: {}", msg),
            AppError::Window(msg) => write!(f, "Window error: {}", msg),
            AppError::Cancelled => write!(f, "Request cancelled"),
            AppError::Internal(msg) => write!(f, "Internal error: {}", msg),
        }
    }
}

impl std::error::Error for AppError {}

/// Serialize into a JSON object with `error_type` and `message` fields
/// so the frontend can programmatically handle specific error categories.
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AppError", 3)?;

        let (error_type, status) = match self {
            AppError::Unauthorized => ("unauthorized", Some(401u16)),
            AppError::RateLimit { .. } => ("rate_limit", Some(429)),
            AppError::Api { status, .. } => ("api_error", Some(*status)),
            AppError::Network(_) => ("network", None),
            AppError::Encoding(_) => ("encoding", None),
            AppError::Capture(_) => ("capture", None),
            AppError::Window(_) => ("window", None),
            AppError::Cancelled => ("cancelled", None),
            AppError::Internal(_) => ("internal", None),
        };

        state.serialize_field("error_type", error_type)?;
        state.serialize_field("message", &self.to_string())?;
        state.serialize_field("status", &status)?;
        state.end()
    }
}

/// Classify an HTTP status code into the appropriate AppError variant.
pub fn classify_api_error(status: u16, body: String) -> AppError {
    match status {
        401 => AppError::Unauthorized,
        429 => AppError::RateLimit { retry_after_secs: None },
        _ => AppError::Api { status, message: body },
    }
}

impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        AppError::Network(err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::Encoding(err.to_string())
    }
}

impl From<base64::DecodeError> for AppError {
    fn from(err: base64::DecodeError) -> Self {
        AppError::Encoding(format!("Base64 decode: {}", err))
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Internal(err.to_string())
    }
}

impl From<image::ImageError> for AppError {
    fn from(err: image::ImageError) -> Self {
        AppError::Encoding(format!("Image: {}", err))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_401_as_unauthorized() {
        let err = classify_api_error(401, "invalid key".into());
        assert!(matches!(err, AppError::Unauthorized));
        assert!(err.to_string().contains("Unauthorized"));
    }

    #[test]
    fn classify_429_as_rate_limit() {
        let err = classify_api_error(429, "too many requests".into());
        assert!(matches!(err, AppError::RateLimit { .. }));
    }

    #[test]
    fn classify_500_as_api_error() {
        let err = classify_api_error(500, "internal server error".into());
        match err {
            AppError::Api { status, message } => {
                assert_eq!(status, 500);
                assert!(message.contains("internal"));
            }
            _ => panic!("Expected Api variant"),
        }
    }

    #[test]
    fn display_formats_correctly() {
        let err = AppError::Api { status: 503, message: "service unavailable".into() };
        assert_eq!(err.to_string(), "API error (503): service unavailable");
    }

    #[test]
    fn serializes_with_error_type() {
        let err = AppError::Unauthorized;
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["error_type"], "unauthorized");
        assert_eq!(json["status"], 401);
    }
}
