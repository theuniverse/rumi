import { Download, X } from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall";

export default function PWAInstallBanner() {
  const { isInstallable, promptInstall, dismissPrompt } = usePWAInstall();

  if (!isInstallable) return null;

  const handleInstall = async () => {
    const installed = await promptInstall();
    if (!installed) {
      // User dismissed the install prompt
      console.log("User dismissed install prompt");
    }
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 animate-slide-up">
      <div className="bg-surface border border-rim rounded-lg shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded bg-sand/10 flex items-center justify-center">
            <Download size={20} className="text-sand" strokeWidth={1.5} />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-soft text-sm font-semibold mb-1">
              Install Rumi
            </h3>
            <p className="text-ghost text-xs leading-relaxed mb-3">
              Install the app for a better experience with offline support
            </p>

            <div className="flex gap-2">
              <button
                onClick={handleInstall}
                className="flex-1 bg-sand text-base px-4 py-2 rounded text-sm font-semibold hover:bg-sand/90 transition-colors touch-manipulation min-h-[44px]"
              >
                Install
              </button>
              <button
                onClick={dismissPrompt}
                className="px-4 py-2 rounded text-sm text-ghost hover:text-soft hover:bg-elevated transition-colors touch-manipulation min-h-[44px]"
              >
                Not now
              </button>
            </div>
          </div>

          <button
            onClick={dismissPrompt}
            className="flex-shrink-0 text-ghost hover:text-soft transition-colors p-1 -mr-1 -mt-1 touch-manipulation"
            aria-label="Close"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

// Made with Bob
