import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import GlobalAudioPlayer from "./components/GlobalAudioPlayer";
import PWAInstallBanner from "./components/PWAInstallBanner";
import Dashboard from "./pages/Dashboard";
import Analyze from "./pages/Analyze";
import Sessions from "./pages/Sessions";
import Places from "./pages/Places";
import People from "./pages/People";
import StylesDB from "./pages/StylesDB";
import Settings from "./pages/Settings";
import { AudioPlayerProvider } from "./contexts/AudioPlayerContext";
import { checkPendingFollowUps } from "./lib/flomo";

export default function App() {
  // On every app open: send follow-up questions for yesterday's sessions
  useEffect(() => {
    checkPendingFollowUps();
  }, []);

  // Disable browser swipe-back gesture for native app feel
  useEffect(() => {
    let startX = 0;
    let startY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const deltaX = e.touches[0].clientX - startX;
      const deltaY = e.touches[0].clientY - startY;

      // Prevent horizontal swipe gestures (back/forward navigation)
      // Only prevent if horizontal movement is greater than vertical
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
        // Allow swipe on scrollable elements
        const target = e.target as HTMLElement;
        const isScrollable = target.closest('[data-allow-swipe]');
        if (!isScrollable) {
          e.preventDefault();
        }
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
    };
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
            <Route path="people" element={<People />} />
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
