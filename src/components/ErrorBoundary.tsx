import React from "react";

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 24,
            color: "#f87171",
            background: "#18181b",
            fontFamily: "monospace",
            fontSize: 13,
            height: "100vh",
            overflow: "auto",
          }}
        >
          <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
          <pre style={{ whiteSpace: "pre-wrap", color: "#a1a1aa" }}>
            {this.state.error?.message}
            {"\n\n"}
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
