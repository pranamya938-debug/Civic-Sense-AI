import React, { useEffect, useState } from 'react';
import { Activity, Database, Lock, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/apiClient';
import { subscribeAuditLogs } from '../services/firestoreService';
import { AuditLogEntry } from '../shared/types';

interface SystemStatusPayload {
  service: string;
  actorUid: string;
  actorRole: string;
  mlService: {
    configuredUrl: string | null;
    pythonServiceReachable: boolean;
    activeMode: string;
  };
  environment: {
    nodeEnv: string;
    firebaseProjectId: string;
    firestoreDatabaseId: string;
  };
}

export const SystemDashboard: React.FC = () => {
  const { user } = useAuth();
  const [status, setStatus] = useState<SystemStatusPayload | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid || (user.role !== 'system' && user.role !== 'admin')) {
      return;
    }

    apiRequest<SystemStatusPayload>('/api/admin/system/status')
      .then((res) => {
        setStatus(res);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load system telemetry.');
      });

    const unsubLogs = subscribeAuditLogs(setAuditLogs);
    return () => unsubLogs();
  }, [user?.uid, user?.role]);

  if (!user || (user.role !== 'system' && user.role !== 'admin')) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-14">
        <div className="bg-white border border-red-200 rounded-xl p-8 text-center space-y-3">
          <Lock className="w-8 h-8 text-red-700 mx-auto" />
          <h1 className="text-xl font-display font-bold text-[#0B3B2E]">Access Denied</h1>
          <p className="text-sm text-neutral-600">
            Restricted system console access requires an authorized system-level Firestore role.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1380px] mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
            <ShieldAlert className="w-3.5 h-3.5" />
            Restricted System Console · Verified Role: {user.role}
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#0B3B2E] mt-2">
            CivicSense System Runtime & Audit Console
          </h1>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500">
            <Database className="w-4 h-4 text-[#0B3B2E]" />
            Cloud Firestore Database
          </div>
          <div className="text-sm font-mono font-semibold text-[#0B3B2E]">
            {status?.environment.firebaseProjectId || 'Verifying...'}
          </div>
          <div className="text-xs font-mono text-neutral-500">
            DB: {status?.environment.firestoreDatabaseId || '—'}
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500">
            <Activity className="w-4 h-4 text-emerald-700" />
            ML Classifier Pipeline
          </div>
          <div className="text-sm font-semibold text-[#0B3B2E]">
            {status?.mlService.activeMode || 'Baseline Classifier'}
          </div>
          <div className="text-xs text-neutral-500">
            {status?.mlService.pythonServiceReachable
              ? 'Python FastAPI ML connected'
              : 'ML service disconnected (baseline heuristic active)'}
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500">
            <Lock className="w-4 h-4 text-[#0B3B2E]" />
            Verified System Identity
          </div>
          <div className="text-sm font-semibold text-[#0B3B2E]">{user.displayName}</div>
          <div className="text-xs font-mono text-neutral-500">{user.uid}</div>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200">
          <h2 className="text-base font-display font-semibold text-[#0B3B2E]">
            Immutable System & Governance Audit Trail
          </h2>
        </div>
        {auditLogs.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-500">No audit records available.</div>
        ) : (
          <div className="overflow-x-auto">
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
      </div>
    </div>
  );
};
