import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/apiClient';
import {
  createDepartmentInFirestore,
  createWardInFirestore,
  reviewDuplicateMatchInFirestore,
  subscribeAllComplaints,
  subscribeAuditLogs,
  subscribeDepartments,
  subscribeDuplicateMatches,
  subscribeUsers,
  subscribeWards,
  syncReferenceCatalogToFirestore,
  updateUserByAdminInFirestore,
} from '../services/firestoreService';
import {
  MUNICIPAL_CATEGORIES,
  MUNICIPAL_DEPARTMENTS,
  MUNICIPAL_WARDS,
  computeAnalyticsOverview,
} from '../shared/catalog';
import {
  AuditLogEntry,
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
import { ApiDocsPage } from '../pages/ApiDocsPage';

type AdminTab = 'complaints' | 'users' | 'structure' | 'analytics' | 'ai_duplicates' | 'audit' | 'developer';

export const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<AdminTab>('complaints');
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
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

  const handleRoleChange = (targetUser: UserProfile, nextRole: UserRole) => {
    if (!user) return;
    setConfirmAction({
      title: `Change Role for ${targetUser.displayName}`,
      description: `Reassign ${targetUser.email || targetUser.uid} from ${targetUser.role} to ${nextRole}. Recorded in Cloud Firestore audit logs.`,
      confirmLabel: 'Confirm Role Change',
      run: async () => {
        await updateUserByAdminInFirestore(targetUser, { role: nextRole }, user);
      },
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
        await updateUserByAdminInFirestore(targetUser, { active: !targetUser.active }, user);
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
          <div className="text-xs text-neutral-500">Registered Users</div>
          <div className="text-2xl font-display font-bold tabular-nums text-[#0B3B2E] mt-1">{users.length}</div>
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
          { id: 'complaints', label: 'All Complaints' },
          { id: 'users', label: 'User Management' },
          { id: 'structure', label: 'Departments & Wards' },
          { id: 'analytics', label: 'Analytics' },
          { id: 'ai_duplicates', label: 'ML Service & Duplicates' },
          { id: 'audit', label: 'Audit Logs' },
          { id: 'developer', label: 'Developer Docs & Source ZIP' },
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

      {tab === 'users' && (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-[#F7F9F8] text-xs text-neutral-600">
                <th className="py-3 px-4 font-semibold">User</th>
                <th className="py-3 px-4 font-semibold">UID</th>
                <th className="py-3 px-4 font-semibold">Role Assignment</th>
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

      {tab === 'developer' && <ApiDocsPage />}

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
    </div>
  );
};
