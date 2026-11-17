import React, { useEffect, useState } from 'react';
import { Building2, KeyRound, LogIn, ShieldCheck, User, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { subscribeWards } from '../services/firestoreService';
import { MUNICIPAL_WARDS } from '../shared/catalog';
import { UserRole, Ward } from '../shared/types';

interface AuthPageProps {
  preselectedRole?: UserRole;
  initialTab?: 'login' | 'register' | 'reset';
  onAuthenticated: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  preselectedRole,
  initialTab = 'login',
  onAuthenticated,
}) => {
  const {
    user,
    loginWithEmail,
    registerCitizen,
    sendPasswordReset,
    loginWithGoogle,
    firebaseConnected,
  } = useAuth();

  const [tab, setTab] = useState<'login' | 'register' | 'reset'>(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [wardId, setWardId] = useState('ward_14');
  const [phone, setPhone] = useState('');

  const [wards, setWards] = useState<Ward[]>(MUNICIPAL_WARDS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!user?.uid) {
      setWards(MUNICIPAL_WARDS);
      return;
    }
    const unsub = subscribeWards(setWards);
    return () => unsub();
  }, [user?.uid]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await loginWithEmail(email, password);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await registerCitizen({ email, password, displayName, wardId, phone });
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await sendPasswordReset(email);
      setInfo('Password reset link sent via Firebase Authentication. Please check your inbox.');
      setTab('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await loginWithGoogle();
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setBusy(false);
    }
  };

  const roleNotes = [
    {
      role: 'citizen' as UserRole,
      title: 'Citizen Portal',
      detail: 'New registrations start with Citizen permissions to report grievances, upload photos, pin GPS, and track progress.',
      Icon: User,
    },
    {
      role: 'authority' as UserRole,
      title: 'Municipal Authority Console',
      detail: 'Assigned by an Administrator to department officers for triaging complaints, assigning crews, and updating resolutions.',
      Icon: Building2,
    },
    {
      role: 'admin' as UserRole,
      title: 'Administrator Control Center',
      detail: 'Full citywide oversight of users, roles, departments, wards, duplicate reviews, and audit trails.',
      Icon: ShieldCheck,
    },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#F7F9F8] py-10 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 bg-white border border-neutral-200 rounded-xl p-6 sm:p-8">
          <div className="mb-6">
            <div className="text-xs font-medium text-emerald-700">
              Firebase Authentication · Role-Based Access
              {preselectedRole ? ` · Target: ${preselectedRole}` : ''}
            </div>
            <h1 className="text-2xl font-display font-bold text-[#0B3B2E] mt-1">
              {tab === 'register'
                ? 'Create Your Citizen Account'
                : tab === 'reset'
                ? 'Reset Account Password'
                : 'Sign In to CivicSense AI'}
            </h1>
            <p className="text-sm text-neutral-600 mt-1">
              Credentials are managed securely by Firebase Authentication; no plaintext passwords or hashes are stored in application records.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg mb-6">
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setError(null);
              }}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                tab === 'login' ? 'bg-white text-[#0B3B2E] shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register');
                setError(null);
              }}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                tab === 'register' ? 'bg-white text-[#0B3B2E] shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Citizen Registration
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('reset');
                setError(null);
              }}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                tab === 'reset' ? 'bg-white text-[#0B3B2E] shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Reset Password
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg">
              {error}
            </div>
          )}
          {info && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-lg">
              {info}
            </div>
          )}

          {/* Google Sign-In Primary Option */}
          <button
            type="button"
            disabled={!firebaseConnected || busy}
            onClick={() => void handleGoogleLogin()}
            className="w-full mb-5 px-4 py-2.5 text-sm font-semibold bg-[#0B3B2E] text-white rounded-lg hover:bg-[#114B3B] transition-colors disabled:opacity-50 cursor-pointer"
          >
            Continue with Google
          </button>

          <div className="relative flex items-center justify-center mb-5">
            <div className="border-t border-neutral-200 w-full" />
            <span className="px-3 text-xs text-neutral-500 bg-white whitespace-nowrap">
              or use Email & Password
            </span>
            <div className="border-t border-neutral-200 w-full" />
          </div>

          {tab === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-800 mb-1.5">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-800 mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium border border-[#0B3B2E] text-[#0B3B2E] rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-60 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                {busy ? 'Signing in...' : 'Sign In with Email'}
              </button>
            </form>
          )}

          {tab === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-800 mb-1.5">Full Name</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g., Priya Nair"
                  className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-800 mb-1.5">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="priya@example.in"
                  className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-800 mb-1.5">Password (6+ chars)</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-800 mb-1.5">Home Ward</label>
                  <select
                    value={wardId}
                    onChange={(e) => setWardId(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-neutral-300 rounded-lg bg-white"
                  >
                    {wards.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-800 mb-1.5">Phone (Optional)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91-98..."
                  className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-[#059669] text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-60 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                {busy ? 'Creating Account...' : 'Create Citizen Account'}
              </button>
            </form>
          )}

          {tab === 'reset' && (
            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-800 mb-1.5">Account Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium border border-[#0B3B2E] text-[#0B3B2E] rounded-lg hover:bg-emerald-50 cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                Send Firebase Password Reset Email
              </button>
            </form>
          )}
        </div>

        <div className="lg:col-span-5 bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
          <div>
            <div className="text-xs font-semibold text-emerald-700">Role Permissions Overview</div>
            <h2 className="text-lg font-display font-bold text-[#0B3B2E] mt-1">
              Authorized Civic Workspaces
            </h2>
            <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
              Every signed-in user receives a verified Cloud Firestore profile enforcing strict role permissions across portals.
            </p>
          </div>

          <div className="space-y-3">
            {roleNotes.map(({ role, title, detail, Icon }) => (
              <div
                key={role}
                className={`p-4 rounded-xl border ${
                  preselectedRole === role
                    ? 'border-[#059669] bg-emerald-50/40'
                    : 'border-neutral-200 bg-[#F7F9F8]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white border border-emerald-200 flex items-center justify-center text-[#0B3B2E] shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#0B3B2E]">{title}</div>
                    <p className="text-xs text-neutral-600 mt-1 leading-relaxed">{detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
