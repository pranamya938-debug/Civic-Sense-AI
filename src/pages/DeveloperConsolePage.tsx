import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Cpu,
  Database,
  Download,
  Lock,
  RefreshCw,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest, getStoredToken } from '../services/apiClient';
import { auth } from '../services/firebaseClient';

interface DeveloperDiagnostics {
  service: string;
  generatedAt: string;
  authorizedActor: {
    uid: string;
    displayName: string;
    role: string;
  };
  runtime: {
    nodeEnv: string;
    nodeVersion: string;
    port: number;
    uptimeSeconds: number;
    memoryRssMb: number;
    platform: string;
  };
  firebase: {
    configured: boolean;
    projectId: string;
    firestoreDatabaseId: string;
    authDomain: string;
    rulesFilePresent: boolean;
    blueprintPresent: boolean;
  };
  mlService: {
    configured: boolean;
    pythonServiceReachable: boolean;
    activeMode: string;
    modelLabel: string;
  };
  notifications: {
    inAppFirestoreActive: boolean;
    smtpConfigured: boolean;
    smsConfigured: boolean;
  };
  storage: {
    uploadsDirExists: boolean;
    uploadCount: number;
  };
  sourceExport: {
    available: boolean;
    endpoint: string;
    excludedPatterns: string[];
  };
}

export const DeveloperConsolePage: React.FC = () => {
  const { user, hasDeveloperAccess } = useAuth();
  const [diagnostics, setDiagnostics] = useState<DeveloperDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const loadDiagnostics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<DeveloperDiagnostics>('/api/developer/diagnostics');
      setDiagnostics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load developer diagnostics.');
      setDiagnostics(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !hasDeveloperAccess) {
      setLoading(false);
      return;
    }
    void loadDiagnostics();
  }, [user, hasDeveloperAccess, loadDiagnostics]);

  const handleDownloadZip = async () => {
    setDownloading(true);
    setError(null);
    try {
      const token = (await auth?.currentUser?.getIdToken()) || getStoredToken();
      if (!token) {
        throw new Error('Authentication token missing. Please sign in again.');
      }
      const res = await fetch('/api/export/zip', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const isJson = res.headers.get('content-type')?.includes('application/json');
        const payload = isJson ? ((await res.json()) as { error?: string }) : null;
        throw new Error(payload?.error || `Source export denied (HTTP ${res.status}).`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'CivicSense_AI_Complete_Project.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export project archive.');
    } finally {
      setDownloading(false);
    }
  };

  if (!user || !hasDeveloperAccess) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-14">
        <div className="bg-white border border-red-200 rounded-xl p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-700 mx-auto">
            <Lock className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-display font-bold text-[#0B3B2E]">Access Denied</h1>
          <p className="text-sm text-neutral-600 leading-relaxed">
            The Developer Console and source code export utilities are restricted to explicitly authorized platform owners and system maintainer accounts.
          </p>
        </div>
      </div>
    );
  }

  const endpoints = [
    { method: 'GET', path: '/api/auth/me', auth: 'Authenticated', desc: 'Verify Firebase ID token, resolve Firestore role, and compute developer capabilities' },
    { method: 'POST', path: '/api/uploads', auth: 'Authenticated', desc: 'Upload confirmed citizen evidence image to /uploads/' },
    { method: 'POST', path: '/api/ai/analyze-image', auth: 'Authenticated', desc: 'Gemini multimodal vision inspection of uploaded photo (relevance, severity, evidence)' },
    { method: 'POST', path: '/api/ai/analyze', auth: 'Optional / Scoped', desc: 'Combined classification, priority, department routing & scoped duplicate check' },
    { method: 'POST', path: '/api/ai/classify', auth: 'Public / Helper', desc: 'Classify complaint text via FastAPI ML_SERVICE_URL or baseline heuristic' },
    { method: 'POST', path: '/api/ai/priority', auth: 'Public / Helper', desc: 'Estimate complaint priority with transparent explanation' },
    { method: 'POST', path: '/api/ai/duplicate-check', auth: 'Citizen / Authority / Admin', desc: 'Spatial Haversine + lexical Jaccard duplicate scan scoped to caller permissions' },
    { method: 'POST', path: '/api/ai/route', auth: 'Public / Helper', desc: 'Recommend responsible municipal department' },
    { method: 'GET', path: '/api/ai/status', auth: 'Authenticated', desc: 'Inspect ML service reachability, Gemini vision readiness, and active mode' },
    { method: 'GET/POST', path: '/api/complaints', auth: 'Citizen / Authority / Admin', desc: 'Cloud Firestore complaint REST API with role and department/ward scoping' },
    { method: 'PATCH', path: '/api/complaints/:id/status', auth: 'Authority (Scoped) / Admin', desc: 'Status transition, audit log & citizen notification' },
    { method: 'PATCH', path: '/api/complaints/:id/assign', auth: 'Authority (Scoped) / Admin', desc: 'Department & officer assignment + GIS marker synchronization' },
    { method: 'GET', path: '/api/gis/complaints', auth: 'Authority (Scoped) / Admin', desc: 'Sanitized WGS84 markers from Firestore filtered by category/priority/ward' },
    { method: 'GET', path: '/api/analytics/overview', auth: 'Authority (Scoped) / Admin', desc: 'Live category, ward, department, and daily trend metrics' },
    { method: 'GET/PATCH', path: '/api/admin/*', auth: 'Admin (Scoped exceptions)', desc: 'User roles, department/ward provisioning, duplicate review, and audit logs' },
    { method: 'GET/POST', path: '/api/authority-applications/*', auth: 'Authenticated / Owner', desc: 'Submit authority verification request, upload private verification doc, sync Firebase emailVerified' },
    { method: 'GET/POST/PATCH', path: '/api/admin/authority-applications/*', auth: 'Admin Only', desc: 'Approve, reject with reason, suspend, or reassign municipal authority requests' },
    { method: 'GET', path: '/api/developer/diagnostics', auth: 'Platform Owner / System', desc: 'Sanitized runtime, Firebase, ML service, and storage diagnostics' },
    { method: 'GET', path: '/api/export/zip', auth: 'Platform Owner / System', desc: 'Authenticated download of CivicSense_AI_Complete_Project.zip (secrets excluded)' },
  ];

  const envVars = [
    {
      name: 'PORT / NODE_ENV / APP_URL',
      status: 'Required (Defaults Provided)',
      notes: 'Server port (3000), runtime mode, and public URL. Never embeds credentials.',
    },
    {
      name: 'GEMINI_API_KEY',
      status: 'Server-Side AI Vision',
      notes: 'Used exclusively by /api/ai/analyze-image (@google/genai) to inspect citizen grievance photographs.',
    },
    {
      name: 'ML_SERVICE_URL',
      status: 'Optional',
      notes: 'Base URL of the standalone Python FastAPI ML service. Baseline rule classifier remains active when unset.',
    },
    {
      name: 'DEVELOPER_ALLOWLIST_EMAILS / DEVELOPER_ALLOWLIST_UIDS',
      status: 'Optional',
      notes: 'Comma-separated verified maintainer emails or Firebase UIDs granted access to /developer and /api/export/zip.',
    },
    {
      name: 'SMTP_* / SMS_WEBHOOK_URL',
      status: 'Optional',
      notes: 'Not required to run. In-app notifications persist directly in Cloud Firestore (/notifications).',
    },
    {
      name: 'JWT_SECRET / AUTH_SECRET / DEMO_MODE / DATABASE_URL',
      status: 'Unnecessary',
      notes: 'Replaced by Firebase Authentication ID tokens and Cloud Firestore security rules.',
    },
  ];

  return (
    <div className="max-w-[1380px] mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header & Authenticated ZIP Export */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-neutral-200 rounded-xl p-6">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <ShieldCheck className="w-3.5 h-3.5" />
            Protected Platform Maintainer Workspace · Verified Account: {user.displayName}
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#0B3B2E] mt-1">
            Developer Console & Technical Reference
          </h1>
          <p className="text-xs text-neutral-600 mt-1">
            Isolated from municipal governance dashboards. Server-side authorization is enforced on diagnostics and source ZIP exports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => void loadDiagnostics()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium bg-white border border-neutral-300 text-[#0B3B2E] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Diagnostics
          </button>
          <button
            type="button"
            onClick={() => void handleDownloadZip()}
            disabled={downloading}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-[#0B3B2E] text-white rounded-lg hover:bg-[#114B3B] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            <Download className="w-4 h-4" />
            {downloading ? 'Preparing Archive...' : 'Export Source ZIP'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl">
          {error}
        </div>
      )}

      {/* System Architecture Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-[#0B3B2E]">
            <Server className="w-4 h-4 text-emerald-700" />
            System Architecture
          </div>
          <p className="text-xs text-neutral-600 leading-relaxed">
            React 19 + Vite SPA frontend paired with an Express REST RBAC gateway (`server.ts`). Protected routes verify Firebase ID tokens via Identity Toolkit and enforce Firestore role + department/ward scoping.
          </p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-[#0B3B2E]">
            <Database className="w-4 h-4 text-emerald-700" />
            Firebase & Firestore Integration
          </div>
          <p className="text-xs text-neutral-600 leading-relaxed">
            Project:{' '}
            <span className="font-mono font-semibold text-[#0B3B2E]">
              {diagnostics?.firebase.projectId || 'Loading...'}
            </span>
            <br />
            Database:{' '}
            <span className="font-mono text-[#0B3B2E]">
              {diagnostics?.firebase.firestoreDatabaseId || 'Loading...'}
            </span>
            <br />
            Rules & Blueprint:{' '}
            <span className="font-medium">
              {diagnostics?.firebase.rulesFilePresent && diagnostics?.firebase.blueprintPresent
                ? 'Present & Enforced'
                : 'Checking...'}
            </span>
          </p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-[#0B3B2E]">
            <Cpu className="w-4 h-4 text-emerald-700" />
            ML Service Configuration
          </div>
          <p className="text-xs text-neutral-600 leading-relaxed">
            Mode:{' '}
            <span className="font-mono font-semibold text-[#0B3B2E]">
              {diagnostics?.mlService.activeMode || 'checking...'}
            </span>
            <br />
            FastAPI Reachable:{' '}
            <span className="font-semibold">
              {diagnostics?.mlService.pythonServiceReachable ? 'Yes (Connected)' : 'No (Baseline Fallback Active)'}
            </span>
            <br />
            Optional `ML_SERVICE_URL` configured:{' '}
            <span className="font-mono">{diagnostics?.mlService.configured ? 'true' : 'false'}</span>
          </p>
        </div>
      </div>

      {/* Live System Diagnostics */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-2 font-display font-semibold text-[#0B3B2E]">
            <Activity className="w-4 h-4 text-emerald-700" />
            Live System Diagnostics (Sanitized — No Secrets Exposed)
          </div>
          <span className="text-xs font-mono text-neutral-500">
            {diagnostics ? `Refreshed ${new Date(diagnostics.generatedAt).toLocaleTimeString()}` : 'Loading...'}
          </span>
        </div>
        {loading && !diagnostics ? (
          <div className="p-6 text-sm text-neutral-500">Loading server diagnostics...</div>
        ) : diagnostics ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 text-xs">
            <div className="p-4 bg-[#F7F9F8] border border-neutral-200 rounded-lg">
              <div className="text-neutral-500">Runtime Mode</div>
              <div className="font-mono font-semibold text-[#0B3B2E] mt-1">
                {diagnostics.runtime.nodeEnv} ({diagnostics.runtime.nodeVersion})
              </div>
            </div>
            <div className="p-4 bg-[#F7F9F8] border border-neutral-200 rounded-lg">
              <div className="text-neutral-500">Server Uptime / Memory</div>
              <div className="font-mono font-semibold text-[#0B3B2E] mt-1">
                {diagnostics.runtime.uptimeSeconds}s · {diagnostics.runtime.memoryRssMb} MB RSS
              </div>
            </div>
            <div className="p-4 bg-[#F7F9F8] border border-neutral-200 rounded-lg">
              <div className="text-neutral-500">Firebase Integration</div>
              <div className="font-semibold text-emerald-800 mt-1">
                {diagnostics.firebase.configured ? 'Configured & Active' : 'Incomplete Config'}
              </div>
            </div>
            <div className="p-4 bg-[#F7F9F8] border border-neutral-200 rounded-lg">
              <div className="text-neutral-500">Uploads Storage & Hooks</div>
              <div className="font-mono text-[#0B3B2E] mt-1">
                {diagnostics.storage.uploadCount} files · SMTP:{' '}
                {diagnostics.notifications.smtpConfigured ? 'on' : 'off'} · SMS:{' '}
                {diagnostics.notifications.smsConfigured ? 'on' : 'off'}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Environment Configuration Reference */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-200 font-display font-semibold text-[#0B3B2E]">
          Environment Configuration Reference
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#F7F9F8] border-b border-neutral-200 text-neutral-600">
                <th className="py-3 px-4 font-semibold">Variable(s)</th>
                <th className="py-3 px-4 font-semibold">Requirement</th>
                <th className="py-3 px-4 font-semibold">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {envVars.map((item) => (
                <tr key={item.name} className="hover:bg-neutral-50">
                  <td className="py-2.5 px-4 font-mono font-semibold text-[#0B3B2E]">{item.name}</td>
                  <td className="py-2.5 px-4 font-medium text-emerald-800 whitespace-nowrap">{item.status}</td>
                  <td className="py-2.5 px-4 text-neutral-600">{item.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Backend REST API Documentation */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-200 font-display font-semibold text-[#0B3B2E]">
          Backend API Documentation & Authorization Matrix
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#F7F9F8] border-b border-neutral-200 text-neutral-600">
                <th className="py-3 px-4 font-semibold">Method</th>
                <th className="py-3 px-4 font-semibold">Endpoint</th>
                <th className="py-3 px-4 font-semibold">Authorization</th>
                <th className="py-3 px-4 font-semibold">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {endpoints.map((ep) => (
                <tr key={`${ep.method}-${ep.path}`} className="hover:bg-neutral-50">
                  <td className="py-2.5 px-4 font-mono font-semibold text-emerald-800 whitespace-nowrap">{ep.method}</td>
                  <td className="py-2.5 px-4 font-mono text-[#0B3B2E] whitespace-nowrap">{ep.path}</td>
                  <td className="py-2.5 px-4 font-medium text-neutral-700 whitespace-nowrap">{ep.auth}</td>
                  <td className="py-2.5 px-4 text-neutral-600">{ep.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
