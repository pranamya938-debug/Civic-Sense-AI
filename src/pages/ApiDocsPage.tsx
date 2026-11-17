import React, { useEffect, useState } from 'react';
import { Cpu, Database, Download, Server } from 'lucide-react';
import { apiRequest } from '../services/apiClient';

export const ApiDocsPage: React.FC = () => {
  const [aiStatus, setAiStatus] = useState<{
    configuredUrl: string | null;
    pythonServiceReachable: boolean;
    activeMode: string;
    limitationNotice?: string | null;
  } | null>(null);

  useEffect(() => {
    apiRequest<{
      configuredUrl: string | null;
      pythonServiceReachable: boolean;
      activeMode: string;
      limitationNotice?: string | null;
    }>('/api/ai/status')
      .then(setAiStatus)
      .catch(() => setAiStatus(null));
  }, []);

  const endpoints = [
    { method: 'GET', path: '/api/auth/me', desc: 'Verify Firebase ID token & resolve Firestore user role' },
    { method: 'POST', path: '/api/uploads', desc: 'Upload authenticated citizen evidence image to /uploads/' },
    { method: 'POST', path: '/api/ai/analyze', desc: 'Combined classification, priority, department routing & duplicate check' },
    { method: 'POST', path: '/api/ai/classify', desc: 'Classify complaint text via FastAPI ML_SERVICE_URL or baseline heuristic' },
    { method: 'POST', path: '/api/ai/priority', desc: 'Estimate complaint priority with transparent explanation' },
    { method: 'POST', path: '/api/ai/duplicate-check', desc: 'Spatial Haversine + lexical Jaccard duplicate scan against Firestore markers' },
    { method: 'POST', path: '/api/ai/route', desc: 'Recommend responsible municipal department' },
    { method: 'GET/POST', path: '/api/complaints', desc: 'Cloud Firestore complaint REST API with Firebase ID token enforcement' },
    { method: 'PATCH', path: '/api/complaints/:id/status', desc: 'Authority/Admin status transition + citizen notification' },
    { method: 'PATCH', path: '/api/complaints/:id/assign', desc: 'Authority/Admin department & officer assignment' },
    { method: 'GET', path: '/api/gis/complaints', desc: 'Sanitized WGS84 markers from Firestore filtered by category/priority/ward' },
    { method: 'GET', path: '/api/analytics/overview', desc: 'Live category, ward, department, and daily trend metrics' },
    { method: 'GET', path: '/api/export/zip', desc: 'Download CivicSense_AI_Complete_Project.zip source archive' },
  ];

  const envVars = [
    {
      name: 'PORT / NODE_ENV / APP_URL',
      status: 'Required (Defaults Provided)',
      notes: 'Server port (3000), runtime mode, and public URL. Firebase credentials load from firebase-applet-config.json.',
    },
    {
      name: 'ML_SERVICE_URL',
      status: 'Optional',
      notes: 'URL of the Python FastAPI ML service. When unset, baseline rule classifier is clearly flagged as active.',
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
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-neutral-200 rounded-xl p-6">
        <div>
          <div className="text-xs font-medium text-emerald-700">Administrator & Developer Utilities</div>
          <h2 className="text-xl font-display font-bold text-[#0B3B2E] mt-1">
            System Architecture, Environment Reference & Source Export
          </h2>
        </div>
        <a
          href="/api/export/zip"
          download="CivicSense_AI_Complete_Project.zip"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-[#0B3B2E] text-white rounded-lg hover:bg-[#114B3B] transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" />
          Download CivicSense_AI_Complete_Project.zip
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-[#0B3B2E]">
            <Cpu className="w-4 h-4 text-emerald-700" />
            Python FastAPI ML Layer
          </div>
          <p className="text-xs text-neutral-600 leading-relaxed">
            Active mode: <span className="font-mono font-semibold">{aiStatus?.activeMode || 'checking...'}</span>. Configure{' '}
            <span className="font-mono">ML_SERVICE_URL</span> to route predictions to the Python FastAPI service inside{' '}
            <span className="font-mono">ml-service/</span>.
          </p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-[#0B3B2E]">
            <Database className="w-4 h-4 text-emerald-700" />
            Cloud Firestore & Firebase Auth
          </div>
          <p className="text-xs text-neutral-600 leading-relaxed">
            All users, grievances, timeline updates, GIS markers, duplicate reviews, notifications, and audit logs persist in Cloud Firestore under deployed <span className="font-mono">firestore.rules</span>.
          </p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-[#0B3B2E]">
            <Server className="w-4 h-4 text-emerald-700" />
            Server-Side Authorization
          </div>
          <p className="text-xs text-neutral-600 leading-relaxed">
            Protected Express routes verify Firebase ID tokens via Identity Toolkit and enforce Citizen, Authority, and Admin roles from Firestore.
          </p>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-200 font-display font-semibold text-[#0B3B2E]">
          Environment Variables Configuration Reference
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

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-200 font-display font-semibold text-[#0B3B2E]">
          REST API Endpoints
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#F7F9F8] border-b border-neutral-200 text-neutral-600">
                <th className="py-3 px-4 font-semibold">Method</th>
                <th className="py-3 px-4 font-semibold">Endpoint</th>
                <th className="py-3 px-4 font-semibold">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {endpoints.map((ep) => (
                <tr key={`${ep.method}-${ep.path}`} className="hover:bg-neutral-50">
                  <td className="py-2.5 px-4 font-mono font-semibold text-emerald-800">{ep.method}</td>
                  <td className="py-2.5 px-4 font-mono text-[#0B3B2E]">{ep.path}</td>
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
