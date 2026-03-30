import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import MobileHeader from "./MobileHeader";
import { useAudioPlayer } from "../contexts/AudioPlayerContext";

export default function Layout() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { visible: playerVisible } = useAudioPlayer();

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Close drawer when switching to desktop
  useEffect(() => {
    if (!isMobile) {
      setIsDrawerOpen(false);
    }
  }, [isMobile]);

  // Prevent body scroll when drawer is open on mobile
  useEffect(() => {
    if (isMobile && isDrawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobile, isDrawerOpen]);

  const toggleDrawer = () => {
    setIsDrawerOpen(!isDrawerOpen);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
  };

  // Handle swipe to close
  useEffect(() => {
    if (!isMobile || !isDrawerOpen) return;

    let touchStartX = 0;
    let touchEndX = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.changedTouches[0].screenX;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
    };

    const handleSwipe = () => {
      // Swipe left to close (at least 50px)
      if (touchStartX - touchEndX > 50) {
        closeDrawer();
      }
    };

    document.addEventListener("touchstart", handleTouchStart);
    document.addEventListener("touchend", handleTouchEnd);

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isMobile, isDrawerOpen]);

  return (
    <div className="flex h-full bg-base">
      {/* Mobile Header */}
      {isMobile && (
        <MobileHeader isDrawerOpen={isDrawerOpen} onToggleDrawer={toggleDrawer} />
      )}

      {/* Backdrop Overlay for Mobile */}
      {isMobile && isDrawerOpen && (
        <div
          className="fixed inset-0 bg-base/80 backdrop-blur-sm z-40 transition-opacity duration-300"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - Desktop: always visible, Mobile: drawer */}
      {isMobile ? (
        <Sidebar isOpen={isDrawerOpen} onClose={closeDrawer} isMobile={true} />
      ) : (
        <Sidebar />
      )}

      {/* Main Content */}
      <main
        className="flex-1 overflow-y-auto"
        style={isMobile ? {
          paddingTop: 'calc(3.5rem + var(--safe-area-top))',
          paddingBottom: playerVisible ? '5rem' : 'max(10px, var(--safe-area-bottom))'
        } : undefined}
      >
        <Outlet />
      </main>
    </div>
  );
}

// Made with Bob
