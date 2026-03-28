import { Menu, X } from "lucide-react";

interface MobileHeaderProps {
  isDrawerOpen: boolean;
  onToggleDrawer: () => void;
}

export default function MobileHeader({ isDrawerOpen, onToggleDrawer }: MobileHeaderProps) {
  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-5 h-14 border-b border-rim bg-surface">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <img src={`${import.meta.env.BASE_URL}icons/ney-simple.svg`} alt="Rumi" className="w-6 h-6 rounded-sm" />
        <span className="text-soft font-semibold tracking-widest text-sm uppercase">
          Rumi
        </span>
      </div>

      {/* Hamburger Menu Button */}
      <button
        onClick={onToggleDrawer}
        className="flex items-center justify-center w-11 h-11 -mr-2 text-ghost hover:text-soft transition-colors touch-manipulation"
        aria-label={isDrawerOpen ? "Close menu" : "Open menu"}
        aria-expanded={isDrawerOpen}
      >
        {isDrawerOpen ? (
          <X size={24} strokeWidth={1.5} />
        ) : (
          <Menu size={24} strokeWidth={1.5} />
        )}
      </button>
    </header>
  );
}

// Made with Bob
