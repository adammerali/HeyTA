import { Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import ChatWindow from "./pages/ChatWindow";

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/chat" element={<ChatWindow />} />
    </Routes>
  );
}

export default App;
