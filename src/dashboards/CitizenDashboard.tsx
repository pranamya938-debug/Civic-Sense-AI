import React, { useEffect, useState } from 'react';
import { Clock, MapPin, PlusCircle, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  subscribeDepartments,
  subscribeMyComplaints,
  subscribeWards,
} from '../services/firestoreService';
import { MUNICIPAL_DEPARTMENTS, MUNICIPAL_WARDS } from '../shared/catalog';
import {
  COMPLAINT_STATUSES,
  ComplaintRecord,
  Department,
  Ward,
} from '../shared/types';
import { ComplaintForm } from '../components/ComplaintForm';
import { ComplaintDetailsModal } from '../components/ComplaintDetailsModal';
import { PriorityBadge, StatusBadge } from '../components/StatusBadge';

export const CitizenDashboard: React.FC<{ initialInspectId?: string | null }> = ({
  initialInspectId,
}) => {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [departments, setDepartments] = useState<Department[]>(MUNICIPAL_DEPARTMENTS);
  const [wards, setWards] = useState<Ward[]>(MUNICIPAL_WARDS);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'list' | 'submit'>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintRecord | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setDepartments(MUNICIPAL_DEPARTMENTS);
      setWards(MUNICIPAL_WARDS);
      return;
    }
    const unsubDepts = subscribeDepartments(setDepartments);
    const unsubWards = subscribeWards(setWards);
    return () => {
      unsubDepts();
      unsubWards();
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setComplaints([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeMyComplaints(user.uid, departments, (list) => {
      setComplaints(list);
      setLoading(false);
      if (initialInspectId) {
        const match = list.find((c) => c.id === initialInspectId);
        if (match) setSelectedComplaint(match);
      }
    });
    return () => unsub();
  }, [user?.uid, departments, initialInspectId]);

  const filtered = complaints.filter((c) => {
    if (statusFilter !== 'All' && c.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        c.id.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalCount = complaints.length;
  const pendingCount = complaints.filter((c) => c.status === 'Submitted' || c.status === 'Under Review').length;
  const inProgressCount = complaints.filter((c) => c.status === 'Assigned' || c.status === 'In Progress').length;
  const resolvedCount = complaints.filter((c) => c.status === 'Resolved').length;

  return (
    <div className="max-w-[1380px] mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-emerald-700">
            Citizen Grievance Portal · Live Cloud Firestore Sync
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#0B3B2E] mt-1">
            Welcome, {user?.displayName}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('list')}
            className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors cursor-pointer ${
              tab === 'list'
                ? 'bg-[#0B3B2E] text-white border-[#0B3B2E]'
                : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
            }`}
          >
            My Complaints
          </button>
          <button
            type="button"
            onClick={() => setTab('submit')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors cursor-pointer ${
              tab === 'submit'
                ? 'bg-[#059669] text-white border-[#059669]'
                : 'bg-emerald-50 text-[#0B3B2E] border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            Submit Complaint
          </button>
        </div>
      </div>

      {banner && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-[#0B3B2E] text-sm rounded-xl flex items-center justify-between gap-4">
          <span>{banner}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-xs font-semibold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs font-medium text-neutral-500">Total Submitted</div>
          <div className="text-3xl font-display font-bold tabular-nums text-[#0B3B2E] mt-1">{totalCount}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs font-medium text-neutral-500">Pending & Under Review</div>
          <div className="text-3xl font-display font-bold tabular-nums text-orange-700 mt-1">{pendingCount}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs font-medium text-neutral-500">Assigned & In Progress</div>
          <div className="text-3xl font-display font-bold tabular-nums text-emerald-700 mt-1">{inProgressCount}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs font-medium text-neutral-500">Resolved</div>
          <div className="text-3xl font-display font-bold tabular-nums text-[#0B3B2E] mt-1">{resolvedCount}</div>
        </div>
      </div>

      {tab === 'submit' ? (
        <ComplaintForm
          wards={wards}
          onSubmitted={(created) => {
            setBanner(
              `Complaint ${created.id} saved to Cloud Firestore under "${created.category}" (${created.priority} priority).`
            );
            setTab('list');
          }}
        />
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl">
          <div className="p-4 sm:p-5 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by Complaint ID, title, or locality..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto">
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
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-neutral-500">Loading grievances from Cloud Firestore...</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm text-neutral-600">
                {complaints.length === 0
                  ? 'You have not submitted any civic grievances yet.'
                  : 'No complaints match your current filter.'}
              </p>
              <button
                type="button"
                onClick={() => setTab('submit')}
                className="px-4 py-2 text-sm font-medium bg-[#0B3B2E] text-white rounded-lg cursor-pointer"
              >
                Submit a Complaint
              </button>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {filtered.map((c) => (
                <div
                  key={c.id}
                  className="p-5 hover:bg-[#F7F9F8] transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 font-mono">
                      <span className="font-semibold text-[#0B3B2E]">{c.id}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-sans">{c.category}</span>
                    </div>
                    <h3 className="text-base font-semibold text-[#0B3B2E] truncate">{c.title}</h3>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                        {c.address}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                        <Clock className="w-3.5 h-3.5 text-neutral-400" />
                        {new Date(c.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <PriorityBadge priority={c.priority} />
                    <StatusBadge status={c.status} />
                    <button
                      type="button"
                      onClick={() => setSelectedComplaint(c)}
                      className="px-3.5 py-1.5 text-xs font-medium text-[#0B3B2E] border border-neutral-300 rounded-lg hover:bg-white transition-colors cursor-pointer"
                    >
                      View Timeline & Map
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ComplaintDetailsModal
        complaint={selectedComplaint}
        departments={departments}
        onClose={() => setSelectedComplaint(null)}
        onUpdated={() => setSelectedComplaint(null)}
      />
    </div>
  );
};
