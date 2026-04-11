import { Routes, Route } from "react-router-dom";
import OverlayBar from "./pages/OverlayBar";
import ChatWindow from "./pages/ChatWindow";

function App() {
  return (
    <Routes>
      <Route path="/" element={<OverlayBar />} />
      <Route path="/chat" element={<ChatWindow />} />
    </Routes>
  );
}

export default App;
