/**
 * App — Dashboard Window Router
 *
 * The dashboard window uses HashRouter (hash-based routing is required because
 * Tauri serves files from the filesystem, not a web server, so HTML5 pushState
 * routing would fail on page reload).
 *
 * All routes redirect to /dashboard which renders the SidePanel component.
 * This is a single-route app currently, but the router is in place for future
 * expansion (e.g., /settings, /about, /session/:id).
 */

import { Routes, Route, Navigate } from "react-router-dom";
import SidePanel from "./pages/SidePanel";

export default function App() {
  return (
    <Routes>
      <Route path="/dashboard" element={<SidePanel />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
