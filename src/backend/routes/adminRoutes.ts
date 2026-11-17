import { Router } from 'express';
import { AuthenticatedRequest, requireAuth, requireRole } from '../middleware/authMiddleware.ts';
import {
  firestoreCommitBatch,
  firestoreGetDoc,
  firestoreListCollection,
} from '../services/firestoreRestService.ts';
import {
  MUNICIPAL_CATEGORIES,
  MUNICIPAL_DEPARTMENTS,
  MUNICIPAL_WARDS,
} from '../../shared/catalog.ts';
import {
  AuditLogEntry,
  CivicCategory,
  Department,
  DuplicateMatchRecord,
  UserProfile,
  UserRole,
  Ward,
} from '../../shared/types.ts';

export const adminRoutes = Router();

adminRoutes.get('/departments', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const fsDepts = await firestoreListCollection<Department>(
      'departments',
      req.firebaseIdToken!,
      100,
      { field: 'active', op: 'EQUAL', value: true }
    );
    res.json({ departments: fsDepts.length > 0 ? fsDepts : MUNICIPAL_DEPARTMENTS });
  } catch (err) {
    next(err);
  }
});

adminRoutes.get('/wards', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const fsWards = await firestoreListCollection<Ward>('wards', req.firebaseIdToken!, 100, {
      field: 'active',
      op: 'EQUAL',
      value: true,
    });
    res.json({ wards: fsWards.length > 0 ? fsWards : MUNICIPAL_WARDS });
  } catch (err) {
    next(err);
  }
});

adminRoutes.get('/categories', (_req, res) => {
  res.json({ categories: MUNICIPAL_CATEGORIES });
});

adminRoutes.get(
  '/users',
  requireAuth,
  requireRole('admin', 'authority'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const token = req.firebaseIdToken!;
      const users = await firestoreListCollection<UserProfile>('users', token, 200);
      const normalized = users.map((u) => ({
        ...u,
        email: u.email || '',
        authProvider: 'firebase' as const,
      }));
      if (req.user!.role === 'authority') {
        res.json({ users: normalized.filter((u) => u.role === 'authority') });
        return;
      }
      res.json({ users: normalized });
    } catch (err) {
      next(err);
    }
  }
);

adminRoutes.patch(
  '/users/:uid',
  requireAuth,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const token = req.firebaseIdToken!;
      const { role, departmentId, wardId, active } = req.body as {
        role?: UserRole;
        departmentId?: string;
        wardId?: string;
        active?: boolean;
      };
      const target = await firestoreGetDoc<UserProfile>(`users/${req.params.uid}`, token);
      if (!target) {
        res.status(404).json({ error: 'User not found in Cloud Firestore.' });
        return;
      }

      const patch: Record<string, unknown> = {};
      const mask = ['updatedAt'];
      if (role && ['citizen', 'authority', 'admin'].includes(role)) {
        patch.role = role;
        mask.push('role');
      }
      if (typeof departmentId === 'string' && departmentId) {
        patch.departmentId = departmentId;
        mask.push('departmentId');
      }
      if (typeof wardId === 'string' && wardId) {
        patch.wardId = wardId;
        mask.push('wardId');
      }
      if (typeof active === 'boolean') {
        patch.active = active;
        mask.push('active');
      }

      const auditId = `audit_${Date.now()}`;
      await firestoreCommitBatch(
        [
          {
            docPath: `users/${target.uid}`,
            data: patch,
            updateMask: mask,
            serverTimestamps: ['updatedAt'],
          },
          {
            docPath: `audit_logs/${auditId}`,
            data: {
              id: auditId,
              actorId: req.user!.uid,
              actorName: req.user!.displayName.slice(0, 120),
              actorRole: 'admin',
              action: 'USER_ACCOUNT_UPDATED',
              targetType: 'user',
              targetId: target.uid,
              details: `Updated user ${target.uid}: role=${patch.role || target.role}, active=${
                typeof patch.active === 'boolean' ? patch.active : target.active
              }`,
            },
            serverTimestamps: ['createdAt'],
          },
        ],
        token
      );

      const updated = await firestoreGetDoc<UserProfile>(`users/${target.uid}`, token);
      res.json({ user: updated });
    } catch (err) {
      next(err);
    }
  }
);

adminRoutes.post(
  '/departments',
  requireAuth,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const token = req.firebaseIdToken!;
      const { name, code, leadOfficer, categories } = req.body as {
        name?: string;
        code?: string;
        leadOfficer?: string;
        categories?: CivicCategory[];
      };
      if (!name || !code) {
        res.status(400).json({ error: 'Department name and code are required.' });
        return;
      }
      const id = `dept_${Date.now().toString(36)}`;
      const auditId = `audit_${Date.now()}`;
      const deptData = {
        id,
        name: name.trim().slice(0, 120),
        code: code.trim().toUpperCase().slice(0, 24),
        leadOfficer: (leadOfficer || 'Unassigned').trim().slice(0, 120),
        categories:
          Array.isArray(categories) && categories.length > 0
            ? categories
            : (['Other Civic Issues'] as CivicCategory[]),
        active: true,
      };
      await firestoreCommitBatch(
        [
          {
            docPath: `departments/${id}`,
            data: deptData,
            serverTimestamps: ['createdAt'],
          },
          {
            docPath: `audit_logs/${auditId}`,
            data: {
              id: auditId,
              actorId: req.user!.uid,
              actorName: req.user!.displayName.slice(0, 120),
              actorRole: 'admin',
              action: 'DEPARTMENT_CREATED',
              targetType: 'department',
              targetId: id,
              details: `Created department ${deptData.name} (${deptData.code})`,
            },
            serverTimestamps: ['createdAt'],
          },
        ],
        token
      );
      res.status(201).json({ department: { ...deptData, createdAt: new Date().toISOString() } });
    } catch (err) {
      next(err);
    }
  }
);

adminRoutes.post(
  '/wards',
  requireAuth,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const token = req.firebaseIdToken!;
      const { name, zone, centerLat, centerLng } = req.body as {
        name?: string;
        zone?: string;
        centerLat?: number;
        centerLng?: number;
      };
      if (!name || !zone || typeof centerLat !== 'number' || typeof centerLng !== 'number') {
        res.status(400).json({ error: 'name, zone, centerLat, and centerLng are required.' });
        return;
      }
      const id = `ward_${Date.now().toString(36)}`;
      const auditId = `audit_${Date.now()}`;
      const wardData = {
        id,
        name: name.trim().slice(0, 120),
        zone: zone.trim().slice(0, 64),
        centerLat,
        centerLng,
        isDemoBoundary: true,
        active: true,
      };
      await firestoreCommitBatch(
        [
          {
            docPath: `wards/${id}`,
            data: wardData,
            serverTimestamps: ['createdAt'],
          },
          {
            docPath: `audit_logs/${auditId}`,
            data: {
              id: auditId,
              actorId: req.user!.uid,
              actorName: req.user!.displayName.slice(0, 120),
              actorRole: 'admin',
              action: 'WARD_CREATED',
              targetType: 'ward',
              targetId: id,
              details: `Added ward ${wardData.name} (${wardData.zone})`,
            },
            serverTimestamps: ['createdAt'],
          },
        ],
        token
      );
      res.status(201).json({ ward: { ...wardData, createdAt: new Date().toISOString() } });
    } catch (err) {
      next(err);
    }
  }
);

adminRoutes.get(
  '/duplicates',
  requireAuth,
  requireRole('admin', 'authority'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const duplicates = await firestoreListCollection<DuplicateMatchRecord>(
        'duplicate_matches',
        req.firebaseIdToken!,
        200
      );
      res.json({ duplicates });
    } catch (err) {
      next(err);
    }
  }
);

adminRoutes.patch(
  '/duplicates/:id',
  requireAuth,
  requireRole('admin', 'authority'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const token = req.firebaseIdToken!;
      const { reviewStatus } = req.body as {
        reviewStatus?: 'confirmed_duplicate' | 'dismissed' | 'pending_review';
      };
      if (!reviewStatus || !['confirmed_duplicate', 'dismissed', 'pending_review'].includes(reviewStatus)) {
        res.status(400).json({ error: 'Valid reviewStatus is required.' });
        return;
      }
      const match = await firestoreGetDoc<DuplicateMatchRecord>(
        `duplicate_matches/${req.params.id}`,
        token
      );
      if (!match) {
        res.status(404).json({ error: 'Duplicate match record not found.' });
        return;
      }
      const auditId = `audit_${Date.now()}`;
      await firestoreCommitBatch(
        [
          {
            docPath: `duplicate_matches/${match.id}`,
            data: {
              reviewStatus,
              reviewedBy: req.user!.displayName.slice(0, 120),
            },
            updateMask: ['reviewStatus', 'reviewedBy'],
          },
          {
            docPath: `audit_logs/${auditId}`,
            data: {
              id: auditId,
              actorId: req.user!.uid,
              actorName: req.user!.displayName.slice(0, 120),
              actorRole: req.user!.role,
              action: 'DUPLICATE_MATCH_REVIEWED',
              targetType: 'duplicate',
              targetId: match.id,
              details: `Marked ${match.sourceComplaintId} vs ${match.matchedComplaintId} as ${reviewStatus}`,
            },
            serverTimestamps: ['createdAt'],
          },
        ],
        token
      );
      res.json({ duplicate: { ...match, reviewStatus, reviewedBy: req.user!.displayName } });
    } catch (err) {
      next(err);
    }
  }
);

adminRoutes.get(
  '/audit-logs',
  requireAuth,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const auditLogs = await firestoreListCollection<AuditLogEntry>(
        'audit_logs',
        req.firebaseIdToken!,
        200
      );
      auditLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json({ auditLogs });
    } catch (err) {
      next(err);
    }
  }
);
