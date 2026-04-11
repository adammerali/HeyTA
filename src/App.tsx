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
