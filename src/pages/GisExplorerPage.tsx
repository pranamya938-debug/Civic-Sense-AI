import React, { useEffect, useState } from 'react';
import { Layers, Lock, MapPin } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { subscribeScopedGisMarkers, subscribeWards } from '../services/firestoreService';
import { MUNICIPAL_WARDS } from '../shared/catalog';
import { CIVIC_CATEGORIES, Ward } from '../shared/types';
import { GisMap, MapComplaintPoint } from '../components/GisMap';
import { PriorityBadge, StatusBadge } from '../components/StatusBadge';

export const GisExplorerPage: React.FC<{ onOpenAuth?: () => void }> = ({ onOpenAuth }) => {
  const { user, loading: authLoading } = useAuth();
  const [allMarkers, setAllMarkers] = useState<MapComplaintPoint[]>([]);
  const [wards, setWards] = useState<Ward[]>(MUNICIPAL_WARDS);
  const [category, setCategory] = useState('All');
  const [priority, setPriority] = useState('All');
  const [wardId, setWardId] = useState('All');
  const [clusterMode, setClusterMode] = useState(false);
  const [densityMode, setDensityMode] = useState(true);
  const [showWardOverlay, setShowWardOverlay] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isAuthorized = Boolean(
    user &&
      user.active &&
      (user.role === 'admin' ||
        (user.role === 'authority' &&
          user.accountStatus === 'approved' &&
          user.emailVerified !== false))
  );

  useEffect(() => {
    if (authLoading || !user?.uid || !isAuthorized) {
      setAllMarkers([]);
      setWards(MUNICIPAL_WARDS);
      return;
    }
    const unsubMarkers = subscribeScopedGisMarkers(user, setAllMarkers);
    const unsubWards = subscribeWards(setWards);
    return () => {
      unsubMarkers();
      unsubWards();
    };
  }, [authLoading, user, isAuthorized]);

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
            Sign In Required for Live GIS Map
          </h1>
          <p className="text-sm text-neutral-600 leading-relaxed">
            Cloud Firestore security rules protect municipal GIS grievance coordinates and ward records from anonymous public access. Sign in with Firebase Authentication to continue.
          </p>
          {onOpenAuth && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-5 py-2.5 text-sm font-medium bg-[#0B3B2E] text-white rounded-lg hover:bg-[#114B3B] transition-colors cursor-pointer"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-14">
        <div className="bg-white border border-red-200 rounded-xl p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-700 mx-auto">
            <Lock className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-display font-bold text-[#0B3B2E]">Access Denied</h1>
          <p className="text-sm text-neutral-600 leading-relaxed">
            Citywide and departmental GIS spatial maps are restricted to authorized Municipal Authority and Administrator accounts.
          </p>
        </div>
      </div>
    );
  }

  const markers = allMarkers.filter((m) => {
    if (category !== 'All' && m.category !== category) return false;
    if (priority !== 'All' && m.priority !== priority) return false;
    if (wardId !== 'All' && m.wardId !== wardId) return false;
    return true;
  });

  const selected = markers.find((m) => m.id === selectedId) || markers[0] || null;

  return (
    <div className="max-w-[1380px] mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-emerald-700">
            Live OpenStreetMap GIS · Synchronized with Cloud Firestore
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#0B3B2E] mt-1">
            Geographic Grievance Map & Ward Density
          </h1>
        </div>
        <div className="text-xs text-neutral-600 font-mono tabular-nums">
          Showing {markers.length} mapped grievance(s)
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
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
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white"
        >
          <option value="All">All Priorities</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
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

        <div className="flex flex-wrap items-center gap-4 ml-auto text-xs font-medium text-neutral-700">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={clusterMode}
              onChange={(e) => setClusterMode(e.target.checked)}
              className="rounded border-neutral-300 text-emerald-700"
            />
            Cluster Markers
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={densityMode}
              onChange={(e) => setDensityMode(e.target.checked)}
              className="rounded border-neutral-300 text-emerald-700"
            />
            Density Heatmap Circles
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showWardOverlay}
              onChange={(e) => setShowWardOverlay(e.target.checked)}
              className="rounded border-neutral-300 text-emerald-700"
            />
            Ward Zone Overlay
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8">
          <GisMap
            complaints={markers}
            wards={wards}
            showWardOverlay={showWardOverlay}
            clusterMode={clusterMode}
            densityMode={densityMode}
            heightClass="h-[520px]"
            selectedId={selected?.id || null}
            onSelectComplaint={(id) => setSelectedId(id)}
          />
          <p className="text-xs text-neutral-500 mt-2 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            Displaying live WGS84 complaint coordinates persisted in Cloud Firestore.
          </p>
        </div>

        <div className="lg:col-span-4 space-y-4">
          {selected ? (
            <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-neutral-500">
                <span>{selected.id}</span>
              </div>
              <h2 className="text-lg font-display font-bold text-[#0B3B2E]">{selected.title}</h2>
              <div className="flex flex-wrap gap-2">
                <PriorityBadge priority={selected.priority} />
                <StatusBadge status={selected.status} />
              </div>
              <div className="text-xs text-neutral-600 space-y-1 pt-2 border-t border-neutral-100">
                <div>
                  <span className="font-semibold text-neutral-800">Category:</span> {selected.category}
                </div>
                <div className="flex items-start gap-1">
                  <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                  <span>{selected.address}</span>
                </div>
                <div className="font-mono tabular-nums text-neutral-500">
                  Coords: {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-neutral-200 rounded-xl p-6 text-sm text-neutral-500">
              No mapped complaints match the current filter.
            </div>
          )}

          <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-2 max-h-[300px] overflow-y-auto">
            <div className="text-xs font-semibold text-[#0B3B2E]">Filtered Incidents</div>
            {markers.length === 0 ? (
              <div className="text-xs text-neutral-500 py-2">No incidents found.</div>
            ) : (
              markers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedId(m.id)}
                  className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                    selected?.id === m.id
                      ? 'border-[#059669] bg-emerald-50/50'
                      : 'border-neutral-200 hover:bg-neutral-50'
                  }`}
                >
                  <div className="font-mono text-[11px] text-neutral-500">
                    {m.id} · {m.priority}
                  </div>
                  <div className="font-semibold text-[#0B3B2E] truncate">{m.title}</div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
