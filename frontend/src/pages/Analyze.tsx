import { useState } from "react";
import { Radio, Video } from "lucide-react";
import clsx from "clsx";
import LiveAnalyzer from "./LiveAnalyzer";
import VideoAnalyzer from "./VideoAnalyzer";

type Tab = "live" | "video";

export default function Analyze() {
  const [tab, setTab] = useState<Tab>("live");

  return (
    <div className="flex flex-col h-full">
      {/* Tab toggle */}
      <div className="flex border-b border-rim px-5">
        {(["live", "video"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "flex items-center gap-2 px-4 py-3 text-sm border-b-2 -mb-px transition-colors",
              tab === t
                ? "border-sand text-soft"
                : "border-transparent text-ghost hover:text-soft"
            )}
          >
            {t === "live"
              ? <Radio size={14} strokeWidth={1.5} />
              : <Video size={14} strokeWidth={1.5} />}
            {t === "live" ? "Live" : "Video"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "live" ? <LiveAnalyzer /> : <VideoAnalyzer />}
      </div>
    </div>
  );
}

// Made with Bob
