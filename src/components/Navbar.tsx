import React from 'react';
import { Bell, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export type AppRoute =
  | 'landing'
  | 'auth'
  | 'dashboard'
  | 'gis'
  | 'analytics'
  | 'profile';

interface NavbarProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  unreadNotifications: number;
  onToggleNotifications: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRoute,
  onNavigate,
  unreadNotifications,
  onToggleNotifications,
}) => {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const navItems: { route: AppRoute; label: string }[] = [
    { route: 'landing', label: 'Overview' },
    { route: 'gis', label: 'GIS Map' },
    { route: 'analytics', label: 'Analytics' },
  ];

  const handleNav = (route: AppRoute) => {
    onNavigate(route);
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-neutral-200">
      <div className="max-w-[1380px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        <button
          type="button"
          onClick={() => handleNav('landing')}
          className="text-lg font-display font-bold tracking-tight text-[#0B3B2E] whitespace-nowrap shrink-0 cursor-pointer"
        >
          CivicSense AI
        </button>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-neutral-600">
          {navItems.map((item) => (
            <button
              key={item.route}
              type="button"
              onClick={() => handleNav(item.route)}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors border-b-2 cursor-pointer ${
                currentRoute === item.route
                  ? 'text-[#0B3B2E] border-[#059669] font-semibold'
                  : 'border-transparent hover:text-[#0B3B2E]'
              }`}
            >
              {item.label}
            </button>
          ))}
          {user && (
            <button
              type="button"
              onClick={() => handleNav('dashboard')}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors border-b-2 cursor-pointer ${
                currentRoute === 'dashboard'
                  ? 'text-[#0B3B2E] border-[#059669] font-semibold'
                  : 'border-transparent hover:text-[#0B3B2E]'
              }`}
            >
              Portal
            </button>
          )}
        </nav>

        <div className="hidden md:flex items-center gap-3 shrink-0">
          {user ? (
            <>
              <button
                type="button"
                onClick={onToggleNotifications}
                className="relative p-2 text-neutral-600 hover:text-[#0B3B2E] rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
                aria-label="Open notifications"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-orange-600 text-white text-[10px] font-mono tabular-nums font-semibold rounded-md flex items-center justify-center">
                    {unreadNotifications}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleNav('profile')}
                className="px-3 py-1.5 text-sm font-medium text-[#0B3B2E] hover:bg-emerald-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {user.displayName}
              </button>
              <button
                type="button"
                onClick={() => void logout().then(() => handleNav('landing'))}
                className="p-2 text-neutral-500 hover:text-red-700 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => handleNav('auth')}
              className="px-4 py-2 text-sm font-medium bg-[#0B3B2E] text-white rounded-lg hover:bg-[#114B3B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="md:hidden p-2 text-neutral-700 rounded-lg hover:bg-neutral-100"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-neutral-200 px-4 py-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.route}
              type="button"
              onClick={() => handleNav(item.route)}
              className={`block w-full text-left px-3 py-2.5 text-sm font-medium rounded-lg ${
                currentRoute === item.route
                  ? 'bg-emerald-50 text-[#0B3B2E] font-semibold'
                  : 'text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              {item.label}
            </button>
          ))}
          {user ? (
            <>
              <button
                type="button"
                onClick={() => handleNav('dashboard')}
                className="block w-full text-left px-3 py-2.5 text-sm font-medium rounded-lg text-neutral-700 hover:bg-neutral-50"
              >
                Role Portal ({user.role})
              </button>
              <button
                type="button"
                onClick={() => handleNav('profile')}
                className="block w-full text-left px-3 py-2.5 text-sm font-medium rounded-lg text-neutral-700 hover:bg-neutral-50"
              >
                Profile & Notifications ({unreadNotifications})
              </button>
              <button
                type="button"
                onClick={() => void logout().then(() => handleNav('landing'))}
                className="block w-full text-left px-3 py-2.5 text-sm font-medium rounded-lg text-red-700 hover:bg-red-50"
              >
                Sign Out
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => handleNav('auth')}
              className="w-full px-4 py-2.5 text-sm font-medium bg-[#0B3B2E] text-white rounded-lg"
            >
              Sign In
            </button>
          )}
        </div>
      )}
    </header>
  );
};
