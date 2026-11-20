import React, { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  FileUp,
  LogIn,
  MailCheck,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest, getStoredToken } from '../services/apiClient';
import { auth } from '../services/firebaseClient';
import { subscribeDepartments, subscribeWards } from '../services/firestoreService';
import { AuthorityApplication, Department, Ward } from '../shared/types';
import { AuthorityStatusView } from './AuthorityStatusView';

interface AuthorityRegistrationPageProps {
  onOpenAuthorityLogin: () => void;
  onOpenDashboard: () => void;
  onSignedOut: () => void;
}

export const AuthorityRegistrationPage: React.FC<AuthorityRegistrationPageProps> = ({
  onOpenAuthorityLogin,
  onOpenDashboard,
  onSignedOut,
}) => {
  const {
    user,
    authorityApplication,
    firebaseConnected,
    registerAuthorityIdentityWithEmail,
    registerAuthorityIdentityWithGoogle,
    resendVerificationEmail,
    refreshEmailVerification,
    refreshProfile,
  } = useAuth();

  // Step 1 identity credentials (only shown if not yet signed in)
  const [authFullName, setAuthFullName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authContact, setAuthContact] = useState('');
  const [authPassword, setAuthPassword] = useState('');

  // Dynamic Firestore collections (never hardcoded)
  const [departments, setDepartments] = useState<Department[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  // Step 2 application fields
  const [fullName, setFullName] = useState('');
  const [officialEmail, setOfficialEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [designation, setDesignation] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [wardId, setWardId] = useState('');
  const [verificationDocUrl, setVerificationDocUrl] = useState('');
  const [verificationDocName, setVerificationDocName] = useState('');

  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [editingRejected, setEditingRejected] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setDepartments([]);
      setWards([]);
      setCatalogLoaded(false);
      return;
    }

    const unsubDepts = subscribeDepartments((list) => {
      setDepartments(list);
      setCatalogLoaded(true);
      setDepartmentId((prev) => prev || list[0]?.id || '');
    });
    const unsubWards = subscribeWards((list) => {
      setWards(list);
      setCatalogLoaded(true);
      setWardId((prev) => prev || list[0]?.id || '');
    });

    return () => {
      unsubDepts();
      unsubWards();
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user) return;
    if (authorityApplication) {
      setFullName((prev) => prev || authorityApplication.fullName || user.displayName || '');
      setOfficialEmail((prev) => prev || authorityApplication.officialEmail || user.email || '');
      setContactNumber((prev) => prev || authorityApplication.contactNumber || user.phone || '');
      setEmployeeId((prev) => prev || authorityApplication.employeeId || '');
      setDesignation((prev) => prev || authorityApplication.designation || '');
      setMunicipality((prev) => prev || authorityApplication.municipality || '');
      if (authorityApplication.departmentId) setDepartmentId(authorityApplication.departmentId);
      if (authorityApplication.wardId) setWardId(authorityApplication.wardId);
      if (authorityApplication.verificationDocUrl) {
        setVerificationDocUrl(authorityApplication.verificationDocUrl);
        setVerificationDocName(authorityApplication.verificationDocName || 'Verification Document');
      }
    } else {
      setFullName((prev) => prev || user.displayName || '');
      setOfficialEmail((prev) => prev || user.email || '');
      setContactNumber((prev) => prev || user.phone || '');
      if (user.wardId) setWardId((prev) => prev || user.wardId || '');
    }
  }, [user, authorityApplication]);

  const handleIdentityCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await registerAuthorityIdentityWithEmail({
        email: authEmail,
        password: authPassword,
        displayName: authFullName,
        phone: authContact,
      });
      setFullName(authFullName);
      setOfficialEmail(authEmail);
      setContactNumber(authContact);
      setInfo(
        'Firebase account created and email verification sent. Complete your municipal employment details below to submit your verification request.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create Firebase account.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleIdentity = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const profile = await registerAuthorityIdentityWithGoogle();
      setFullName(profile.displayName || '');
      setOfficialEmail(profile.email || '');
      setContactNumber(profile.phone || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('Supporting verification document must be under 2 MB (PDF, JPEG, PNG, or WEBP).');
      return;
    }

    setError(null);
    setUploadingDoc(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read selected file.'));
        reader.readAsDataURL(file);
      });

      const token = (await auth?.currentUser?.getIdToken()) || getStoredToken();
      const uploaded = await apiRequest<{
        verificationDocUrl: string;
        verificationDocName: string;
      }>('/api/authority-applications/documents', {
        method: 'POST',
        tokenOverride: token || undefined,
        body: JSON.stringify({ dataUrl, fileName: file.name }),
      });

      setVerificationDocUrl(uploaded.verificationDocUrl);
      setVerificationDocName(uploaded.verificationDocName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload verification document.');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleApplicationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const token = (await auth?.currentUser?.getIdToken()) || getStoredToken();
      await apiRequest<{ application: AuthorityApplication }>('/api/authority-applications', {
        method: 'POST',
        tokenOverride: token || undefined,
        body: JSON.stringify({
          fullName,
          officialEmail,
          contactNumber,
          employeeId,
          designation,
          municipality,
          departmentId,
          wardId,
          verificationDocUrl: verificationDocUrl || undefined,
          verificationDocName: verificationDocName || undefined,
        }),
      });
      setEditingRejected(false);
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authority application submission failed.');
    } finally {
      setBusy(false);
    }
  };

  // If user is already admin/system or approved authority, redirect cleanly
  if (user && (user.role === 'admin' || user.role === 'system')) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-white border border-neutral-200 rounded-xl p-8 text-center space-y-4">
          <h1 className="text-xl font-display font-bold text-[#0B3B2E]">
            Privileged Governance Account Active
          </h1>
          <p className="text-sm text-neutral-600">
            You are signed in as <span className="font-semibold">{user.role}</span>. Authority access applications are only for municipal officers requesting department portal access.
          </p>
          <button
            type="button"
            onClick={onOpenDashboard}
            className="px-5 py-2.5 text-sm font-medium bg-[#0B3B2E] text-white rounded-lg cursor-pointer"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (
    user &&
    user.role === 'authority' &&
    user.accountStatus === 'approved' &&
    user.active &&
    user.emailVerified !== false
  ) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-white border border-emerald-200 rounded-xl p-8 text-center space-y-4">
          <CheckCircle2 className="w-10 h-10 text-emerald-700 mx-auto" />
          <h1 className="text-xl font-display font-bold text-[#0B3B2E]">
            Municipal Authority Access Approved
          </h1>
          <p className="text-sm text-neutral-600">
            Your official credentials are verified and your account is active.
          </p>
          <button
            type="button"
            onClick={onOpenDashboard}
            className="px-5 py-2.5 text-sm font-medium bg-[#0B3B2E] text-white rounded-lg cursor-pointer"
          >
            Open Authority Console
          </button>
        </div>
      </div>
    );
  }

  // If application exists and is pending, suspended, or rejected (unless user clicked Edit & Resubmit)
  if (
    user &&
    (user.accountStatus === 'suspended' ||
      authorityApplication?.status === 'pending_verification' ||
      authorityApplication?.status === 'suspended' ||
      (authorityApplication?.status === 'rejected' && !editingRejected))
  ) {
    return (
      <AuthorityStatusView
        onReapply={() => setEditingRejected(true)}
        onSignedOut={onSignedOut}
      />
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#F7F9F8] py-10 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 bg-white border border-neutral-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div>
            <div className="text-xs font-medium text-emerald-700">
              Municipal Officer Onboarding · Administrator Verification Required
            </div>
            <h1 className="text-2xl font-display font-bold text-[#0B3B2E] mt-1">
              Request Municipal Authority Access
            </h1>
            <p className="text-sm text-neutral-600 mt-1">
              Submitting this form registers a verification request in Cloud Firestore. Authority permissions remain disabled until your official email is verified and a Municipal Administrator approves your request.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg">
              {error}
            </div>
          )}
          {info && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-lg">
              {info}
            </div>
          )}

          {!user ? (
            <div className="space-y-6">
              <div className="p-4 bg-[#F7F9F8] border border-neutral-200 rounded-xl text-xs text-neutral-700">
                <span className="font-semibold text-[#0B3B2E]">Step 1 of 2:</span> Authenticate your official account via Google Sign-In or Email & Password so Firebase Authentication can verify your identity and email address.
              </div>

              <button
                type="button"
                disabled={!firebaseConnected || busy}
                onClick={() => void handleGoogleIdentity()}
                className="w-full px-4 py-2.5 text-sm font-semibold bg-[#0B3B2E] text-white rounded-lg hover:bg-[#114B3B] transition-colors disabled:opacity-50 cursor-pointer"
              >
                Continue with Official Google Account
              </button>

              <div className="relative flex items-center justify-center">
                <div className="border-t border-neutral-200 w-full" />
                <span className="px-3 text-xs text-neutral-500 bg-white whitespace-nowrap">
                  or register with Official Email & Password
                </span>
                <div className="border-t border-neutral-200 w-full" />
              </div>

              <form onSubmit={handleIdentityCreate} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-800 mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      minLength={2}
                      value={authFullName}
                      onChange={(e) => setAuthFullName(e.target.value)}
                      placeholder="e.g., Arjun Deshmukh"
                      className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-800 mb-1.5">
                      Contact Number
                    </label>
                    <input
                      type="tel"
                      required
                      minLength={6}
                      value={authContact}
                      onChange={(e) => setAuthContact(e.target.value)}
                      placeholder="+91-98..."
                      className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-800 mb-1.5">
                      Official Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="officer@municipality.gov.in"
                      className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-800 mb-1.5">
                      Password (6+ characters)
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full px-4 py-2.5 text-sm font-medium bg-[#059669] text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                >
                  {busy ? 'Creating Firebase Account...' : 'Continue to Authority Verification Form'}
                </button>
              </form>

              <div className="pt-4 border-t border-neutral-200 flex items-center justify-between text-xs text-neutral-600">
                <span>Already have an approved authority account?</span>
                <button
                  type="button"
                  onClick={onOpenAuthorityLogin}
                  className="inline-flex items-center gap-1.5 font-semibold text-[#0B3B2E] hover:underline cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Authority Sign In
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleApplicationSubmit} className="space-y-4">
              {!user.emailVerified && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                  <div className="text-xs text-amber-950">
                    <span className="font-semibold">Verify Your Email:</span> A Firebase verification email was sent to{' '}
                    <span className="font-mono">{user.email}</span>. You can submit your employment details now, and click below once you confirm your inbox link.
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void resendVerificationEmail()}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-white border border-amber-300 rounded-md text-amber-950 cursor-pointer"
                    >
                      <MailCheck className="w-3.5 h-3.5" />
                      Resend Verification Email
                    </button>
                    <button
                      type="button"
                      onClick={() => void refreshEmailVerification()}
                      className="px-3 py-1.5 text-xs font-medium bg-[#0B3B2E] text-white rounded-md cursor-pointer"
                    >
                      Refresh Verification Status
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-800 mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-800 mb-1.5">
                    Official Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={officialEmail}
                    onChange={(e) => setOfficialEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-800 mb-1.5">
                    Contact Number
                  </label>
                  <input
                    type="tel"
                    required
                    minLength={6}
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    placeholder="+91-98..."
                    className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-800 mb-1.5">
                    Employee ID
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    placeholder="e.g., BBMP-ENG-4021"
                    className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-800 mb-1.5">
                    Designation
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="e.g., Assistant Executive Engineer"
                    className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-800 mb-1.5">
                    Municipal Corporation / Municipality
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={municipality}
                    onChange={(e) => setMunicipality(e.target.value)}
                    placeholder="e.g., Bruhat Bengaluru Mahanagara Palike"
                    className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-800 mb-1.5">
                    Department (Firestore Catalog)
                  </label>
                  <select
                    required
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    disabled={!catalogLoaded || departments.length === 0}
                    className="w-full px-3 py-2.5 text-sm border border-neutral-300 rounded-lg bg-white"
                  >
                    {departments.length === 0 ? (
                      <option value="">Loading departments from Firestore...</option>
                    ) : (
                      departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-800 mb-1.5">
                    Assigned Ward (Firestore Catalog)
                  </label>
                  <select
                    required
                    value={wardId}
                    onChange={(e) => setWardId(e.target.value)}
                    disabled={!catalogLoaded || wards.length === 0}
                    className="w-full px-3 py-2.5 text-sm border border-neutral-300 rounded-lg bg-white"
                  >
                    {wards.length === 0 ? (
                      <option value="">Loading wards from Firestore...</option>
                    ) : (
                      wards.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.zone})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div className="p-4 border border-dashed border-neutral-300 rounded-xl bg-[#F7F9F8] space-y-2">
                <label className="block text-sm font-medium text-neutral-800">
                  Supporting Employment Verification Document (Optional, Private Storage)
                </label>
                <p className="text-xs text-neutral-600">
                  Upload official appointment letter or department ID card (PDF, JPEG, PNG, or WEBP up to 2 MB). Stored privately for Administrator review only — never exposed publicly.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-white border border-neutral-300 text-[#0B3B2E] rounded-lg hover:bg-neutral-50 cursor-pointer">
                    <FileUp className="w-4 h-4" />
                    {uploadingDoc ? 'Uploading Securely...' : 'Choose Verification Document'}
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      onChange={(e) => void handleDocUpload(e)}
                      className="hidden"
                    />
                  </label>
                  {verificationDocUrl && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800">
                      <Upload className="w-3.5 h-3.5" />
                      Uploaded privately: {verificationDocName}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={busy || uploadingDoc || !departmentId || !wardId}
                className="w-full px-5 py-3 text-sm font-semibold bg-[#0B3B2E] text-white rounded-lg hover:bg-[#114B3B] disabled:opacity-60 cursor-pointer"
              >
                {busy ? 'Submitting Request...' : 'Submit Authority Verification Request'}
              </button>
            </form>
          )}
        </div>

        <div className="lg:col-span-4 bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#0B3B2E]">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-display font-bold text-[#0B3B2E]">
            Authority Verification Protocol
          </h2>
          <ul className="space-y-3 text-xs text-neutral-600 leading-relaxed">
            <li className="flex items-start gap-2">
              <Building2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <span>
                Submitting a request keeps your account unprivileged (<span className="font-mono">citizen</span>) until an Administrator approves it.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <MailCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <span>
                Firebase email verification is mandatory before approval, and alone never grants authority access.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <span>
                Once approved, officer access is strictly scoped to complaints matching your assigned <span className="font-semibold">Department AND Ward</span>.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
