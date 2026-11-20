import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  FileText,
  RefreshCw,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest, getStoredToken } from '../services/apiClient';
import { auth } from '../services/firebaseClient';
import {
  createDepartmentInFirestore,
  createWardInFirestore,
  reviewDuplicateMatchInFirestore,
  subscribeAllComplaints,
  subscribeAuditLogs,
  subscribeAuthorityApplications,
  subscribeDepartments,
  subscribeDuplicateMatches,
  subscribeUsers,
  subscribeWards,
  syncReferenceCatalogToFirestore,
} from '../services/firestoreService';
import {
  MUNICIPAL_CATEGORIES,
  MUNICIPAL_DEPARTMENTS,
  MUNICIPAL_WARDS,
  computeAnalyticsOverview,
} from '../shared/catalog';
import {
  AuditLogEntry,
  AuthorityApplication,
  AuthorityApplicationStatus,
  ComplaintRecord,
  Department,
  DuplicateMatchRecord,
  UserProfile,
  UserRole,
  Ward,
} from '../shared/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ComplaintDetailsModal } from '../components/ComplaintDetailsModal';
import { PriorityBadge, StatusBadge } from '../components/StatusBadge';
import { AnalyticsCharts } from '../components/AnalyticsCharts';

type AdminTab =
  | 'overview'
  | 'complaints'
  | 'authority_requests'
  | 'users'
  | 'structure'
  | 'analytics'
  | 'ai_duplicates'
  | 'audit';

export const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [authorityApplications, setAuthorityApplications] = useState<AuthorityApplication[]>([]);
  const [appFilter, setAppFilter] = useState<'all' | AuthorityApplicationStatus>('pending_verification');
  const [appEdits, setAppEdits] = useState<Record<string, { departmentId: string; wardId: string }>>({});
  const [rejectTargetUid, setRejectTargetUid] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [appBusyUid, setAppBusyUid] = useState<string | null>(null);
  const [appError, setAppError] = useState<string | null>(null);
  const [appNotice, setAppNotice] = useState<string | null>(null);
  const [docPreview, setDocPreview] = useState<{
    name: string;
    url: string;
    contentType: string;
  } | null>(null);

  const [departments, setDepartments] = useState<Department[]>(MUNICIPAL_DEPARTMENTS);
  const [wards, setWards] = useState<Ward[]>(MUNICIPAL_WARDS);
  const [duplicates, setDuplicates] = useState<DuplicateMatchRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [aiStatus, setAiStatus] = useState<{
    configuredUrl: string | null;
    pythonServiceReachable: boolean;
    activeMode: string;
    limitationNotice?: string | null;
  } | null>(null);

  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintRecord | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    run: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptCode, setNewDeptCode] = useState('');
  const [newDeptLead, setNewDeptLead] = useState('');

  const [newWardName, setNewWardName] = useState('');
  const [newWardZone, setNewWardZone] = useState('');
  const [newWardLat, setNewWardLat] = useState('12.9716');
  const [newWardLng, setNewWardLng] = useState('77.5946');

  useEffect(() => {
    if (!user?.uid || user.role !== 'admin') {
      return;
    }
    const unsubDepts = subscribeDepartments(setDepartments);
    const unsubWards = subscribeWards(setWards);
    const unsubUsers = subscribeUsers(true, setUsers);
    const unsubApps = subscribeAuthorityApplications(setAuthorityApplications);
    const unsubDups = subscribeDuplicateMatches(setDuplicates);
    const unsubLogs = subscribeAuditLogs(setAuditLogs);

    apiRequest<{
      configuredUrl: string | null;
      pythonServiceReachable: boolean;
      activeMode: string;
      limitationNotice?: string | null;
    }>('/api/ai/status')
      .then(setAiStatus)
      .catch(() => setAiStatus(null));

    return () => {
      unsubDepts();
      unsubWards();
      unsubUsers();
      unsubApps();
      unsubDups();
      unsubLogs();
    };
  }, [user?.uid, user?.role]);

  useEffect(() => {
    if (!user?.uid || user.role !== 'admin') {
      setComplaints([]);
      return;
    }
    const unsub = subscribeAllComplaints(departments, setComplaints);
    return () => unsub();
  }, [user?.uid, user?.role, departments]);

  const executeConfirmed = async () => {
    if (!confirmAction) return;
    setConfirmBusy(true);
    try {
      await confirmAction.run();
    } finally {
      setConfirmBusy(false);
      setConfirmAction(null);
    }
  };

  const getToken = async () => (await auth?.currentUser?.getIdToken()) || getStoredToken() || undefined;

  const refreshApplications = async () => {
    try {
      const token = await getToken();
      const res = await apiRequest<{ applications: AuthorityApplication[] }>(
        '/api/admin/authority-applications',
        { tokenOverride: token }
      );
      if (Array.isArray(res?.applications)) {
        setAuthorityApplications(res.applications);
      }
    } catch (err) {
      setAppError(err instanceof Error ? err.message : 'Unable to refresh authority applications.');
    }
  };

  const handleApproveApplication = async (app: AuthorityApplication) => {
    setAppError(null);
    setAppNotice(null);
    setAppBusyUid(app.uid);
    try {
      const token = await getToken();
      const edits = appEdits[app.uid];
      await apiRequest(`/api/admin/authority-applications/${app.uid}/approve`, {
        method: 'POST',
        tokenOverride: token,
        body: JSON.stringify({
          departmentId: edits?.departmentId || app.departmentId,
          wardId: edits?.wardId || app.wardId,
        }),
      });
      setAppNotice(`Approved ${app.fullName} as Municipal Authority.`);
      await refreshApplications();
    } catch (err) {
      setAppError(err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setAppBusyUid(null);
    }
  };

  const handleRejectApplication = async (app: AuthorityApplication) => {
    setAppError(null);
    setAppNotice(null);
    if (rejectionReason.trim().length < 5) {
      setAppError('Please provide a clear rejection reason (minimum 5 characters).');
      return;
    }
    setAppBusyUid(app.uid);
    try {
      const token = await getToken();
      await apiRequest(`/api/admin/authority-applications/${app.uid}/reject`, {
        method: 'POST',
        tokenOverride: token,
        body: JSON.stringify({ rejectionReason }),
      });
      setRejectTargetUid(null);
      setRejectionReason('');
      setAppNotice(`Rejected authority request for ${app.fullName}.`);
      await refreshApplications();
    } catch (err) {
      setAppError(err instanceof Error ? err.message : 'Rejection failed.');
    } finally {
      setAppBusyUid(null);
    }
  };

  const handleSuspendApplication = (app: AuthorityApplication) => {
    setConfirmAction({
      title: `Suspend Authority Access for ${app.fullName}`,
      description: `Suspending ${app.officialEmail} immediately revokes Municipal Authority console, GIS, and complaint triage permissions.`,
      confirmLabel: 'Suspend Authority',
      run: async () => {
        setAppError(null);
        setAppNotice(null);
        const token = await getToken();
        await apiRequest(`/api/admin/authority-applications/${app.uid}/suspend`, {
          method: 'POST',
          tokenOverride: token,
          body: JSON.stringify({ reason: 'Suspended by Administrator during oversight review.' }),
        });
        setAppNotice(`Suspended authority access for ${app.fullName}.`);
        await refreshApplications();
      },
    });
  };

  const handleUpdateApplicationScope = async (app: AuthorityApplication) => {
    const edits = appEdits[app.uid];
    if (!edits) return;
    setAppError(null);
    setAppNotice(null);
    setAppBusyUid(app.uid);
    try {
      const token = await getToken();
      await apiRequest(`/api/admin/authority-applications/${app.uid}/assignment`, {
        method: 'PATCH',
        tokenOverride: token,
        body: JSON.stringify({
          departmentId: edits.departmentId,
          wardId: edits.wardId,
        }),
      });
      setAppNotice(`Updated department and ward assignment for ${app.fullName}.`);
      await refreshApplications();
    } catch (err) {
      setAppError(err instanceof Error ? err.message : 'Failed to update assignment.');
    } finally {
      setAppBusyUid(null);
    }
  };

  const handlePreviewDoc = async (app: AuthorityApplication) => {
    if (!app.verificationDocUrl) return;
    setAppError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Admin ID token missing.');
      const res = await fetch(app.verificationDocUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error((json as { error?: string } | null)?.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      setDocPreview({
        name: app.verificationDocName || 'Verification Document',
        url: objectUrl,
        contentType: res.headers.get('content-type') || blob.type || 'application/octet-stream',
      });
    } catch (err) {
      setAppError(err instanceof Error ? err.message : 'Unable to load private verification document.');
    }
  };

  const closeDocPreview = () => {
    if (docPreview?.url) {
      window.URL.revokeObjectURL(docPreview.url);
    }
    setDocPreview(null);
  };

  const handleRoleChange = (targetUser: UserProfile, nextRole: UserRole) => {
    if (!user) return;
    setConfirmAction({
      title: `Change Role for ${targetUser.displayName}`,
      description: `Reassign ${targetUser.email || targetUser.uid} from ${targetUser.role} to ${nextRole}. Recorded in Cloud Firestore audit logs.`,
      confirmLabel: 'Confirm Role Change',
      run: async () => {
        const token = await getToken();
        await apiRequest(`/api/admin/users/${targetUser.uid}`, {
          method: 'PATCH',
          tokenOverride: token,
          body: JSON.stringify({ role: nextRole }),
        });
      },
    });
  };

  const handleDepartmentChange = async (targetUser: UserProfile, departmentId: string) => {
    if (!user) return;
    const token = await getToken();
    await apiRequest(`/api/admin/users/${targetUser.uid}`, {
      method: 'PATCH',
      tokenOverride: token,
      body: JSON.stringify({ departmentId }),
    });
  };

  const handleWardChange = async (targetUser: UserProfile, wardId: string) => {
    if (!user) return;
    const token = await getToken();
    await apiRequest(`/api/admin/users/${targetUser.uid}`, {
      method: 'PATCH',
      tokenOverride: token,
      body: JSON.stringify({ wardId }),
    });
  };

  const handleToggleActive = (targetUser: UserProfile) => {
    if (!user) return;
    setConfirmAction({
      title: targetUser.active ? `Deactivate ${targetUser.displayName}` : `Reactivate ${targetUser.displayName}`,
      description: targetUser.active
        ? `Deactivating ${targetUser.email || targetUser.uid} immediately blocks portal access.`
        : `Reactivating ${targetUser.email || targetUser.uid} restores portal access.`,
      confirmLabel: targetUser.active ? 'Deactivate Account' : 'Reactivate Account',
      run: async () => {
        const token = await getToken();
        await apiRequest(`/api/admin/users/${targetUser.uid}`, {
          method: 'PATCH',
          tokenOverride: token,
          body: JSON.stringify({ active: !targetUser.active }),
        });
      },
    });
  };

  const handleSyncReferenceCatalog = async () => {
    if (!user) return;
    await syncReferenceCatalogToFirestore(user);
    setSyncNotice('Standard municipal departments and wards synchronized to Cloud Firestore.');
  };

  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    await createDepartmentInFirestore(
      { name: newDeptName, code: newDeptCode, leadOfficer: newDeptLead },
      user
    );
    setNewDeptName('');
    setNewDeptCode('');
    setNewDeptLead('');
  };

  const handleCreateWard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    await createWardInFirestore(
      {
        name: newWardName,
        zone: newWardZone,
        centerLat: Number(newWardLat),
        centerLng: Number(newWardLng),
      },
      user
    );
    setNewWardName('');
    setNewWardZone('');
  };

  const resolvedCount = complaints.filter((c) => c.status === 'Resolved').length;
  const pendingAuthorityCount = authorityApplications.filter(
    (a) => a.status === 'pending_verification'
  ).length;
  const filteredApplications = authorityApplications.filter((a) =>
    appFilter === 'all' ? true : a.status === appFilter
  );
  const reviewedApplications = authorityApplications.filter((a) => Boolean(a.reviewedAt));
  const analyticsData = computeAnalyticsOverview(complaints, departments, wards);

  return (
    <div className="max-w-[1380px] mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-emerald-700">
            Platform Governance & Oversight · Cloud Firestore
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#0B3B2E] mt-1">
            Administrator Control Center
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void handleSyncReferenceCatalog()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#0B3B2E] bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 cursor-pointer self-start"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Sync Municipal Departments & Wards to Firestore
        </button>
      </div>

      {syncNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-lg flex items-center justify-between">
          <span>{syncNotice}</span>
          <button type="button" onClick={() => setSyncNotice(null)} className="underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-neutral-500">Total Complaints</div>
          <div className="text-2xl font-display font-bold tabular-nums text-[#0B3B2E] mt-1">{complaints.length}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-neutral-500">Resolved Complaints</div>
          <div className="text-2xl font-display font-bold tabular-nums text-emerald-700 mt-1">{resolvedCount}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-neutral-500">Pending Authority Requests</div>
          <div className="text-2xl font-display font-bold tabular-nums text-amber-700 mt-1">
            {pendingAuthorityCount}
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-neutral-500">Departments / Wards</div>
          <div className="text-2xl font-display font-bold tabular-nums text-[#0B3B2E] mt-1">
            {departments.length} / {wards.length}
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-neutral-500">Pending Duplicate Flags</div>
          <div className="text-2xl font-display font-bold tabular-nums text-orange-700 mt-1">
            {duplicates.filter((d) => d.reviewStatus === 'pending_review').length}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 p-1 bg-white border border-neutral-200 rounded-xl overflow-x-auto">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'complaints', label: 'All Complaints' },
          {
            id: 'authority_requests',
            label:
              pendingAuthorityCount > 0
                ? `Authority Applications (${pendingAuthorityCount})`
                : 'Authority Applications',
          },
          { id: 'users', label: 'User Management' },
          { id: 'structure', label: 'Departments & Wards' },
          { id: 'analytics', label: 'Analytics' },
          { id: 'ai_duplicates', label: 'ML Service & Duplicates' },
          { id: 'audit', label: 'Audit Logs' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id as AdminTab)}
            className={`px-4 py-2 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              tab === item.id
                ? 'bg-[#0B3B2E] text-white'
                : 'text-neutral-600 hover:text-[#0B3B2E] hover:bg-neutral-50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-display font-semibold text-[#0B3B2E]">
                Recent Municipal Grievances
              </h2>
              <button
                type="button"
                onClick={() => setTab('complaints')}
                className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
              >
                View All Complaints
              </button>
            </div>
            {complaints.length === 0 ? (
              <p className="text-sm text-neutral-500">No civic complaints stored in Cloud Firestore yet.</p>
            ) : (
              <div className="divide-y divide-neutral-100">
                {complaints.slice(0, 6).map((c) => (
                  <div key={c.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-neutral-500">
                        {c.id} · {c.category}
                      </div>
                      <div className="text-sm font-semibold text-[#0B3B2E] truncate">{c.title}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <PriorityBadge priority={c.priority} />
                      <StatusBadge status={c.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-3">
              <h2 className="text-base font-display font-semibold text-[#0B3B2E]">
                Governance Operational Summary
              </h2>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-2 border-b border-neutral-100">
                  <span className="text-neutral-600">Resolution Rate</span>
                  <span className="font-mono font-semibold text-[#0B3B2E]">
                    {analyticsData.resolutionRatePercent}%
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-neutral-100">
                  <span className="text-neutral-600">Active Authority Officers</span>
                  <span className="font-mono font-semibold text-[#0B3B2E]">
                    {users.filter((u) => u.role === 'authority' && u.active).length}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-neutral-100">
                  <span className="text-neutral-600">Pending Duplicate Reviews</span>
                  <span className="font-mono font-semibold text-orange-700">
                    {duplicates.filter((d) => d.reviewStatus === 'pending_review').length}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-neutral-600">Recent Governance Audit Events</span>
                  <span className="font-mono font-semibold text-[#0B3B2E]">{auditLogs.length}</span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-display font-semibold text-[#0B3B2E]">
                  Latest Audit Activity
                </h2>
                <button
                  type="button"
                  onClick={() => setTab('audit')}
                  className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
                >
                  Full Log
                </button>
              </div>
              {auditLogs.length === 0 ? (
                <p className="text-xs text-neutral-500">No audit entries recorded yet.</p>
              ) : (
                <div className="space-y-2 text-xs">
                  {auditLogs.slice(0, 4).map((log) => (
                    <div key={log.id} className="p-2.5 bg-[#F7F9F8] border border-neutral-200 rounded-lg">
                      <div className="font-mono font-semibold text-[#0B3B2E]">{log.action}</div>
                      <div className="text-neutral-600 truncate mt-0.5">{log.details}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'complaints' && (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
          {complaints.length === 0 ? (
            <div className="p-8 text-center text-sm text-neutral-500">
              No civic complaints stored in Cloud Firestore yet.
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-[#F7F9F8] text-xs text-neutral-600">
                  <th className="py-3 px-4 font-semibold">ID & Title</th>
                  <th className="py-3 px-4 font-semibold">Category</th>
                  <th className="py-3 px-4 font-semibold">Priority</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Assigned Officer</th>
                  <th className="py-3 px-4 font-semibold text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {complaints.map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50">
                    <td className="py-3 px-4 max-w-xs">
                      <div className="text-xs font-mono text-neutral-500">{c.id}</div>
                      <div className="font-semibold text-[#0B3B2E] truncate">{c.title}</div>
                    </td>
                    <td className="py-3 px-4 text-xs text-neutral-700">{c.category}</td>
                    <td className="py-3 px-4">
                      <PriorityBadge priority={c.priority} />
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="py-3 px-4 text-xs text-neutral-700">{c.assignedAuthorityName || 'Unassigned'}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedComplaint(c)}
                        className="px-3 py-1.5 text-xs font-medium border border-neutral-300 rounded-lg hover:bg-neutral-100 cursor-pointer"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'authority_requests' && (
        <div className="space-y-6">
          <div className="bg-white border border-neutral-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'pending_verification', label: 'Pending Review' },
                  { id: 'approved', label: 'Approved' },
                  { id: 'rejected', label: 'Rejected' },
                  { id: 'suspended', label: 'Suspended' },
                  { id: 'all', label: 'All Requests' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setAppFilter(f.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer ${
                    appFilter === f.id
                      ? 'bg-[#0B3B2E] text-white'
                      : 'bg-[#F7F9F8] text-neutral-700 border border-neutral-200 hover:bg-neutral-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void refreshApplications()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-neutral-300 rounded-lg text-[#0B3B2E] hover:bg-neutral-50 cursor-pointer self-start"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh Queue
            </button>
          </div>

          {appError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg">
              {appError}
            </div>
          )}
          {appNotice && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-lg">
              {appNotice}
            </div>
          )}

          {filteredApplications.length === 0 ? (
            <div className="bg-white border border-neutral-200 rounded-xl p-8 text-center text-sm text-neutral-500">
              No authority verification requests match this filter.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredApplications.map((app) => {
                const editState = appEdits[app.uid] || {
                  departmentId: app.departmentId,
                  wardId: app.wardId,
                };
                const isBusy = appBusyUid === app.uid;
                return (
                  <div
                    key={app.uid}
                    className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4"
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-display font-bold text-[#0B3B2E]">
                            {app.fullName}
                          </h3>
                          <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded border border-neutral-200 bg-[#F7F9F8] text-neutral-700">
                            {app.status.replace('_', ' ')}
                          </span>
                          <span
                            className={`text-[11px] font-medium px-2 py-0.5 rounded border ${
                              app.emailVerified
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-amber-50 border-amber-200 text-amber-800'
                            }`}
                          >
                            {app.emailVerified ? 'Email Verified' : 'Email Unverified'}
                          </span>
                        </div>
                        <div className="text-xs text-neutral-600 mt-1">
                          <span className="font-mono">{app.officialEmail}</span> · {app.contactNumber} · UID:{' '}
                          <span className="font-mono">{app.uid}</span>
                        </div>
                      </div>
                      <div className="text-xs text-neutral-500 font-mono">
                        Submitted: {new Date(app.submittedAt).toLocaleString()}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs bg-[#F7F9F8] border border-neutral-200 rounded-lg p-4">
                      <div>
                        <div className="text-neutral-500">Employee ID</div>
                        <div className="font-semibold text-[#0B3B2E]">{app.employeeId}</div>
                      </div>
                      <div>
                        <div className="text-neutral-500">Designation</div>
                        <div className="font-semibold text-[#0B3B2E]">{app.designation}</div>
                      </div>
                      <div>
                        <div className="text-neutral-500">Municipal Corporation</div>
                        <div className="font-semibold text-[#0B3B2E]">{app.municipality}</div>
                      </div>
                      <div>
                        <div className="text-neutral-500">Verification Document</div>
                        {app.verificationDocUrl ? (
                          <button
                            type="button"
                            onClick={() => void handlePreviewDoc(app)}
                            className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline cursor-pointer mt-0.5"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Inspect ({app.verificationDocName || 'Document'})
                          </button>
                        ) : (
                          <div className="text-neutral-500">Not uploaded</div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 mb-1">
                          Assigned Department
                        </label>
                        <select
                          value={editState.departmentId}
                          onChange={(e) =>
                            setAppEdits((prev) => ({
                              ...prev,
                              [app.uid]: { ...editState, departmentId: e.target.value },
                            }))
                          }
                          className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
                        >
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} ({d.code})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 mb-1">
                          Assigned Ward
                        </label>
                        <select
                          value={editState.wardId}
                          onChange={(e) =>
                            setAppEdits((prev) => ({
                              ...prev,
                              [app.uid]: { ...editState, wardId: e.target.value },
                            }))
                          }
                          className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
                        >
                          {wards.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name} ({w.zone})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {app.rejectionReason && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900">
                        <span className="font-semibold">Recorded Reason:</span> {app.rejectionReason}
                      </div>
                    )}

                    {rejectTargetUid === app.uid && (
                      <div className="p-4 bg-red-50/70 border border-red-200 rounded-lg space-y-2.5">
                        <label className="block text-xs font-semibold text-red-900">
                          Mandatory Rejection Reason
                        </label>
                        <textarea
                          rows={2}
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          placeholder="State why verification was rejected (e.g., Employee ID mismatch or unconfirmed department)..."
                          className="w-full px-3 py-2 text-xs border border-red-300 rounded-lg bg-white"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleRejectApplication(app)}
                            className="px-3.5 py-1.5 text-xs font-medium bg-red-700 text-white rounded-lg cursor-pointer disabled:opacity-60"
                          >
                            Confirm Rejection
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectTargetUid(null);
                              setRejectionReason('');
                            }}
                            className="px-3 py-1.5 text-xs border border-neutral-300 bg-white rounded-lg cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="pt-3 border-t border-neutral-100 flex flex-wrap items-center gap-2.5">
                      {(app.status === 'pending_verification' ||
                        app.status === 'rejected' ||
                        app.status === 'suspended') && (
                        <button
                          type="button"
                          disabled={isBusy || !app.emailVerified}
                          title={
                            !app.emailVerified
                              ? 'Official email must be verified in Firebase Authentication before approval'
                              : 'Approve and activate Municipal Authority role'
                          }
                          onClick={() => void handleApproveApplication(app)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#059669] text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {app.status === 'suspended' ? 'Restore & Approve Authority' : 'Approve Authority'}
                        </button>
                      )}

                      {app.status === 'pending_verification' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            setRejectTargetUid(app.uid);
                            setRejectionReason('');
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border border-red-300 text-red-700 bg-white rounded-lg hover:bg-red-50 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Reject Request
                        </button>
                      )}

                      {app.status === 'approved' && (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleUpdateApplicationScope(app)}
                            className="px-4 py-2 text-xs font-medium bg-[#0B3B2E] text-white rounded-lg hover:bg-[#114B3B] cursor-pointer disabled:opacity-60"
                          >
                            Save Department / Ward Assignment
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleSuspendApplication(app)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border border-red-300 text-red-700 bg-white rounded-lg hover:bg-red-50 cursor-pointer"
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                            Suspend Authority
                          </button>
                        </>
                      )}

                      {!app.emailVerified && app.status === 'pending_verification' && (
                        <span className="text-xs text-amber-800">
                          Awaiting applicant email verification in Firebase Authentication before approval.
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {reviewedApplications.length > 0 && (
            <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
              <div className="px-5 py-3.5 border-b border-neutral-200 font-display font-semibold text-sm text-[#0B3B2E]">
                Verification History
              </div>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 bg-[#F7F9F8] text-neutral-600">
                    <th className="py-2.5 px-4 font-semibold">Applicant</th>
                    <th className="py-2.5 px-4 font-semibold">Department & Ward</th>
                    <th className="py-2.5 px-4 font-semibold">Decision</th>
                    <th className="py-2.5 px-4 font-semibold">Reviewed By</th>
                    <th className="py-2.5 px-4 font-semibold">Reviewed At</th>
                    <th className="py-2.5 px-4 font-semibold">Notes / Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {reviewedApplications.map((r) => (
                    <tr key={`hist-${r.uid}`}>
                      <td className="py-2.5 px-4 font-medium text-[#0B3B2E]">
                        {r.fullName} <span className="font-mono text-neutral-500">({r.employeeId})</span>
                      </td>
                      <td className="py-2.5 px-4 text-neutral-700">
                        {r.departmentName} · {r.wardName}
                      </td>
                      <td className="py-2.5 px-4 font-mono uppercase">{r.status.replace('_', ' ')}</td>
                      <td className="py-2.5 px-4 text-neutral-700">{r.reviewedByName || r.reviewedBy}</td>
                      <td className="py-2.5 px-4 font-mono text-neutral-500">
                        {r.reviewedAt ? new Date(r.reviewedAt).toLocaleString() : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-neutral-600">{r.rejectionReason || 'Approved'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'users' && (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-[#F7F9F8] text-xs text-neutral-600">
                <th className="py-3 px-4 font-semibold">User</th>
                <th className="py-3 px-4 font-semibold">UID</th>
                <th className="py-3 px-4 font-semibold">Role Assignment</th>
                <th className="py-3 px-4 font-semibold">Department Scope</th>
                <th className="py-3 px-4 font-semibold">Ward Scope</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Account Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {users.map((u) => (
                <tr key={u.uid} className="hover:bg-neutral-50">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-[#0B3B2E]">{u.displayName}</div>
                    <div className="text-xs font-mono text-neutral-500">{u.email || 'Private email'}</div>
                  </td>
                  <td className="py-3 px-4 text-xs font-mono text-neutral-500">{u.uid.slice(0, 12)}...</td>
                  <td className="py-3 px-4">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                      className="px-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white"
                    >
                      <option value="citizen">Citizen</option>
                      <option value="authority">Municipal Authority</option>
                      <option value="admin">Administrator</option>
                      <option value="system">System</option>
                    </select>
                  </td>
                  <td className="py-3 px-4">
                    <select
                      value={u.departmentId || ''}
                      onChange={(e) => void handleDepartmentChange(u, e.target.value)}
                      className="px-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white max-w-[180px]"
                    >
                      <option value="">None</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4">
                    <select
                      value={u.wardId || ''}
                      onChange={(e) => void handleWardChange(u, e.target.value)}
                      className="px-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white max-w-[160px]"
                    >
                      <option value="">Unassigned</option>
                      {wards.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4 text-xs font-medium">
                    {u.active ? (
                      <span className="text-emerald-700">Active</span>
                    ) : (
                      <span className="text-red-700">Deactivated</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(u)}
                      className="px-3 py-1.5 text-xs font-medium border border-neutral-300 rounded-lg hover:bg-neutral-100 cursor-pointer"
                    >
                      {u.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'structure' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-display font-semibold text-[#0B3B2E]">Municipal Departments</h3>
            <div className="divide-y divide-neutral-100">
              {departments.map((d) => (
                <div key={d.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-[#0B3B2E]">
                      {d.name} <span className="font-mono text-neutral-500">({d.code})</span>
                    </div>
                    <div className="text-neutral-500">Lead: {d.leadOfficer}</div>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={handleCreateDept} className="pt-4 border-t border-neutral-200 space-y-2.5">
              <div className="text-xs font-semibold text-neutral-700">Add Department</div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Department Name"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  className="px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                />
                <input
                  type="text"
                  required
                  placeholder="Code (e.g. ENV-09)"
                  value={newDeptCode}
                  onChange={(e) => setNewDeptCode(e.target.value)}
                  className="px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Lead Officer Name"
                  value={newDeptLead}
                  onChange={(e) => setNewDeptLead(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                />
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium bg-[#0B3B2E] text-white rounded-lg cursor-pointer"
                >
                  Add
                </button>
              </div>
            </form>
          </div>

          <div className="space-y-6">
            <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
              <h3 className="text-base font-display font-semibold text-[#0B3B2E]">Municipal Wards</h3>
              <div className="divide-y divide-neutral-100 max-h-56 overflow-y-auto">
                {wards.map((w) => (
                  <div key={w.id} className="py-2 flex items-center justify-between text-xs">
                    <span className="font-medium text-[#0B3B2E]">{w.name}</span>
                    <span className="font-mono text-neutral-500">
                      {w.zone} · {w.centerLat.toFixed(3)}, {w.centerLng.toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
              <form onSubmit={handleCreateWard} className="pt-4 border-t border-neutral-200 space-y-2.5">
                <div className="text-xs font-semibold text-neutral-700">Add Ward</div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Ward Name"
                    value={newWardName}
                    onChange={(e) => setNewWardName(e.target.value)}
                    className="px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Zone"
                    value={newWardZone}
                    onChange={(e) => setNewWardZone(e.target.value)}
                    className="px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={newWardLat}
                    onChange={(e) => setNewWardLat(e.target.value)}
                    className="px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={newWardLng}
                    onChange={(e) => setNewWardLng(e.target.value)}
                    className="px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium bg-[#0B3B2E] text-white rounded-lg cursor-pointer"
                >
                  Add Ward
                </button>
              </form>
            </div>

            <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-3">
              <h3 className="text-base font-display font-semibold text-[#0B3B2E]">Category SLA Reference</h3>
              <div className="divide-y divide-neutral-100">
                {MUNICIPAL_CATEGORIES.map((cat) => (
                  <div key={cat.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-neutral-800">{cat.name}</span>
                    <span className="font-mono tabular-nums text-neutral-600">{cat.slaHours}h SLA</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'analytics' && <AnalyticsCharts data={analyticsData} />}

      {tab === 'ai_duplicates' && (
        <div className="space-y-6">
          <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-display font-semibold text-[#0B3B2E]">Python FastAPI ML Service Status</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div className="border border-neutral-200 rounded-lg p-4">
                <div className="text-xs text-neutral-500">Active Classifier</div>
                <div className="font-semibold text-[#0B3B2E] mt-1">{aiStatus?.activeMode || 'Checking...'}</div>
              </div>
              <div className="border border-neutral-200 rounded-lg p-4">
                <div className="text-xs text-neutral-500">Configured Endpoint</div>
                <div className="font-mono text-xs text-neutral-700 mt-1">
                  {aiStatus?.configuredUrl || 'Not configured (ML_SERVICE_URL unset)'}
                </div>
              </div>
              <div className="border border-neutral-200 rounded-lg p-4">
                <div className="text-xs text-neutral-500">Trained Model Connection</div>
                <div className="font-semibold text-neutral-800 mt-1">
                  {aiStatus?.pythonServiceReachable ? 'Connected to Python FastAPI' : 'Unavailable (Baseline Heuristic Active)'}
                </div>
              </div>
            </div>
            {aiStatus?.limitationNotice && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                {aiStatus.limitationNotice}
              </p>
            )}
          </div>

          <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-3">
            <h3 className="text-base font-display font-semibold text-[#0B3B2E]">Duplicate Match Queue</h3>
            {duplicates.length === 0 ? (
              <p className="text-sm text-neutral-500">No duplicate matches flagged yet.</p>
            ) : (
              <div className="space-y-2.5">
                {duplicates.map((d) => (
                  <div
                    key={d.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 border border-neutral-200 rounded-lg text-xs"
                  >
                    <div>
                      <div className="font-semibold text-[#0B3B2E]">
                        <span className="font-mono">{d.sourceComplaintId}</span> ↔{' '}
                        <span className="font-mono">{d.matchedComplaintId}</span> ·{' '}
                        <span className="uppercase">{d.reviewStatus.replace('_', ' ')}</span>
                      </div>
                      <div className="text-neutral-600 mt-0.5">{d.similarityReason}</div>
                    </div>
                    {user && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void reviewDuplicateMatchInFirestore(d, 'confirmed_duplicate', user)}
                          className="px-3 py-1.5 bg-amber-600 text-white rounded-md font-medium cursor-pointer"
                        >
                          Confirm Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={() => void reviewDuplicateMatchInFirestore(d, 'dismissed', user)}
                          className="px-3 py-1.5 border border-neutral-300 rounded-md font-medium cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200 bg-[#F7F9F8] text-neutral-600">
                <th className="py-3 px-4 font-semibold">Timestamp</th>
                <th className="py-3 px-4 font-semibold">Actor</th>
                <th className="py-3 px-4 font-semibold">Action</th>
                <th className="py-3 px-4 font-semibold">Target</th>
                <th className="py-3 px-4 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-neutral-50">
                  <td className="py-2.5 px-4 font-mono tabular-nums text-neutral-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 font-medium text-[#0B3B2E]">
                    {log.actorName} ({log.actorRole})
                  </td>
                  <td className="py-2.5 px-4 font-mono text-neutral-700">{log.action}</td>
                  <td className="py-2.5 px-4 font-mono text-neutral-600">{log.targetId}</td>
                  <td className="py-2.5 px-4 text-neutral-600">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ComplaintDetailsModal
        complaint={selectedComplaint}
        departments={departments}
        authorities={users.filter((u) => u.role === 'authority' || u.role === 'admin')}
        onClose={() => setSelectedComplaint(null)}
        onUpdated={() => setSelectedComplaint(null)}
      />

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title || ''}
        description={confirmAction?.description || ''}
        confirmLabel={confirmAction?.confirmLabel || 'Confirm'}
        busy={confirmBusy}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => void executeConfirmed()}
      />

      {docPreview && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-neutral-200 max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between gap-4">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#0B3B2E] truncate">
                <FileText className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="truncate">{docPreview.name}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <a
                  href={docPreview.url}
                  download={docPreview.name}
                  className="text-xs font-medium text-[#0B3B2E] underline"
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={closeDocPreview}
                  className="p-1.5 rounded-lg hover:bg-neutral-100 cursor-pointer"
                  aria-label="Close document preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-neutral-100 flex items-center justify-center">
              {docPreview.contentType.includes('pdf') ? (
                <iframe
                  src={docPreview.url}
                  title={docPreview.name}
                  className="w-full h-[70vh] rounded border border-neutral-300 bg-white"
                />
              ) : (
                <img
                  src={docPreview.url}
                  alt={docPreview.name}
                  className="max-h-[70vh] w-auto object-contain rounded border border-neutral-300 bg-white"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
