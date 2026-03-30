import { NavLink } from "react-router-dom";
import { Activity, Tag, LayoutDashboard, Calendar, MapPin, Users, Settings, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { useVersionCheck } from "../hooks/useVersionCheck";

const NAV = [
  { to: "/",          icon: LayoutDashboard, label: "Home"      },
  { to: "/analyze",   icon: Activity,        label: "Analyze"   },
  { to: "/sessions",  icon: Calendar,        label: "Sessions"  },
  { to: "/places",    icon: MapPin,          label: "Places"    },
  { to: "/people",    icon: Users,           label: "People"    },
  { to: "/styles",    icon: Tag,             label: "Styles"    },
  { to: "/settings",  icon: Settings,        label: "Settings"  },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isMobile?: boolean;
}

export default function Sidebar({ isOpen = true, onClose, isMobile = false }: SidebarProps) {
  const { hasUpdate, currentVersion, reload } = useVersionCheck();

  const handleNavClick = () => {
    if (isMobile && onClose) {
      onClose();
    }
  };

  return (
    <aside
      className={clsx(
        "flex flex-col w-52 shrink-0 border-r border-rim bg-surface h-full",
        isMobile && [
          "fixed top-0 left-0 bottom-0 z-50 transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full"
        ],
        !isMobile && "lg:flex"
      )}
      style={isMobile ? {
        paddingTop: 'var(--safe-area-top)',
        paddingBottom: 'var(--safe-area-bottom)'
      } : undefined}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-rim">
        <img src={`${import.meta.env.BASE_URL}icons/ney-simple.svg`} alt="Rumi" className="w-6 h-6 rounded-sm" />
        <span className="text-soft font-semibold tracking-widest text-sm uppercase">
          Rumi
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={handleNavClick}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors touch-manipulation min-h-[44px]",
                isActive
                  ? "text-soft bg-elevated"
                  : "text-ghost hover:text-soft hover:bg-elevated/60"
              )
            }
          >
            <Icon size={15} strokeWidth={1.5} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-rim">
        {hasUpdate ? (
          <button
            onClick={reload}
            className="flex items-center gap-2 w-full px-3 py-2 rounded text-xs bg-sand/10 text-sand hover:bg-sand/20 transition-colors touch-manipulation"
          >
            <RefreshCw size={12} />
            <span>重新加载以使用最新版本</span>
          </button>
        ) : (
          <p className="text-faint text-xs font-mono">v{currentVersion}</p>
        )}
      </div>
    </aside>
  );
}

// Made with Bob
