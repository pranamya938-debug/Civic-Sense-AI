import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppRoute, Navbar } from './components/Navbar';
import { NotificationCenter } from './components/NotificationCenter';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { GisExplorerPage } from './pages/GisExplorerPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ProfilePage } from './pages/ProfilePage';
import { CitizenDashboard } from './dashboards/CitizenDashboard';
import { AuthorityDashboard } from './dashboards/AuthorityDashboard';
import { AdminDashboard } from './dashboards/AdminDashboard';
import { subscribeMyNotifications } from './services/firestoreService';
import { AppNotification, UserRole } from './shared/types';

const CivicSenseShell: React.FC = () => {
  const { user, loading } = useAuth();
  const [route, setRoute] = useState<AppRoute>('landing');
  const [preselectedRole, setPreselectedRole] = useState<UserRole | undefined>(undefined);
  const [authInitialTab, setAuthInitialTab] = useState<'login' | 'register'>('login');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [inspectComplaintId, setInspectComplaintId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setNotifications([]);
      return;
    }
    const unsub = subscribeMyNotifications(user.uid, setNotifications);
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!loading && !user && (route === 'dashboard' || route === 'profile')) {
      setRoute('auth');
    }
  }, [loading, user, route]);

  const handleSelectRole = (role: UserRole, initialMode: 'login' | 'register' = 'login') => {
    setPreselectedRole(role);
    setAuthInitialTab(initialMode);
    if (user && user.role === role) {
      setRoute('dashboard');
    } else if (user && role === 'citizen') {
      setRoute('dashboard');
    } else {
      setRoute('auth');
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const renderDashboardByRole = () => {
    if (!user) {
      return (
        <AuthPage
          preselectedRole={preselectedRole}
          initialTab={authInitialTab}
          onAuthenticated={() => setRoute('dashboard')}
        />
      );
    }
    if (user.role === 'admin') return <AdminDashboard />;
    if (user.role === 'authority') return <AuthorityDashboard />;
    return <CitizenDashboard initialInspectId={inspectComplaintId} />;
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F9F8] overflow-x-hidden">
      <Navbar
        currentRoute={route}
        onNavigate={(r) => {
          setInspectComplaintId(null);
          setRoute(r);
        }}
        unreadNotifications={unreadCount}
        onToggleNotifications={() => setNotificationsOpen(true)}
      />

      <main className="flex-1">
        {loading && (route === 'dashboard' || route === 'profile') ? (
          <div className="p-12 text-center text-sm text-neutral-500">Verifying Firebase session...</div>
        ) : route === 'landing' ? (
          <LandingPage onSelectRole={handleSelectRole} onNavigate={setRoute} />
        ) : route === 'auth' ? (
          <AuthPage
            preselectedRole={preselectedRole}
            initialTab={authInitialTab}
            onAuthenticated={() => setRoute('dashboard')}
          />
        ) : route === 'gis' ? (
          <GisExplorerPage onOpenAuth={() => setRoute('auth')} />
        ) : route === 'analytics' ? (
          <AnalyticsPage onOpenAuth={() => setRoute('auth')} />
        ) : route === 'profile' ? (
          <ProfilePage />
        ) : (
          renderDashboardByRole()
        )}
      </main>

      <footer className="bg-white border-t border-neutral-200 py-6 px-4 sm:px-6">
        <div className="max-w-[1380px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <div>
            <span className="font-semibold text-[#0B3B2E]">CivicSense AI</span> — 100s of Complaints. One Platform.
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <button type="button" onClick={() => setRoute('landing')} className="hover:text-[#0B3B2E] cursor-pointer">
              Overview
            </button>
            <button type="button" onClick={() => setRoute('gis')} className="hover:text-[#0B3B2E] cursor-pointer">
              GIS Map
            </button>
            <button type="button" onClick={() => setRoute('analytics')} className="hover:text-[#0B3B2E] cursor-pointer">
              Analytics
            </button>
            <button
              type="button"
              onClick={() => setRoute(user ? 'dashboard' : 'auth')}
              className="font-medium text-[#0B3B2E] hover:underline cursor-pointer"
            >
              {user ? 'Open Portal' : 'Citizen Sign In'}
            </button>
          </div>
        </div>
      </footer>

      <NotificationCenter
        open={notificationsOpen}
        notifications={notifications}
        onClose={() => setNotificationsOpen(false)}
        onSelectComplaint={(id) => {
          setInspectComplaintId(id);
          setRoute('dashboard');
        }}
      />
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
