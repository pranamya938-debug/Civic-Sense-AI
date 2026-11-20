import { Router } from 'express';
import {
  AuthenticatedRequest,
  isAuthorityAuthorizedForComplaint,
  loadRoleScopedCollectionDocs,
  requireAuth,
  requireRole,
} from '../middleware/authMiddleware.ts';
import {
  firestoreCommitBatch,
  firestoreGetDoc,
  firestoreListCollection,
} from '../services/firestoreRestService.ts';
import { mlService } from '../services/mlService.ts';
import { haversineMeters } from '../services/baselineClassifier.ts';
import { MUNICIPAL_DEPARTMENTS, MUNICIPAL_WARDS } from '../../shared/catalog.ts';
import {
  CIVIC_CATEGORIES,
  COMPLAINT_STATUSES,
  CivicCategory,
  ComplaintPriority,
  ComplaintRecord,
  ComplaintStatus,
  ComplaintUpdate,
  Department,
  ImageQuality,
  Ward,
} from '../../shared/types.ts';

export const complaintRoutes = Router();

interface RawComplaintDoc {
  id: string;
  citizenId: string;
  citizenName: string;
  title: string;
  description: string;
  category: CivicCategory;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  photoUrl?: string;
  latitude: number;
  longitude: number;
  address: string;
  wardId?: string;
  assignedDepartmentId?: string;
  assignedAuthorityId?: string;
  assignedAuthorityName?: string;
  resolutionNotes?: string;
  aiSource?: string;
  aiLabel?: string;
  aiExplanation?: string;
  aiDetectedCategory?: string;
  aiDetectedProblem?: string;
  aiImageDescription?: string;
  aiImageSeverity?: ComplaintPriority;
  aiSuggestedDepartment?: string;
  aiAnalyzedAt?: string;
  aiImageQuality?: ImageQuality;
  aiVisibleEvidence?: string[];
  citizenConfirmedCategory?: boolean;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

function hydrateComplaint(raw: RawComplaintDoc, departments: Department[]): ComplaintRecord {
  const dept = departments.find((d) => d.id === raw.assignedDepartmentId);
  return {
    id: raw.id,
    citizenId: raw.citizenId,
    citizenName: raw.citizenName,
    title: raw.title,
    description: raw.description,
    category: raw.category,
    priority: raw.priority,
    status: raw.status,
    photoUrl: raw.photoUrl,
    latitude: Number(raw.latitude),
    longitude: Number(raw.longitude),
    address: raw.address,
    wardId: raw.wardId || 'ward_14',
    assignedDepartmentId: raw.assignedDepartmentId,
    assignedAuthorityId: raw.assignedAuthorityId,
    assignedAuthorityName: raw.assignedAuthorityName,
    resolutionNotes: raw.resolutionNotes,
    aiPrediction: {
      predictedCategory: raw.category,
      predictedPriority: raw.priority,
      recommendedDepartmentId: raw.assignedDepartmentId || 'dept_general',
      recommendedDepartmentName: dept?.name || 'General Municipal Grievance Cell',
      modelSource:
        raw.aiSource === 'python-fastapi-ml-service'
          ? 'python-fastapi-ml-service'
          : 'demonstration-baseline-classifier',
      modelLabel: raw.aiLabel || 'Baseline Classifier',
      matchedKeywords: [],
      explanation: raw.aiExplanation || '',
    },
    aiDetectedCategory: raw.aiDetectedCategory,
    aiDetectedProblem: raw.aiDetectedProblem,
    aiImageDescription: raw.aiImageDescription,
    aiImageSeverity: raw.aiImageSeverity,
    aiSuggestedDepartment: raw.aiSuggestedDepartment,
    aiAnalyzedAt: raw.aiAnalyzedAt,
    aiImageQuality: raw.aiImageQuality,
    aiVisibleEvidence: raw.aiVisibleEvidence,
    citizenConfirmedCategory: raw.citizenConfirmedCategory,
    potentialDuplicates: [],
    isDemoData: false,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    resolvedAt: raw.resolvedAt,
  };
}

function inferNearestWard(lat: number, lng: number, wards: Ward[]): string {
  const activeWards = wards.filter((w) => w.active !== false);
  if (activeWards.length === 0) return 'ward_14';
  let best = activeWards[0];
  let bestDist = Infinity;
  for (const w of activeWards) {
    const d = haversineMeters(lat, lng, w.centerLat, w.centerLng);
    if (d < bestDist) {
      bestDist = d;
      best = w;
    }
  }
  return best.id;
}

complaintRoutes.get(
  '/',
  requireAuth,
  requireRole('citizen', 'authority', 'admin'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const token = req.firebaseIdToken!;
      const { status, category, priority, wardId, search, mineOnly } = req.query as Record<string, string>;

      const [rawComplaints, fsDepts] = await Promise.all([
        req.user!.role === 'citizen' || mineOnly === 'true'
          ? firestoreListCollection<RawComplaintDoc>('complaints', token, 300, {
              field: 'citizenId',
              op: 'EQUAL',
              value: req.user!.uid,
            })
          : loadRoleScopedCollectionDocs<RawComplaintDoc>('complaints', req.user!, token, 300),
        firestoreListCollection<Department>('departments', token, 100, {
          field: 'active',
          op: 'EQUAL',
          value: true,
        }),
      ]);
      const departments = fsDepts.length > 0 ? fsDepts : MUNICIPAL_DEPARTMENTS;

      let list = rawComplaints.map((r) => hydrateComplaint(r, departments));

      if (req.user!.role === 'citizen' || mineOnly === 'true') {
        list = list.filter((c) => c.citizenId === req.user!.uid);
      }
      if (status && status !== 'All') list = list.filter((c) => c.status === status);
      if (category && category !== 'All') list = list.filter((c) => c.category === category);
      if (priority && priority !== 'All') list = list.filter((c) => c.priority === priority);
      if (wardId && wardId !== 'All') list = list.filter((c) => c.wardId === wardId);
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        list = list.filter(
          (c) =>
            c.id.toLowerCase().includes(q) ||
            c.title.toLowerCase().includes(q) ||
            c.address.toLowerCase().includes(q) ||
            c.description.toLowerCase().includes(q)
        );
      }

      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json({ complaints: list });
    } catch (err) {
      next(err);
    }
  }
);

complaintRoutes.get(
  '/:id',
  requireAuth,
  requireRole('citizen', 'authority', 'admin'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const token = req.firebaseIdToken!;
      const [raw, fsDepts] = await Promise.all([
        firestoreGetDoc<RawComplaintDoc>(`complaints/${req.params.id}`, token),
        firestoreListCollection<Department>('departments', token, 100, {
          field: 'active',
          op: 'EQUAL',
          value: true,
        }),
      ]);

      if (!raw) {
        res.status(404).json({ error: 'Complaint not found.' });
        return;
      }
      if (req.user!.role === 'citizen' && raw.citizenId !== req.user!.uid) {
        res.status(403).json({ error: 'Access denied. Citizens can only access their own complaints.' });
        return;
      }
      if (req.user!.role === 'authority' && !isAuthorityAuthorizedForComplaint(req.user!, raw)) {
        res.status(403).json({ error: 'Access denied. Complaint is outside your authorized department or ward.' });
        return;
      }
      const updates = await firestoreListCollection<ComplaintUpdate>(
        `complaints/${req.params.id}/updates`,
        token,
        100
      );
      const departments = fsDepts.length > 0 ? fsDepts : MUNICIPAL_DEPARTMENTS;
      updates.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      res.json({ complaint: hydrateComplaint(raw, departments), updates });
    } catch (err) {
      next(err);
    }
  }
);

complaintRoutes.get(
  '/:id/updates',
  requireAuth,
  requireRole('citizen', 'authority', 'admin'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const token = req.firebaseIdToken!;
      const raw = await firestoreGetDoc<RawComplaintDoc>(`complaints/${req.params.id}`, token);
      if (!raw) {
        res.status(404).json({ error: 'Complaint not found.' });
        return;
      }
      if (req.user!.role === 'citizen' && raw.citizenId !== req.user!.uid) {
        res.status(403).json({ error: 'Access denied. Citizens can only access their own complaints.' });
        return;
      }
      if (req.user!.role === 'authority' && !isAuthorityAuthorizedForComplaint(req.user!, raw)) {
        res.status(403).json({ error: 'Access denied. Complaint is outside your authorized department or ward.' });
        return;
      }
      const updates = await firestoreListCollection<ComplaintUpdate>(
        `complaints/${req.params.id}/updates`,
        token,
        100
      );
      updates.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      res.json({ updates });
    } catch (err) {
      next(err);
    }
  }
);

complaintRoutes.post(
  '/',
  requireAuth,
  requireRole('citizen', 'admin'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const token = req.firebaseIdToken!;
      const {
        title,
        description,
        category,
        photoUrl,
        latitude,
        longitude,
        address,
        wardId,
        useAiSuggestedCategory,
      } = req.body as {
        title?: string;
        description?: string;
        category?: string;
        photoUrl?: string;
        latitude?: number;
        longitude?: number;
        address?: string;
        wardId?: string;
        useAiSuggestedCategory?: boolean;
      };

      if (!title || title.trim().length < 4) {
        res.status(400).json({ error: 'Complaint title must be at least 4 characters.' });
        return;
      }
      if (!description || description.trim().length < 10) {
        res.status(400).json({ error: 'Detailed description must be at least 10 characters.' });
        return;
      }
      if (!address || address.trim().length < 3) {
        res.status(400).json({ error: 'Address or locality is required.' });
        return;
      }

      const lat = typeof latitude === 'number' && !Number.isNaN(latitude) ? latitude : 12.9784;
      const lng = typeof longitude === 'number' && !Number.isNaN(longitude) ? longitude : 77.6408;

      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        res.status(400).json({ error: 'Invalid GPS coordinates.' });
        return;
      }

      if (photoUrl && photoUrl.length > 500) {
        res.status(400).json({ error: 'Upload photograph via /api/uploads first so photoUrl is <= 500 chars.' });
        return;
      }

      const [fsWards, fsDepts, existingMarkers] = await Promise.all([
        firestoreListCollection<Ward>('wards', token, 100, {
          field: 'active',
          op: 'EQUAL',
          value: true,
        }),
        firestoreListCollection<Department>('departments', token, 100, {
          field: 'active',
          op: 'EQUAL',
          value: true,
        }),
        loadRoleScopedCollectionDocs<RawComplaintDoc>(
          req.user!.role === 'citizen' ? 'complaints' : 'gis_markers',
          req.user!,
          token,
          300
        ),
      ]);
      const wards = fsWards.length > 0 ? fsWards : MUNICIPAL_WARDS;
      const departments = fsDepts.length > 0 ? fsDepts : MUNICIPAL_DEPARTMENTS;

      const aiPrediction = await mlService.analyzeComplaint({
        title: title.trim(),
        description: description.trim(),
        category,
        latitude: lat,
        longitude: lng,
      });

      const resolvedCategory: CivicCategory =
        useAiSuggestedCategory || !category || !CIVIC_CATEGORIES.includes(category as CivicCategory)
          ? aiPrediction.predictedCategory
          : (category as CivicCategory);

      const existingHydrated = existingMarkers.map((m) => hydrateComplaint(m, departments));
    const dupResult = await mlService.checkDuplicates(
      {
        title: title.trim(),
        description: description.trim(),
        category: resolvedCategory,
        latitude: lat,
        longitude: lng,
      },
      existingHydrated
    );

    const id = `CS-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const resolvedWardId =
      wardId && wards.some((w) => w.id === wardId) ? wardId : inferNearestWard(lat, lng, wards);

    const complaintDoc: Record<string, unknown> = {
      id,
      citizenId: req.user!.uid,
      citizenName: req.user!.displayName.slice(0, 120),
      title: title.trim().slice(0, 160),
      description: description.trim().slice(0, 2000),
      category: resolvedCategory,
      priority: aiPrediction.predictedPriority,
      status: 'Submitted',
      latitude: lat,
      longitude: lng,
      address: address.trim().slice(0, 280),
      wardId: resolvedWardId,
      assignedDepartmentId: aiPrediction.recommendedDepartmentId,
      aiSource: aiPrediction.modelSource.slice(0, 80),
      aiLabel: aiPrediction.modelLabel.slice(0, 120),
      aiExplanation: aiPrediction.explanation.slice(0, 500),
    };
    if (photoUrl) complaintDoc.photoUrl = photoUrl.slice(0, 500);

    // Step 1: Create complaint document so exists() rules evaluate cleanly in step 2
    await firestoreCommitBatch(
      [
        {
          docPath: `complaints/${id}`,
          data: complaintDoc,
          serverTimestamps: ['createdAt', 'updatedAt'],
        },
      ],
      token
    );

    // Step 2: Create GIS marker, initial update, notification, and duplicate match records
    const updId = `upd_${Date.now()}`;
    const notifId = `notif_${Date.now()}`;
    const ops: Parameters<typeof firestoreCommitBatch>[0] = [
      {
        docPath: `gis_markers/${id}`,
        data: {
          id,
          title: complaintDoc.title,
          category: resolvedCategory,
          priority: aiPrediction.predictedPriority,
          status: 'Submitted',
          latitude: lat,
          longitude: lng,
          address: complaintDoc.address,
          wardId: resolvedWardId,
          assignedDepartmentId: aiPrediction.recommendedDepartmentId,
        },
        serverTimestamps: ['createdAt', 'updatedAt'],
      },
      {
        docPath: `complaints/${id}/updates/${updId}`,
        data: {
          id: updId,
          complaintId: id,
          complaintCitizenId: req.user!.uid,
          actorId: req.user!.uid,
          actorName: req.user!.displayName.slice(0, 120),
          actorRole: req.user!.role,
          newStatus: 'Submitted',
          remarks: `Submitted by ${req.user!.displayName}. Recommended department: ${aiPrediction.recommendedDepartmentName}.`,
        },
        serverTimestamps: ['createdAt'],
      },
      {
        docPath: `notifications/${notifId}`,
        data: {
          id: notifId,
          recipientId: req.user!.uid,
          complaintId: id,
          title: `Complaint ${id} Submitted`,
          message: `Classified under ${resolvedCategory} (${aiPrediction.predictedPriority} priority). Recommended dept: ${aiPrediction.recommendedDepartmentName}.`,
          type: 'submission',
          read: false,
        },
        serverTimestamps: ['createdAt'],
      },
    ];

    for (const cand of dupResult.candidates.slice(0, 2)) {
      const matchId = `dup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      ops.push({
        docPath: `duplicate_matches/${matchId}`,
        data: {
          id: matchId,
          sourceComplaintId: id,
          matchedComplaintId: cand.complaintId,
          sourceTitle: String(complaintDoc.title).slice(0, 160),
          matchedTitle: cand.title.slice(0, 160),
          similarityReason: cand.reason.slice(0, 300),
          distanceMeters: cand.distanceMeters,
          reviewStatus: 'pending_review',
        },
        serverTimestamps: ['createdAt'],
      });
    }

    await firestoreCommitBatch(ops, token);

    const saved = await firestoreGetDoc<RawComplaintDoc>(`complaints/${id}`, token);
    const hydrated = saved
      ? hydrateComplaint(saved, departments)
      : hydrateComplaint(
          {
            ...(complaintDoc as unknown as RawComplaintDoc),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          departments
        );
    hydrated.aiPrediction = aiPrediction;
    hydrated.potentialDuplicates = dupResult.candidates;

    res.status(201).json({ complaint: hydrated });
    } catch (err) {
      next(err);
    }
  }
);

complaintRoutes.patch(
  '/:id/status',
  requireAuth,
  requireRole('authority', 'admin'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const token = req.firebaseIdToken!;
      const { status, priority, remarks, resolutionNotes } = req.body as {
        status?: ComplaintStatus;
        priority?: ComplaintPriority;
        remarks?: string;
        resolutionNotes?: string;
      };

      const existing = await firestoreGetDoc<RawComplaintDoc>(`complaints/${req.params.id}`, token);
      if (!existing) {
        res.status(404).json({ error: 'Complaint not found.' });
        return;
      }
      if (req.user!.role === 'authority' && !isAuthorityAuthorizedForComplaint(req.user!, existing)) {
        res.status(403).json({
          error: 'Access denied. This complaint is outside your authorized department or ward.',
        });
        return;
      }

      if (status && !COMPLAINT_STATUSES.includes(status)) {
        res.status(400).json({ error: 'Invalid complaint status.' });
        return;
      }

      const previousStatus = existing.status;
      const nextStatus = status || existing.status;
      const nextPriority = priority || existing.priority;
      const remarkText =
        remarks?.trim() ||
        resolutionNotes?.trim() ||
        `Status updated from ${previousStatus} to ${nextStatus}.`;

      const patchData: Record<string, unknown> = {
        status: nextStatus,
        priority: nextPriority,
      };
      const mask = ['status', 'priority', 'updatedAt'];
      const serverTimestamps = ['updatedAt'];

      if (typeof resolutionNotes === 'string' && resolutionNotes.trim()) {
        patchData.resolutionNotes = resolutionNotes.trim().slice(0, 1000);
        mask.push('resolutionNotes');
      }
      if (nextStatus === 'Resolved') {
        mask.push('resolvedAt');
        serverTimestamps.push('resolvedAt');
      }

      const updId = `upd_${Date.now()}`;
      const auditId = `audit_${Date.now()}`;
      const notifId = `notif_${Date.now()}`;

      await firestoreCommitBatch(
        [
          {
            docPath: `complaints/${existing.id}`,
            data: patchData,
            updateMask: mask,
            serverTimestamps,
          },
          {
            docPath: `gis_markers/${existing.id}`,
            data: { status: nextStatus, priority: nextPriority },
            updateMask: ['status', 'priority', 'updatedAt'],
            serverTimestamps: ['updatedAt'],
          },
          {
            docPath: `complaints/${existing.id}/updates/${updId}`,
            data: {
              id: updId,
              complaintId: existing.id,
              complaintCitizenId: existing.citizenId,
              actorId: req.user!.uid,
              actorName: req.user!.displayName.slice(0, 120),
              actorRole: req.user!.role,
              previousStatus,
              newStatus: nextStatus,
              remarks: remarkText.slice(0, 1000),
            },
            serverTimestamps: ['createdAt'],
          },
          {
            docPath: `audit_logs/${auditId}`,
            data: {
              id: auditId,
              actorId: req.user!.uid,
              actorName: req.user!.displayName.slice(0, 120),
              actorRole: req.user!.role,
              action: 'COMPLAINT_STATUS_UPDATED',
              targetType: 'complaint',
              targetId: existing.id,
              details: `${previousStatus} -> ${nextStatus}: ${remarkText.slice(0, 200)}`,
            },
            serverTimestamps: ['createdAt'],
          },
          {
            docPath: `notifications/${notifId}`,
            data: {
              id: notifId,
              recipientId: existing.citizenId,
              complaintId: existing.id,
              title: `${existing.id} is now ${nextStatus}`,
              message: remarkText.slice(0, 380),
              type: nextStatus === 'Resolved' ? 'resolution' : 'status',
              read: false,
            },
            serverTimestamps: ['createdAt'],
          },
        ],
        token
      );

      const updated = await firestoreGetDoc<RawComplaintDoc>(`complaints/${existing.id}`, token);
      res.json({ complaint: updated ? hydrateComplaint(updated, MUNICIPAL_DEPARTMENTS) : existing });
    } catch (err) {
      next(err);
    }
  }
);

complaintRoutes.patch(
  '/:id/assign',
  requireAuth,
  requireRole('authority', 'admin'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const token = req.firebaseIdToken!;
      const { departmentId, authorityId, remarks } = req.body as {
        departmentId?: string;
        authorityId?: string;
        remarks?: string;
      };

      const [existing, fsDepts] = await Promise.all([
        firestoreGetDoc<RawComplaintDoc>(`complaints/${req.params.id}`, token),
        firestoreListCollection<Department>('departments', token, 100, {
          field: 'active',
          op: 'EQUAL',
          value: true,
        }),
      ]);
      if (!existing) {
        res.status(404).json({ error: 'Complaint not found.' });
        return;
      }
      if (req.user!.role === 'authority' && !isAuthorityAuthorizedForComplaint(req.user!, existing)) {
        res.status(403).json({
          error: 'Access denied. This complaint is outside your authorized department or ward.',
        });
        return;
      }

      const departments = fsDepts.length > 0 ? fsDepts : MUNICIPAL_DEPARTMENTS;
      const dept = departments.find((d) => d.id === departmentId);
      if (!dept) {
        res.status(400).json({ error: 'Valid departmentId is required.' });
        return;
      }

      let assignedAuthorityId = req.user!.uid;
      let assignedAuthorityName = req.user!.displayName;
      if (authorityId) {
        const officer = await firestoreGetDoc<{ uid: string; displayName: string; role: string }>(
          `users/${authorityId}`,
          token
        );
        if (officer && (officer.role === 'authority' || officer.role === 'admin')) {
          assignedAuthorityId = officer.uid;
          assignedAuthorityName = officer.displayName;
        }
      }

      const previousStatus = existing.status;
      const nextStatus: ComplaintStatus =
        existing.status === 'Submitted' || existing.status === 'Under Review'
          ? 'Assigned'
          : existing.status;
      const remarkText =
        remarks?.trim() || `Assigned to ${dept.name} (${assignedAuthorityName}).`;

      const updId = `upd_${Date.now()}`;
      const auditId = `audit_${Date.now()}`;
      const notifId = `notif_${Date.now()}`;

      await firestoreCommitBatch(
        [
          {
            docPath: `complaints/${existing.id}`,
            data: {
              assignedDepartmentId: dept.id,
              assignedAuthorityId,
              assignedAuthorityName: assignedAuthorityName.slice(0, 120),
              status: nextStatus,
            },
            updateMask: [
              'assignedDepartmentId',
              'assignedAuthorityId',
              'assignedAuthorityName',
              'status',
              'updatedAt',
            ],
            serverTimestamps: ['updatedAt'],
          },
          {
            docPath: `gis_markers/${existing.id}`,
            data: {
              assignedDepartmentId: dept.id,
              assignedAuthorityId,
              status: nextStatus,
            },
            updateMask: ['assignedDepartmentId', 'assignedAuthorityId', 'status', 'updatedAt'],
            serverTimestamps: ['updatedAt'],
          },
          {
            docPath: `complaints/${existing.id}/updates/${updId}`,
            data: {
              id: updId,
              complaintId: existing.id,
              complaintCitizenId: existing.citizenId,
              actorId: req.user!.uid,
              actorName: req.user!.displayName.slice(0, 120),
              actorRole: req.user!.role,
              previousStatus,
              newStatus: nextStatus,
              remarks: remarkText.slice(0, 1000),
            },
            serverTimestamps: ['createdAt'],
          },
          {
            docPath: `audit_logs/${auditId}`,
            data: {
              id: auditId,
              actorId: req.user!.uid,
              actorName: req.user!.displayName.slice(0, 120),
              actorRole: req.user!.role,
              action: 'COMPLAINT_ASSIGNED',
              targetType: 'complaint',
              targetId: existing.id,
              details: `Assigned to ${dept.name} / Officer ${assignedAuthorityName}`,
            },
            serverTimestamps: ['createdAt'],
          },
          {
            docPath: `notifications/${notifId}`,
            data: {
              id: notifId,
              recipientId: existing.citizenId,
              complaintId: existing.id,
              title: `${existing.id} assigned to ${dept.name}`,
              message: remarkText.slice(0, 380),
              type: 'assignment',
              read: false,
            },
            serverTimestamps: ['createdAt'],
          },
        ],
        token
      );

      const updated = await firestoreGetDoc<RawComplaintDoc>(`complaints/${existing.id}`, token);
      res.json({ complaint: updated ? hydrateComplaint(updated, departments) : existing });
    } catch (err) {
      next(err);
    }
  }
);
