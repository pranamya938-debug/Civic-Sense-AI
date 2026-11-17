import React, { useEffect, useState } from 'react';
import { Search, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  reviewDuplicateMatchInFirestore,
  subscribeAllComplaints,
  subscribeDepartments,
  subscribeDuplicateMatches,
  subscribeUsers,
  subscribeWards,
} from '../services/firestoreService';
import { MUNICIPAL_DEPARTMENTS, MUNICIPAL_WARDS } from '../shared/catalog';
import {
  CIVIC_CATEGORIES,
  COMPLAINT_STATUSES,
  ComplaintRecord,
  Department,
  DuplicateMatchRecord,
  UserProfile,
  Ward,
} from '../shared/types';
import { ComplaintDetailsModal } from '../components/ComplaintDetailsModal';
import { PriorityBadge, StatusBadge } from '../components/StatusBadge';

export const AuthorityDashboard: React.FC = () => {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [departments, setDepartments] = useState<Department[]>(MUNICIPAL_DEPARTMENTS);
  const [wards, setWards] = useState<Ward[]>(MUNICIPAL_WARDS);
  const [authorities, setAuthorities] = useState<UserProfile[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateMatchRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [wardFilter, setWardFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintRecord | null>(null);

  useEffect(() => {
    if (!user?.uid || (user.role !== 'authority' && user.role !== 'admin')) {
      return;
    }
    const unsubDepts = subscribeDepartments(setDepartments);
    const unsubWards = subscribeWards(setWards);
    const unsubUsers = subscribeUsers(false, (list) =>
      setAuthorities(list.filter((u) => u.role === 'authority' || u.role === 'admin'))
    );
    const unsubDups = subscribeDuplicateMatches(setDuplicates);
    return () => {
      unsubDepts();
      unsubWards();
      unsubUsers();
      unsubDups();
    };
  }, [user?.uid, user?.role]);

  useEffect(() => {
    if (!user?.uid || (user.role !== 'authority' && user.role !== 'admin')) {
      setComplaints([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeAllComplaints(departments, (list) => {
      setComplaints(list);
      setLoading(false);
    });
    return () => unsub();
  }, [user?.uid, user?.role, departments]);

  const filtered = complaints.filter((c) => {
    if (categoryFilter !== 'All' && c.category !== categoryFilter) return false;
    if (priorityFilter !== 'All' && c.priority !== priorityFilter) return false;
    if (wardFilter !== 'All' && c.wardId !== wardFilter) return false;
    if (statusFilter !== 'All' && c.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        c.id.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        c.citizenName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const pendingCount = complaints.filter((c) => c.status === 'Submitted' || c.status === 'Under Review').length;
  const highCount = complaints.filter((c) => c.priority === 'High').length;
  const criticalCount = complaints.filter((c) => c.priority === 'Critical').length;
  const inProgressCount = complaints.filter((c) => c.status === 'Assigned' || c.status === 'In Progress').length;
  const resolvedCount = complaints.filter((c) => c.status === 'Resolved').length;

  const deptName = (id?: string) => departments.find((d) => d.id === id)?.name || 'Unassigned';
  const wardName = (id: string) => wards.find((w) => w.id === id)?.name || id;

  return (
    <div className="max-w-[1380px] mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <div className="text-xs font-medium text-emerald-700">
          Municipal Operations Console · Officer {user?.displayName}
        </div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#0B3B2E] mt-1">
          Incoming Civic Grievances & Dispatch
        </h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-neutral-500">Total Received</div>
          <div className="text-2xl font-display font-bold tabular-nums text-[#0B3B2E] mt-1">{complaints.length}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-neutral-500">Pending Triage</div>
          <div className="text-2xl font-display font-bold tabular-nums text-amber-700 mt-1">{pendingCount}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-neutral-500">High Priority</div>
          <div className="text-2xl font-display font-bold tabular-nums text-orange-700 mt-1">{highCount}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-neutral-500">Critical</div>
          <div className="text-2xl font-display font-bold tabular-nums text-red-700 mt-1">{criticalCount}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-neutral-500">In Progress</div>
          <div className="text-2xl font-display font-bold tabular-nums text-emerald-700 mt-1">{inProgressCount}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-neutral-500">Resolved</div>
          <div className="text-2xl font-display font-bold tabular-nums text-[#0B3B2E] mt-1">{resolvedCount}</div>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ID, title, locality..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-300 rounded-lg"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white"
        >
          <option value="All">All Categories</option>
          {CIVIC_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white"
        >
          <option value="All">All Priorities</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <select
          value={wardFilter}
          onChange={(e) => setWardFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white"
        >
          <option value="All">All Wards</option>
          {wards.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white"
        >
          <option value="All">All Statuses</option>
          {COMPLAINT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-neutral-500">Loading Cloud Firestore queue...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-500">No complaints match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-[#F7F9F8] text-xs text-neutral-600">
                  <th className="py-3 px-4 font-semibold">Complaint</th>
                  <th className="py-3 px-4 font-semibold">Category & Ward</th>
                  <th className="py-3 px-4 font-semibold">Department</th>
                  <th className="py-3 px-4 font-semibold">Priority</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50">
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="text-xs font-mono text-neutral-500">
                        {c.id} · {c.citizenName}
                      </div>
                      <div className="font-semibold text-[#0B3B2E] truncate">{c.title}</div>
                      <div className="text-xs text-neutral-500 truncate">{c.address}</div>
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      <div className="font-medium text-neutral-800">{c.category}</div>
                      <div className="text-neutral-500">{wardName(c.wardId)}</div>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium text-neutral-700">
                      {deptName(c.assignedDepartmentId)}
                    </td>
                    <td className="py-3.5 px-4">
                      <PriorityBadge priority={c.priority} />
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedComplaint(c)}
                        className="px-3 py-1.5 text-xs font-medium bg-[#0B3B2E] text-white rounded-lg hover:bg-[#114B3B] transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Triage & Assign
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {duplicates.some((d) => d.reviewStatus === 'pending_review') && user && (
        <div className="bg-white border border-amber-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <ShieldAlert className="w-4 h-4" />
            Pending Duplicate Complaint Reviews
          </div>
          <div className="space-y-2">
            {duplicates
              .filter((d) => d.reviewStatus === 'pending_review')
              .map((d) => (
                <div
                  key={d.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-amber-50/50 border border-amber-200 rounded-lg text-xs"
                >
                  <div>
                    <div className="font-semibold text-[#0B3B2E]">
                      <span className="font-mono">{d.sourceComplaintId}</span> vs{' '}
                      <span className="font-mono">{d.matchedComplaintId}</span>
                    </div>
                    <div className="text-neutral-700 mt-0.5">{d.similarityReason}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void reviewDuplicateMatchInFirestore(d, 'confirmed_duplicate', user)}
                      className="px-3 py-1.5 bg-amber-700 text-white font-medium rounded-md hover:bg-amber-800 cursor-pointer"
                    >
                      Confirm Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => void reviewDuplicateMatchInFirestore(d, 'dismissed', user)}
                      className="px-3 py-1.5 border border-neutral-300 bg-white text-neutral-700 font-medium rounded-md hover:bg-neutral-50 cursor-pointer"
                    >
                      Keep Separate
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      <ComplaintDetailsModal
        complaint={selectedComplaint}
        departments={departments}
        authorities={authorities}
        onClose={() => setSelectedComplaint(null)}
        onUpdated={() => setSelectedComplaint(null)}
      />
    </div>
  );
};
