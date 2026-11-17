import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  subscribeDepartments,
  subscribeGisMarkers,
  subscribeWards,
} from '../services/firestoreService';
import {
  AnalyticsSourceItem,
  MUNICIPAL_DEPARTMENTS,
  MUNICIPAL_WARDS,
  computeAnalyticsOverview,
} from '../shared/catalog';
import { CIVIC_CATEGORIES, Department, Ward } from '../shared/types';
import { AnalyticsCharts } from '../components/AnalyticsCharts';

export const AnalyticsPage: React.FC<{ onOpenAuth?: () => void }> = ({ onOpenAuth }) => {
  const { user, loading: authLoading } = useAuth();
  const [markers, setMarkers] = useState<AnalyticsSourceItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>(MUNICIPAL_DEPARTMENTS);
  const [wards, setWards] = useState<Ward[]>(MUNICIPAL_WARDS);
  const [category, setCategory] = useState('All');
  const [wardId, setWardId] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    if (authLoading || !user?.uid) {
      setMarkers([]);
      setDepartments(MUNICIPAL_DEPARTMENTS);
      setWards(MUNICIPAL_WARDS);
      return;
    }
    const unsubMarkers = subscribeGisMarkers((list) =>
      setMarkers(
        list.map((m) => ({
          id: m.id,
          category: m.category,
          priority: m.priority,
          status: m.status,
          wardId: m.wardId,
          assignedDepartmentId: m.assignedDepartmentId,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        }))
      )
    );
    const unsubDepts = subscribeDepartments(setDepartments);
    const unsubWards = subscribeWards(setWards);
    return () => {
      unsubMarkers();
      unsubDepts();
      unsubWards();
    };
  }, [authLoading, user?.uid]);

  if (authLoading) {
    return (
      <div className="max-w-[1380px] mx-auto px-4 sm:px-6 py-12 text-center text-sm text-neutral-500">
        Verifying Firebase Authentication session...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-14">
        <div className="bg-white border border-neutral-200 rounded-xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#0B3B2E] mx-auto">
            <Lock className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-display font-bold text-[#0B3B2E]">
            Sign In Required for City Analytics
          </h1>
          <p className="text-sm text-neutral-600 leading-relaxed">
            Cloud Firestore security rules protect live grievance analytics, department performance, and ward distributions from unauthenticated access. Sign in with Firebase Authentication to inspect live analytics.
          </p>
          {onOpenAuth && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-5 py-2.5 text-sm font-medium bg-[#0B3B2E] text-white rounded-lg hover:bg-[#114B3B] transition-colors cursor-pointer"
            >
              Sign In or Register
            </button>
          )}
        </div>
      </div>
    );
  }

  const filtered = markers.filter((c) => {
    if (category !== 'All' && c.category !== category) return false;
    if (wardId !== 'All' && c.wardId !== wardId) return false;
    if (fromDate) {
      const fromTime = new Date(fromDate).getTime();
      if (!Number.isNaN(fromTime) && new Date(c.createdAt).getTime() < fromTime) return false;
    }
    if (toDate) {
      const toTime = new Date(toDate).getTime() + 86400 * 1000;
      if (!Number.isNaN(toTime) && new Date(c.createdAt).getTime() > toTime) return false;
    }
    return true;
  });

  const data = computeAnalyticsOverview(filtered, departments, wards);

  return (
    <div className="max-w-[1380px] mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <div className="text-xs font-medium text-emerald-700">
          Computed Live from Cloud Firestore Grievance Records
        </div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#0B3B2E] mt-1">
          Civic Analytics & Performance Reporting
        </h1>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
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
          value={wardId}
          onChange={(e) => setWardId(e.target.value)}
          className="px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white"
        >
          <option value="All">All Wards</option>
          {wards.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          aria-label="From date"
          className="px-3 py-2 text-sm border border-neutral-300 rounded-lg"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          aria-label="To date"
          className="px-3 py-2 text-sm border border-neutral-300 rounded-lg"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs text-neutral-500">Filtered Complaints</div>
          <div className="text-3xl font-display font-bold tabular-nums text-[#0B3B2E] mt-1">
            {data.totalComplaints}
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs text-neutral-500">Resolution Rate</div>
          <div className="text-3xl font-display font-bold tabular-nums text-emerald-700 mt-1">
            {data.resolutionRatePercent}%
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs text-neutral-500">Average Resolution Time</div>
          <div className="text-3xl font-display font-bold tabular-nums text-[#0B3B2E] mt-1">
            {data.avgResolutionHours} hrs
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs text-neutral-500">High & Critical Volume</div>
          <div className="text-3xl font-display font-bold tabular-nums text-orange-700 mt-1">
            {data.highPriorityCount + data.criticalPriorityCount}
          </div>
        </div>
      </div>

      <AnalyticsCharts data={data} />
    </div>
  );
};
