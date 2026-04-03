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
import Labels from "./pages/Labels";
import Events from "./pages/Events";
import StylesDB from "./pages/StylesDB";
import Settings from "./pages/Settings";
import ScraperDashboard from "./pages/scraper/ScraperDashboard";
import ScraperPages from "./pages/scraper/ScraperPages";
import ScraperPageDetail from "./pages/scraper/ScraperPageDetail";
import ScraperEvents from "./pages/scraper/ScraperEvents";
import ScraperSources from "./pages/scraper/ScraperSources";
import ScraperRefData from "./pages/scraper/ScraperRefData";
import ScraperDiscoveries from "./pages/scraper/ScraperDiscoveries";
import ScraperSettings from "./pages/scraper/ScraperSettings";
import { AudioPlayerProvider } from "./contexts/AudioPlayerContext";
import { checkPendingFollowUps } from "./lib/flomo";
import { checkAndRefreshRAEvents } from "./lib/ra";
import { checkAndImportScraperEvents } from "./lib/scraper-sync";

export default function App() {
  // On every app open: send follow-up questions for yesterday's sessions
  useEffect(() => {
    checkPendingFollowUps();
  }, []);

  // On every app open: refresh RA events for followed entities (24h TTL)
  useEffect(() => {
    checkAndRefreshRAEvents();
  }, []);

  // On every app open: import matched scraper events (1h TTL)
  useEffect(() => {
    checkAndImportScraperEvents();
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
            <Route path="labels" element={<Labels />} />
            <Route path="events" element={<Events />} />
            <Route path="styles" element={<StylesDB />} />
            <Route path="settings" element={<Settings />} />
            <Route path="scraper" element={<ScraperDashboard />} />
            <Route path="scraper/pages" element={<ScraperPages />} />
            <Route path="scraper/pages/:id" element={<ScraperPageDetail />} />
            <Route path="scraper/events" element={<ScraperEvents />} />
            <Route path="scraper/sources" element={<ScraperSources />} />
            <Route path="scraper/refdata" element={<ScraperRefData />} />
            <Route path="scraper/discoveries" element={<ScraperDiscoveries />} />
            <Route path="scraper/settings" element={<ScraperSettings />} />
          </Route>
        </Routes>
        <PWAInstallBanner />
        <GlobalAudioPlayer />
      </BrowserRouter>
    </AudioPlayerProvider>
  );
}

// Made with Bob
