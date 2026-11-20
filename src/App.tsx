import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppRoute, Navbar, getDashboardRouteForRole } from './components/Navbar';
import { NotificationCenter } from './components/NotificationCenter';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { GisExplorerPage } from './pages/GisExplorerPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ProfilePage } from './pages/ProfilePage';
import { CitizenDashboard } from './dashboards/CitizenDashboard';
import { AuthorityDashboard } from './dashboards/AuthorityDashboard';
import { AdminDashboard } from './dashboards/AdminDashboard';
import { SystemDashboard } from './dashboards/SystemDashboard';
import { DeveloperConsolePage } from './pages/DeveloperConsolePage';
import { AuthorityRegistrationPage } from './pages/AuthorityRegistrationPage';
import { subscribeMyNotifications } from './services/firestoreService';
import { AppNotification, AuthorityApplication, UserProfile } from './shared/types';

const ROUTE_PATHS: Record<AppRoute, string> = {
  landing: '/',
  auth: '/auth',
  authority_register: '/authority/register',
  citizen: '/citizen',
  authority: '/authority',
  admin: '/admin',
  system: '/system',
  developer: '/developer',
  gis: '/gis',
  analytics: '/analytics',
  profile: '/profile',
};

const PROTECTED_ROUTES = new Set<AppRoute>([
  'citizen',
  'authority',
  'admin',
  'system',
  'developer',
  'gis',
  'analytics',
  'profile',
]);

interface ParsedLocation {
  route: AppRoute;
  isGenericDashboard: boolean;
  authMode: 'login' | 'register' | 'authority_login';
}

function parsePathname(pathname: string): ParsedLocation {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/') return { route: 'landing', isGenericDashboard: false, authMode: 'login' };
  if (clean === '/auth' || clean === '/login') {
    return { route: 'auth', isGenericDashboard: false, authMode: 'login' };
  }
  if (clean === '/authority/login') {
    return { route: 'auth', isGenericDashboard: false, authMode: 'authority_login' };
  }
  if (clean === '/authority/register' || clean === '/request-authority') {
    return { route: 'authority_register', isGenericDashboard: false, authMode: 'login' };
  }
  if (clean === '/register') {
    return { route: 'auth', isGenericDashboard: false, authMode: 'register' };
  }
  if (clean === '/dashboard') {
    return { route: 'citizen', isGenericDashboard: true, authMode: 'login' };
  }
  if (clean === '/citizen' || clean === '/citizen/dashboard') {
    return { route: 'citizen', isGenericDashboard: false, authMode: 'login' };
  }
  if (clean === '/authority' || clean === '/authority/dashboard') {
    return { route: 'authority', isGenericDashboard: false, authMode: 'login' };
  }
  if (clean === '/admin' || clean === '/admin/dashboard') {
    return { route: 'admin', isGenericDashboard: false, authMode: 'login' };
  }
  if (clean === '/system' || clean === '/system/console') {
    return { route: 'system', isGenericDashboard: false, authMode: 'login' };
  }
  if (clean === '/developer' || clean === '/developer/console') {
    return { route: 'developer', isGenericDashboard: false, authMode: 'login' };
  }
  if (clean === '/gis') {
    return { route: 'gis', isGenericDashboard: false, authMode: 'login' };
  }
  if (clean === '/analytics') {
    return { route: 'analytics', isGenericDashboard: false, authMode: 'login' };
  }
  if (clean === '/profile') {
    return { route: 'profile', isGenericDashboard: false, authMode: 'login' };
  }
  return { route: 'landing', isGenericDashboard: false, authMode: 'login' };
}

function isApprovedAuthorityUser(user: UserProfile | null): boolean {
  return Boolean(
    user &&
      user.role === 'authority' &&
      user.accountStatus === 'approved' &&
      user.active &&
      user.emailVerified !== false
  );
}

function isAuthorityVerificationRestricted(
  user: UserProfile | null,
  authorityApplication: AuthorityApplication | null
): boolean {
  if (!user || user.role === 'admin' || user.role === 'system') return false;
  if (
    user.accountStatus === 'pending_verification' ||
    user.accountStatus === 'suspended' ||
    user.accountStatus === 'rejected'
  ) {
    return true;
  }
  if (user.role === 'authority' && !isApprovedAuthorityUser(user)) {
    return true;
  }
  if (authorityApplication && authorityApplication.status !== 'approved') {
    return true;
  }
  return false;
}

function resolveUserHomeRoute(
  user: UserProfile,
  authorityApplication: AuthorityApplication | null
): AppRoute {
  if (isAuthorityVerificationRestricted(user, authorityApplication)) {
    return 'authority_register';
  }
  return getDashboardRouteForRole(user.role, {
    accountStatus: user.accountStatus,
    active: user.active,
    emailVerified: user.emailVerified,
  });
}

function isRoleAuthorizedForRoute(
  user: UserProfile,
  route: AppRoute,
  hasDeveloperAccess: boolean,
  authorityApplication: AuthorityApplication | null
): boolean {
  if (route === 'landing' || route === 'authority_register') return true;
  const restricted = isAuthorityVerificationRestricted(user, authorityApplication);
  if (restricted) {
    return route === 'profile' && user.accountStatus !== 'suspended';
  }
  const role = user.role;
  if (route === 'profile') return role !== 'system';
  if (route === 'citizen') return role === 'citizen';
  if (route === 'authority') return isApprovedAuthorityUser(user);
  if (route === 'admin') return role === 'admin';
  if (route === 'system') return role === 'system';
  if (route === 'developer') return hasDeveloperAccess;
  if (route === 'gis' || route === 'analytics') {
    return isApprovedAuthorityUser(user) || role === 'admin';
  }
  return false;
}

const CivicSenseShell: React.FC = () => {
  const { user, authorityApplication, loading, hasDeveloperAccess } = useAuth();
  const initialLocation =
    typeof window !== 'undefined'
      ? parsePathname(window.location.pathname)
      : { route: 'landing' as AppRoute, isGenericDashboard: false, authMode: 'login' as const };

  const [route, setRoute] = useState<AppRoute>(initialLocation.route);
  const [isGenericDashboard, setIsGenericDashboard] = useState<boolean>(
    initialLocation.isGenericDashboard
  );
  const [authInitialTab, setAuthInitialTab] = useState<'login' | 'register' | 'authority_login'>(
    initialLocation.authMode
  );
  const [accessNotice, setAccessNotice] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [inspectComplaintId, setInspectComplaintId] = useState<string | null>(null);

  const navigate = useCallback(
    (nextRoute: AppRoute, options?: { replace?: boolean; clearNotice?: boolean }) => {
      const targetPath = ROUTE_PATHS[nextRoute] || '/';
      if (typeof window !== 'undefined' && window.location.pathname !== targetPath) {
        if (options?.replace) {
          window.history.replaceState({}, '', targetPath);
        } else {
          window.history.pushState({}, '', targetPath);
        }
      }
      setIsGenericDashboard(false);
      setRoute(nextRoute);
      if (options?.clearNotice !== false) {
        setAccessNotice(null);
      }
    },
    []
  );

  useEffect(() => {
    const onPopState = () => {
      const parsed = parsePathname(window.location.pathname);
      setRoute(parsed.route);
      setIsGenericDashboard(parsed.isGenericDashboard);
      setAuthInitialTab(parsed.authMode);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!user?.uid || user.role === 'system') {
      setNotifications([]);
      return;
    }
    const unsub = subscribeMyNotifications(user.uid, setNotifications);
    return () => unsub();
  }, [user?.uid, user?.role]);

  // Strict Direct-URL RBAC Guard & Automatic Post-Auth Role Redirect
  useEffect(() => {
    if (loading) return;

    if (!user) {
      if (isGenericDashboard || PROTECTED_ROUTES.has(route)) {
        setAccessNotice('Authentication is required to access that portal.');
        navigate('auth', { replace: true, clearNotice: false });
      }
      return;
    }

    const assignedDashboard = resolveUserHomeRoute(user, authorityApplication);

    if (route === 'auth' || isGenericDashboard) {
      navigate(assignedDashboard, { replace: true, clearNotice: false });
      return;
    }

    if (!isRoleAuthorizedForRoute(user, route, hasDeveloperAccess, authorityApplication)) {
      const attemptedPath = ROUTE_PATHS[route] || `/${route}`;
      setAccessNotice(
        `Access denied for ${attemptedPath}. Your account (${user.role}) was redirected to your authorized view.`
      );
      navigate(assignedDashboard, { replace: true, clearNotice: false });
    }
  }, [loading, user, authorityApplication, hasDeveloperAccess, route, isGenericDashboard, navigate]);

  const handleAuthenticated = (profile: UserProfile) => {
    setAccessNotice(null);
    navigate(resolveUserHomeRoute(profile, authorityApplication), { replace: true });
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const renderMainContent = () => {
    if (loading && (PROTECTED_ROUTES.has(route) || isGenericDashboard || route === 'auth')) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center space-y-3">
          <div className="w-8 h-8 border-2 border-[#0B3B2E] border-t-transparent rounded-full animate-spin" />
          <div className="text-sm font-medium text-[#0B3B2E]">
            Verifying Firebase Authentication and Firestore role...
          </div>
        </div>
      );
    }

    if (route === 'landing') {
      return (
        <LandingPage
          onOpenAuth={(mode = 'login') => {
            setAuthInitialTab(mode);
            navigate('auth');
          }}
          onOpenAuthorityRegister={() => navigate('authority_register')}
          onOpenDashboard={() => {
            if (user) {
              navigate(resolveUserHomeRoute(user, authorityApplication));
            } else {
              navigate('auth');
            }
          }}
          onNavigate={(r) => navigate(r)}
        />
      );
    }

    if (route === 'authority_register') {
      return (
        <AuthorityRegistrationPage
          onOpenAuthorityLogin={() => {
            setAuthInitialTab('authority_login');
            navigate('auth');
          }}
          onOpenDashboard={() => {
            if (user) {
              navigate(resolveUserHomeRoute(user, authorityApplication));
            } else {
              navigate('landing');
            }
          }}
          onSignedOut={() => navigate('landing')}
        />
      );
    }

    if (route === 'auth') {
      if (user) {
        return null;
      }
      return (
        <AuthPage
          initialTab={authInitialTab}
          onAuthenticated={handleAuthenticated}
          onOpenAuthorityRegister={() => navigate('authority_register')}
        />
      );
    }

    if (!user) {
      return (
        <AuthPage
          initialTab={authInitialTab}
          onAuthenticated={handleAuthenticated}
          onOpenAuthorityRegister={() => navigate('authority_register')}
        />
      );
    }

    if (
      route === 'citizen' &&
      user.role === 'citizen' &&
      !isAuthorityVerificationRestricted(user, authorityApplication)
    ) {
      return <CitizenDashboard initialInspectId={inspectComplaintId} />;
    }
    if (route === 'authority' && isApprovedAuthorityUser(user)) {
      return <AuthorityDashboard />;
    }
    if (route === 'admin' && user.role === 'admin') {
      return <AdminDashboard />;
    }
    if (route === 'system' && user.role === 'system') {
      return <SystemDashboard />;
    }
    if (route === 'developer' && hasDeveloperAccess) {
      return <DeveloperConsolePage />;
    }
    if (route === 'gis' && (isApprovedAuthorityUser(user) || user.role === 'admin')) {
      return <GisExplorerPage onOpenAuth={() => navigate('auth')} />;
    }
    if (route === 'analytics' && (isApprovedAuthorityUser(user) || user.role === 'admin')) {
      return <AnalyticsPage onOpenAuth={() => navigate('auth')} />;
    }
    if (route === 'profile' && user.role !== 'system' && user.accountStatus !== 'suspended') {
      return <ProfilePage />;
    }

    return (
      <div className="min-h-[50vh] flex items-center justify-center text-sm text-neutral-500">
        Redirecting to your authorized dashboard...
      </div>
    );
  };

  const canUseStaffViews = Boolean(user && (isApprovedAuthorityUser(user) || user.role === 'admin'));

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F9F8] overflow-x-hidden">
      <Navbar
        currentRoute={route}
        onNavigate={(r) => {
          setInspectComplaintId(null);
          navigate(r);
        }}
        unreadNotifications={unreadCount}
        onToggleNotifications={() => setNotificationsOpen(true)}
      />

      {accessNotice && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5">
          <div className="max-w-[1380px] mx-auto flex items-center justify-between gap-4 text-xs text-amber-900">
            <span className="inline-flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              {accessNotice}
            </span>
            <button
              type="button"
              onClick={() => setAccessNotice(null)}
              className="underline font-semibold cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="flex-1">{renderMainContent()}</main>

      <footer className="bg-white border-t border-neutral-200 py-6 px-4 sm:px-6">
        <div className="max-w-[1380px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <div>
            <span className="font-semibold text-[#0B3B2E]">CivicSense AI</span> — 100s of Complaints. One Platform.
          </div>
          <div className="flex flex-wrap items-center gap-5">
            {!user && (
              <>
                <button type="button" onClick={() => navigate('landing')} className="hover:text-[#0B3B2E] cursor-pointer">
                  Overview
                </button>
                <button type="button" onClick={() => navigate('authority_register')} className="hover:text-[#0B3B2E] cursor-pointer">
                  Request Authority Access
                </button>
              </>
            )}
            {canUseStaffViews && (
              <>
                <button type="button" onClick={() => navigate('gis')} className="hover:text-[#0B3B2E] cursor-pointer">
                  GIS Map
                </button>
                <button type="button" onClick={() => navigate('analytics')} className="hover:text-[#0B3B2E] cursor-pointer">
                  Analytics
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() =>
                user ? navigate(resolveUserHomeRoute(user, authorityApplication)) : navigate('auth')
              }
              className="font-medium text-[#0B3B2E] hover:underline cursor-pointer"
            >
              {user ? 'My Assigned Dashboard' : 'Citizen Sign In'}
            </button>
          </div>
        </div>
      </footer>

      {user && user.role !== 'system' && user.accountStatus !== 'suspended' && (
        <NotificationCenter
          open={notificationsOpen}
          notifications={notifications}
          onClose={() => setNotificationsOpen(false)}
          onSelectComplaint={(id) => {
            setInspectComplaintId(id);
            navigate(resolveUserHomeRoute(user, authorityApplication));
          }}
        />
      )}
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <CivicSenseShell />
      </AuthProvider>
    </ErrorBoundary>
  );
}
