import React, { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  LogOut,
  MailCheck,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthorityStatusViewProps {
  onReapply?: () => void;
  onSignedOut?: () => void;
}

export const AuthorityStatusView: React.FC<AuthorityStatusViewProps> = ({
  onReapply,
  onSignedOut,
}) => {
  const {
    user,
    authorityApplication,
    resendVerificationEmail,
    refreshEmailVerification,
    logout,
  } = useAuth();

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const effectiveStatus =
    user.accountStatus === 'suspended' || authorityApplication?.status === 'suspended'
      ? 'suspended'
      : authorityApplication?.status ||
        (user.accountStatus === 'pending_verification'
          ? 'pending_verification'
          : user.accountStatus === 'rejected'
          ? 'rejected'
          : user.role === 'authority' && user.emailVerified === false
          ? 'email_unverified'
          : 'pending_verification');

  const emailVerified = Boolean(user.emailVerified && authorityApplication?.emailVerified !== false);

  const handleResend = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await resendVerificationEmail();
      setNotice(
        `Verification email sent to ${user.email || 'your official email address'}. Open the link in your inbox, then click "I Verified My Email".`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send verification email.');
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshVerification = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const verified = await refreshEmailVerification();
      if (verified) {
        setNotice(
          'Official email address verified in Firebase Authentication and synced to your application.'
        );
      } else {
        setNotice(
          'Email is not verified yet in Firebase Authentication. Please open the verification link sent to your inbox and try again.'
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh verification status.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    onSignedOut?.();
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <div className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-8 space-y-6">
        {effectiveStatus === 'suspended' && (
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-700 shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-red-700">
                Account Suspended
              </div>
              <h1 className="text-2xl font-display font-bold text-[#0B3B2E] mt-1">
                Municipal Authority Access Suspended
              </h1>
              <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
                Your Municipal Authority account has been suspended by a platform administrator. Access to department complaint queues, GIS maps, analytics, and status updates is disabled.
              </p>
              {authorityApplication?.rejectionReason && (
                <div className="mt-4 p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900">
                  <span className="font-semibold">Administrator Notice:</span>{' '}
                  {authorityApplication.rejectionReason}
                </div>
              )}
            </div>
          </div>
        )}

        {effectiveStatus === 'rejected' && (
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-700 shrink-0">
              <XCircle className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-red-700">
                Verification Rejected
              </div>
              <h1 className="text-2xl font-display font-bold text-[#0B3B2E] mt-1">
                Authority Access Request Not Approved
              </h1>
              <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
                A Municipal Administrator reviewed your authority access request and did not approve it. Review the reason below and submit updated details if needed.
              </p>
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-900">
                <div className="text-xs font-semibold uppercase tracking-wide text-red-700 mb-1">
                  Rejection Reason
                </div>
                <div>
                  {authorityApplication?.rejectionReason ||
                    'Employment or departmental verification details could not be confirmed.'}
                </div>
              </div>
            </div>
          </div>
        )}

        {(effectiveStatus === 'pending_verification' || effectiveStatus === 'email_unverified') && (
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                Pending Administrator Verification
              </div>
              <h1 className="text-2xl font-display font-bold text-[#0B3B2E] mt-1">
                {effectiveStatus === 'email_unverified'
                  ? 'Verify Your Official Email Address'
                  : 'Your authority access request is awaiting administrator verification.'}
              </h1>
              <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
                {effectiveStatus === 'email_unverified'
                  ? 'Your account is assigned to the Municipal Authority role, but Firebase email verification must be completed before accessing municipal complaint queues.'
                  : 'For municipal governance security, authority privileges are activated only after an Administrator verifies your employment credentials and official email address.'}
              </p>
            </div>
          </div>
        )}

        {!user.emailVerified && effectiveStatus !== 'suspended' && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-950 leading-relaxed">
                <span className="font-semibold">Email Verification Required:</span> Your official email (
                <span className="font-mono">{user.email}</span>) is not yet verified in Firebase Authentication. Verify your email before an Administrator can approve and activate your authority account.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleResend()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#0B3B2E] text-white rounded-lg hover:bg-[#114B3B] disabled:opacity-60 cursor-pointer"
              >
                <MailCheck className="w-3.5 h-3.5" />
                Resend Verification Email
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleRefreshVerification()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white border border-amber-300 text-amber-950 rounded-lg hover:bg-amber-100/60 disabled:opacity-60 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                I Verified My Email — Refresh
              </button>
            </div>
          </div>
        )}

        {user.emailVerified && effectiveStatus === 'pending_verification' && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2.5 text-xs text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              Official email verified (<span className="font-mono">{user.email}</span>). Your request is in the administrator review queue.
            </span>
          </div>
        )}

        {notice && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-lg">
            {notice}
          </div>
        )}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg">
            {error}
          </div>
        )}

        {authorityApplication && (
          <div className="border border-neutral-200 rounded-xl p-5 bg-[#F7F9F8] space-y-3">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#0B3B2E]">
                <Building2 className="w-4 h-4 text-emerald-700" />
                Submitted Application Summary
              </div>
              <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-white border border-neutral-200 text-neutral-700">
                {authorityApplication.status.replace('_', ' ')}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-neutral-500">Officer Name</div>
                <div className="font-semibold text-[#0B3B2E]">{authorityApplication.fullName}</div>
              </div>
              <div>
                <div className="text-neutral-500">Official Email</div>
                <div className="font-mono text-[#0B3B2E]">{authorityApplication.officialEmail}</div>
              </div>
              <div>
                <div className="text-neutral-500">Employee ID & Designation</div>
                <div className="font-medium text-neutral-800">
                  {authorityApplication.employeeId} · {authorityApplication.designation}
                </div>
              </div>
              <div>
                <div className="text-neutral-500">Municipal Corporation</div>
                <div className="font-medium text-neutral-800">{authorityApplication.municipality}</div>
              </div>
              <div>
                <div className="text-neutral-500">Requested Department</div>
                <div className="font-semibold text-[#0B3B2E]">{authorityApplication.departmentName}</div>
              </div>
              <div>
                <div className="text-neutral-500">Requested Ward</div>
                <div className="font-semibold text-[#0B3B2E]">{authorityApplication.wardName}</div>
              </div>
              <div>
                <div className="text-neutral-500">Submitted At</div>
                <div className="font-mono text-neutral-700">
                  {new Date(authorityApplication.submittedAt).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-neutral-500">Email Verification</div>
                <div className="font-medium text-neutral-800">
                  {emailVerified ? 'Verified' : 'Pending Verification'}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-3">
          {effectiveStatus === 'rejected' && onReapply ? (
            <button
              type="button"
              onClick={onReapply}
              className="px-4 py-2.5 text-sm font-medium bg-[#0B3B2E] text-white rounded-lg hover:bg-[#114B3B] cursor-pointer"
            >
              Edit & Resubmit Application
            </button>
          ) : (
            <div className="text-xs text-neutral-500">
              Account UID: <span className="font-mono">{user.uid}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};
