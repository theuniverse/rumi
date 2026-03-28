import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import GlobalAudioPlayer from "./components/GlobalAudioPlayer";
import PWAInstallBanner from "./components/PWAInstallBanner";
import Dashboard from "./pages/Dashboard";
import Analyze from "./pages/Analyze";
import Sessions from "./pages/Sessions";
import Places from "./pages/Places";
import StylesDB from "./pages/StylesDB";
import Settings from "./pages/Settings";
import { AudioPlayerProvider } from "./contexts/AudioPlayerContext";
import { checkPendingFollowUps } from "./lib/flomo";

export default function App() {
  // On every app open: send follow-up questions for yesterday's sessions
  useEffect(() => {
    checkPendingFollowUps();
  }, []);

  return (
    <AudioPlayerProvider>
      <BrowserRouter basename="/rumi">
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="analyze" element={<Analyze />} />
            <Route path="sessions" element={<Sessions />} />
            <Route path="places" element={<Places />} />
            <Route path="styles" element={<StylesDB />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
        <PWAInstallBanner />
        <GlobalAudioPlayer />
      </BrowserRouter>
    </AudioPlayerProvider>
  );
}

// Made with Bob
