import React, { useEffect, useState } from 'react';
import { Building2, KeyRound, LogIn, ShieldCheck, User, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { subscribeWards } from '../services/firestoreService';
import { MUNICIPAL_WARDS } from '../shared/catalog';
import { UserProfile, Ward } from '../shared/types';

interface AuthPageProps {
  initialTab?: 'login' | 'register' | 'reset' | 'authority_login';
  onAuthenticated: (profile: UserProfile) => void;
  onOpenAuthorityRegister?: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  initialTab = 'login',
  onAuthenticated,
  onOpenAuthorityRegister,
}) => {
  const {
    user,
    authError,
    clearAuthError,
    loginWithEmail,
    registerCitizen,
    sendPasswordReset,
    loginWithGoogle,
    firebaseConnected,
  } = useAuth();

  const [tab, setTab] = useState<'login' | 'register' | 'reset' | 'authority_login'>(initialTab);
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

  const displayedError = error || authError;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    clearAuthError();
    setInfo(null);
    setBusy(true);
    try {
      const profile = await loginWithEmail(email, password);
      onAuthenticated(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    clearAuthError();
    setInfo(null);
    setBusy(true);
    try {
      const profile = await registerCitizen({ email, password, displayName, wardId, phone });
      onAuthenticated(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    clearAuthError();
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
    clearAuthError();
    setInfo(null);
    setBusy(true);
    try {
      const profile = await loginWithGoogle();
      onAuthenticated(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setBusy(false);
    }
  };

  const roleNotes = [
    {
      id: 'citizen',
      title: 'Citizen Portal',
      detail:
        'Every public registration is assigned the Citizen role automatically to submit grievances, upload photos, pin GPS, and track updates.',
      Icon: User,
    },
    {
      id: 'authority',
      title: 'Municipal Authority Console',
      detail:
        'Verified municipal officers approved by an Administrator are automatically routed to complaints scoped strictly to their department and ward.',
      Icon: Building2,
    },
    {
      id: 'admin',
      title: 'Administrator Control Center',
      detail:
        'Verified governance accounts are automatically routed to citywide authority verification, user management, and audit oversight.',
      Icon: ShieldCheck,
    },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#F7F9F8] py-10 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 bg-white border border-neutral-200 rounded-xl p-6 sm:p-8">
          <div className="mb-6">
            <div className="text-xs font-medium text-emerald-700">
              Firebase Authentication · Automatic Role Routing
            </div>
            <h1 className="text-2xl font-display font-bold text-[#0B3B2E] mt-1">
              {tab === 'register'
                ? 'Create Your Citizen Account'
                : tab === 'authority_login'
                ? 'Municipal Authority Sign In'
                : tab === 'reset'
                ? 'Reset Account Password'
                : 'Sign In to CivicSense AI'}
            </h1>
            <p className="text-sm text-neutral-600 mt-1">
              {tab === 'authority_login'
                ? 'Sign in with your verified municipal account. Only administrator-approved authorities with verified emails gain officer console access.'
                : 'Credentials are managed securely by Firebase Authentication, and your dashboard is determined strictly by your verified Cloud Firestore role.'}
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg mb-6 overflow-x-auto">
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setError(null);
                clearAuthError();
              }}
              className={`flex-1 py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                tab === 'login' ? 'bg-white text-[#0B3B2E] shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('authority_login');
                setError(null);
                clearAuthError();
              }}
              className={`flex-1 py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                tab === 'authority_login'
                  ? 'bg-white text-[#0B3B2E] shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Authority Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register');
                setError(null);
                clearAuthError();
              }}
              className={`flex-1 py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
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
                clearAuthError();
              }}
              className={`flex-1 py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                tab === 'reset' ? 'bg-white text-[#0B3B2E] shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Reset Password
            </button>
          </div>

          {displayedError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg">
              {displayedError}
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

          {(tab === 'login' || tab === 'authority_login') && (
            <div className="space-y-4">
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-800 mb-1.5">
                    {tab === 'authority_login' ? 'Official Email Address' : 'Email Address'}
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={tab === 'authority_login' ? 'officer@municipality.gov.in' : 'name@example.com'}
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
                  {busy
                    ? 'Signing in...'
                    : tab === 'authority_login'
                    ? 'Sign In to Authority Portal'
                    : 'Sign In with Email'}
                </button>
              </form>

              {onOpenAuthorityRegister && (
                <div className="pt-4 border-t border-neutral-200 flex items-center justify-between gap-3 text-xs text-neutral-600">
                  <span>Municipal officer needing portal verification?</span>
                  <button
                    type="button"
                    onClick={onOpenAuthorityRegister}
                    className="font-semibold text-[#0B3B2E] hover:underline cursor-pointer shrink-0"
                  >
                    Request Authority Access →
                  </button>
                </div>
              )}
            </div>
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
            <div className="text-xs font-semibold text-emerald-700">Automatic Role Assignment</div>
            <h2 className="text-lg font-display font-bold text-[#0B3B2E] mt-1">
              Verified Access Controls
            </h2>
            <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
              Workspace selection is disabled. Upon sign-in, CivicSense AI reads your verified Cloud Firestore role and routes you directly to your assigned dashboard.
            </p>
          </div>

          <div className="space-y-3">
            {roleNotes.map(({ id, title, detail, Icon }) => (
              <div
                key={id}
                className="p-4 rounded-xl border border-neutral-200 bg-[#F7F9F8]"
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
