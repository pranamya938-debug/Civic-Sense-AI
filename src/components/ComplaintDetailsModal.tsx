import React, { useEffect, useState } from 'react';
import { Check, Cpu, MapPin, X } from 'lucide-react';
import {
  COMPLAINT_STATUSES,
  ComplaintPriority,
  ComplaintRecord,
  ComplaintStatus,
  ComplaintUpdate,
  Department,
  UserProfile,
} from '../shared/types';
import {
  assignComplaintInFirestore,
  subscribeComplaintUpdates,
  updateComplaintStatusInFirestore,
} from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { PriorityBadge, StatusBadge } from './StatusBadge';
import { GisMap } from './GisMap';

interface ComplaintDetailsModalProps {
  complaint: ComplaintRecord | null;
  departments: Department[];
  authorities?: UserProfile[];
  onClose: () => void;
  onUpdated: () => void;
}

const TIMELINE_STEPS: ComplaintStatus[] = [
  'Submitted',
  'Under Review',
  'Assigned',
  'In Progress',
  'Resolved',
];

export const ComplaintDetailsModal: React.FC<ComplaintDetailsModalProps> = ({
  complaint,
  departments,
  authorities = [],
  onClose,
  onUpdated,
}) => {
  const { user } = useAuth();
  const [updates, setUpdates] = useState<ComplaintUpdate[]>([]);
  const [status, setStatus] = useState<ComplaintStatus>('Submitted');
  const [priority, setPriority] = useState<ComplaintPriority>('Medium');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [authorityId, setAuthorityId] = useState<string>('');
  const [remarks, setRemarks] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!complaint || !user?.uid) return;
    setStatus(complaint.status);
    setPriority(complaint.priority);
    setDepartmentId(complaint.assignedDepartmentId || departments[0]?.id || '');
    setAuthorityId(complaint.assignedAuthorityId || '');
    setResolutionNotes(complaint.resolutionNotes || '');
    setRemarks('');
    setError(null);

    const unsub = subscribeComplaintUpdates(complaint.id, setUpdates);
    return () => unsub();
  }, [complaint, departments, user?.uid]);

  if (!complaint) return null;

  const isStaff = user?.role === 'authority' || user?.role === 'admin';
  const currentStepIdx = TIMELINE_STEPS.indexOf(complaint.status);

  const handleAssign = async () => {
    if (!user) return;
    const dept = departments.find((d) => d.id === departmentId);
    if (!dept) {
      setError('Select a valid municipal department.');
      return;
    }
    const chosenOfficer = authorities.find((a) => a.uid === authorityId);
    setSaving(true);
    setError(null);
    try {
      await assignComplaintInFirestore({
        complaint,
        department: dept,
        officerUid: chosenOfficer?.uid || user.uid,
        officerName: chosenOfficer?.displayName || user.displayName,
        actor: user,
        remarks,
      });
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assignment failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await updateComplaintStatusInFirestore({
        complaint,
        status,
        priority,
        remarks,
        resolutionNotes,
        actor: user,
      });
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status update failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-neutral-200 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-neutral-200 px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-neutral-500">
              <span>{complaint.id}</span>
              <span aria-hidden="true">·</span>
              <span>{complaint.category}</span>
            </div>
            <h2 className="text-xl font-display font-semibold text-[#0B3B2E] mt-1">{complaint.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-500 hover:text-neutral-900 rounded-lg hover:bg-neutral-100 cursor-pointer"
            aria-label="Close complaint details"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={complaint.status} />
            <PriorityBadge priority={complaint.priority} />
            <span className="text-xs text-neutral-500 font-mono tabular-nums">
              Logged {new Date(complaint.createdAt).toLocaleString()} by {complaint.citizenName}
            </span>
          </div>

          <div className="bg-[#F7F9F8] border border-neutral-200 rounded-xl p-4">
            <div className="text-xs font-medium text-neutral-600 mb-3">Resolution Progress Timeline</div>
            {complaint.status === 'Rejected' ? (
              <div className="text-sm font-medium text-red-700">
                This grievance has been marked as Rejected. See timeline remarks below.
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-2">
                {TIMELINE_STEPS.map((step, idx) => {
                  const done = currentStepIdx >= idx;
                  const active = complaint.status === step;
                  return (
                    <div key={step} className="flex flex-col items-center text-center">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border ${
                          done
                            ? 'bg-[#0B3B2E] text-white border-[#0B3B2E]'
                            : 'bg-white text-neutral-400 border-neutral-300'
                        } ${active ? 'ring-2 ring-emerald-500 ring-offset-1' : ''}`}
                      >
                        {done ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                      </div>
                      <span
                        className={`text-[11px] mt-1.5 leading-tight ${
                          done ? 'text-[#0B3B2E] font-semibold' : 'text-neutral-500'
                        }`}
                      >
                        {step}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-neutral-500 mb-1">Citizen Description</h4>
                <p className="text-sm text-neutral-800 leading-relaxed">{complaint.description}</p>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-neutral-500 mb-1">Location & Ward</h4>
                <p className="text-sm text-neutral-800 flex items-start gap-1.5">
                  <MapPin className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <span>
                    {complaint.address} ({complaint.latitude.toFixed(4)}, {complaint.longitude.toFixed(4)})
                  </span>
                </p>
              </div>

              {complaint.resolutionNotes && (
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3">
                  <div className="text-xs font-semibold text-[#0B3B2E]">Official Resolution Remarks</div>
                  <p className="text-xs text-neutral-700 mt-1">{complaint.resolutionNotes}</p>
                </div>
              )}

              {complaint.photoUrl && (
                <div>
                  <h4 className="text-xs font-semibold text-neutral-500 mb-1.5">Attached Photograph</h4>
                  <div className="rounded-lg overflow-hidden border border-neutral-200 h-44 bg-neutral-100">
                    <img
                      src={complaint.photoUrl}
                      alt={complaint.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}

              <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-4 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0B3B2E]">
                    <Cpu className="w-3.5 h-3.5 text-emerald-700" />
                    {complaint.aiPrediction.modelLabel}
                  </span>
                  {complaint.aiPrediction.modelSource !== 'python-fastapi-ml-service' && (
                    <span className="px-2 py-0.5 text-[11px] font-medium bg-amber-100 text-amber-900 border border-amber-200 rounded">
                      Baseline Classifier (ML Service Offline)
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-700 leading-relaxed">
                  {complaint.aiPrediction.explanation}
                </p>
                <div className="text-xs text-neutral-600">
                  Assigned / Recommended Department:{' '}
                  <span className="font-semibold text-[#0B3B2E]">
                    {complaint.aiPrediction.recommendedDepartmentName}
                  </span>
                </div>
              </div>

              {(complaint.aiImageDescription || complaint.aiDetectedProblem) && (
                <div className="bg-[#F7F9F8] border border-emerald-200 rounded-lg p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#0B3B2E]">
                      Gemini Multimodal Visual Inspection
                    </span>
                    {complaint.aiImageSeverity && (
                      <span className="px-2 py-0.5 text-[11px] font-medium bg-white border border-neutral-300 rounded text-[#0B3B2E]">
                        Visual Severity: {complaint.aiImageSeverity}
                      </span>
                    )}
                  </div>
                  {complaint.aiDetectedProblem && (
                    <div className="text-xs text-neutral-800">
                      <span className="font-semibold">Detected Issue:</span> {complaint.aiDetectedProblem}
                      {complaint.aiDetectedCategory ? ` (${complaint.aiDetectedCategory})` : ''}
                    </div>
                  )}
                  {complaint.aiImageDescription && (
                    <p className="text-xs text-neutral-700 leading-relaxed">
                      {complaint.aiImageDescription}
                    </p>
                  )}
                  {complaint.aiVisibleEvidence && complaint.aiVisibleEvidence.length > 0 && (
                    <ul className="text-[11px] text-neutral-600 list-disc pl-4 space-y-0.5">
                      {complaint.aiVisibleEvidence.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  )}
                  {complaint.aiAnalyzedAt && (
                    <div className="text-[11px] font-mono text-neutral-500">
                      Inspected {new Date(complaint.aiAnalyzedAt).toLocaleString()}
                      {complaint.citizenConfirmedCategory ? ' · Category confirmed by citizen' : ''}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <GisMap
                complaints={[complaint]}
                heightClass="h-[220px]"
                selectedId={complaint.id}
              />

              <div>
                <h4 className="text-xs font-semibold text-neutral-500 mb-2">Status & Officer Activity History</h4>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {updates.length === 0 ? (
                    <div className="text-xs text-neutral-500">Initial submission recorded in Cloud Firestore.</div>
                  ) : (
                    updates.map((u) => (
                      <div key={u.id} className="border border-neutral-200 rounded-lg p-3 text-xs">
                        <div className="flex items-center justify-between gap-2 font-semibold text-[#0B3B2E]">
                          <span>{u.newStatus}</span>
                          <span className="font-mono font-normal text-neutral-500 tabular-nums">
                            {new Date(u.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-neutral-700 mt-1">{u.remarks}</p>
                        <div className="text-[11px] text-neutral-500 mt-1">
                          Updated by {u.actorName} ({u.actorRole})
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {isStaff && (
            <div className="border-t border-neutral-200 pt-5 space-y-4">
              <h3 className="text-sm font-semibold text-[#0B3B2E]">
                Municipal Authority & Administrator Actions
              </h3>
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg">
                  {error}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3 bg-[#F7F9F8] border border-neutral-200 rounded-xl p-4">
                  <div className="text-xs font-semibold text-[#0B3B2E]">Assign Department & Officer</div>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-neutral-300 rounded-lg"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                  {authorities.length > 0 && (
                    <select
                      value={authorityId}
                      onChange={(e) => setAuthorityId(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-neutral-300 rounded-lg"
                    >
                      <option value="">Assign to Current Officer</option>
                      {authorities.map((a) => (
                        <option key={a.uid} value={a.uid}>
                          {a.displayName}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleAssign()}
                    className="w-full px-4 py-2 text-xs font-medium bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
                  >
                    Assign Complaint
                  </button>
                </div>

                <div className="space-y-3 bg-[#F7F9F8] border border-neutral-200 rounded-xl p-4">
                  <div className="text-xs font-semibold text-[#0B3B2E]">Update Operational Status</div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as ComplaintStatus)}
                      className="px-3 py-2 text-sm bg-white border border-neutral-300 rounded-lg"
                    >
                      {COMPLAINT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as ComplaintPriority)}
                      className="px-3 py-2 text-sm bg-white border border-neutral-300 rounded-lg"
                    >
                      {(['Low', 'Medium', 'High', 'Critical'] as ComplaintPriority[]).map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="text"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Internal remarks or inspection note..."
                    className="w-full px-3 py-2 text-sm bg-white border border-neutral-300 rounded-lg"
                  />
                  <input
                    type="text"
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Resolution details (shown to citizen)..."
                    className="w-full px-3 py-2 text-sm bg-white border border-neutral-300 rounded-lg"
                  />
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleStatusUpdate()}
                    className="w-full px-4 py-2 text-xs font-medium bg-[#0B3B2E] text-white rounded-lg hover:bg-[#114B3B] disabled:opacity-60 cursor-pointer"
                  >
                    Save Status & Notify Citizen
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
