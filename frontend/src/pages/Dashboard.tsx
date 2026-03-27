import { Radio, Tag, Calendar, MapPin } from "lucide-react";
import { Link } from "react-router-dom";

const CARDS = [
  {
    to: "/analyze",
    icon: Radio,
    title: "Analyze",
    desc: "Open mic or upload a file to detect BPM and style.",
    accent: "text-live",
  },
  {
    to: "/sessions",
    icon: Calendar,
    title: "Sessions",
    desc: "Browse past nights by date and venue.",
    accent: "text-sand",
  },
  {
    to: "/places",
    icon: MapPin,
    title: "Places",
    desc: "Manage clubs, venues, and personal spaces.",
    accent: "text-ghost",
  },
  {
    to: "/styles",
    icon: Tag,
    title: "Styles",
    desc: "Manage your music style tag database.",
    accent: "text-faint",
  },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return "Good morning.";
  if (h >= 12 && h < 18) return "Good afternoon.";
  if (h >= 18 && h < 23) return "Good evening.";
  return "Still up?";
}

export default function Dashboard() {
  return (
    <div className="max-w-2xl mx-auto px-5 sm:px-8 py-8 sm:py-16">
      {/* Header */}
      <div className="mb-8 sm:mb-14">
        <h1 className="text-xl sm:text-2xl font-semibold text-soft tracking-tight mb-2">
          {greeting()}
        </h1>
        <p className="text-ghost text-sm leading-relaxed">
          Start a live recording or review a past session.
        </p>
      </div>

      {/* Quick links */}
      <div className="space-y-2 sm:space-y-2">
        {CARDS.map(({ to, icon: Icon, title, desc, accent }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-start gap-4 p-4 sm:p-5 rounded-lg border border-rim bg-surface
                       hover:bg-elevated hover:border-muted transition-colors touch-manipulation min-h-[60px]"
          >
            <Icon size={18} strokeWidth={1.5} className={`${accent} mt-0.5 shrink-0`} />
            <div>
              <p className="text-soft text-sm font-medium mb-0.5">{title}</p>
              <p className="text-ghost text-xs leading-relaxed">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// Made with Bob
