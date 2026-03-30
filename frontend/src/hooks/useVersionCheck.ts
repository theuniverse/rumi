import { useEffect, useState } from "react";

const CURRENT_VERSION = "2026033102520001";
const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

export function useVersionCheck() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}api/version`);
        const data = await response.json();

        if (data.version && data.version !== CURRENT_VERSION) {
          setHasUpdate(true);
          setLatestVersion(data.version);
        }
      } catch (error) {
        console.error("Failed to check version:", error);
      }
    };

    // Check immediately on mount
    checkVersion();

    // Then check periodically
    const interval = setInterval(checkVersion, CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  const reload = () => {
    // Clear all caches and reload
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
    }

    // Clear caches
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name));
      });
    }

    // Force reload
    window.location.reload();
  };

  return {
    hasUpdate,
    latestVersion,
    currentVersion: CURRENT_VERSION,
    reload,
  };
}

// Made with Bob
