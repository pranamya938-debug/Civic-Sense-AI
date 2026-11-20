import { Router } from 'express';
import {
  AuthenticatedRequest,
  isAuthorityAuthorizedForComplaint,
  requireAuth,
  requireDeveloperAccess,
  requireRole,
} from '../middleware/authMiddleware.ts';
import {
  firestoreCommitBatch,
  firestoreGetDoc,
  firestoreListCollection,
} from '../services/firestoreRestService.ts';
import { mlService } from '../services/mlService.ts';
import { ENV } from '../config/env.ts';
import {
  MUNICIPAL_CATEGORIES,
  MUNICIPAL_DEPARTMENTS,
  MUNICIPAL_WARDS,
} from '../../shared/catalog.ts';
import {
  AuditLogEntry,
  AuthorityApplication,
  CivicCategory,
  Department,
  DuplicateMatchRecord,
  UserProfile,
  UserRole,
  Ward,
  normalizeUserRole,
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
      const users =
        req.user!.role === 'authority'
          ? await firestoreListCollection<UserProfile>('users', token, 200, {
              field: 'role',
              op: 'EQUAL',
              value: 'authority',
            })
          : await firestoreListCollection<UserProfile>('users', token, 200);
      const normalized = users.map((u) => ({
        ...u,
        role: normalizeUserRole(u.role),
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
        role?: UserRole | 'administrator';
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
      const serverTimestamps = ['updatedAt'];
      const normalizedRole = role ? normalizeUserRole(role) : undefined;
      if (normalizedRole) {
        patch.role = normalizedRole;
        mask.push('role');
        if (normalizedRole === 'authority') {
          patch.accountStatus = 'approved';
          patch.approvedBy = req.user!.uid;
          mask.push('accountStatus', 'approvedBy', 'approvedAt');
          serverTimestamps.push('approvedAt');
        } else if (target.role === 'authority') {
          patch.accountStatus = 'active';
          mask.push('accountStatus');
        }
      }
      if (typeof departmentId === 'string') {
        patch.departmentId = departmentId;
        mask.push('departmentId');
      }
      if (typeof wardId === 'string') {
        patch.wardId = wardId;
        mask.push('wardId');
      }
      if (typeof active === 'boolean') {
        patch.active = active;
        mask.push('active');
        if (!active && (normalizedRole || target.role) === 'authority') {
          patch.accountStatus = 'suspended';
          if (!mask.includes('accountStatus')) mask.push('accountStatus');
        } else if (active && (normalizedRole || target.role) === 'authority') {
          patch.accountStatus = 'approved';
          if (!mask.includes('accountStatus')) mask.push('accountStatus');
        }
      }

      const isDeptOrWardUpdate =
        typeof departmentId === 'string' || typeof wardId === 'string';
      const effectiveRole = normalizedRole || target.role;
      const auditAction =
        isDeptOrWardUpdate && effectiveRole === 'authority' && !role && typeof active !== 'boolean'
          ? 'AUTHORITY_ASSIGNMENT_UPDATED'
          : 'USER_ACCOUNT_UPDATED';

      const auditId = `audit_${Date.now()}`;
      await firestoreCommitBatch(
        [
          {
            docPath: `users/${target.uid}`,
            data: patch,
            updateMask: mask,
            serverTimestamps,
          },
          {
            docPath: `audit_logs/${auditId}`,
            data: {
              id: auditId,
              actorId: req.user!.uid,
              actorName: req.user!.displayName.slice(0, 120),
              actorRole: 'admin',
              action: auditAction,
              targetType: 'user',
              targetId: target.uid,
              details: `Updated user ${target.uid}: role=${patch.role || target.role}, dept=${
                typeof departmentId === 'string' ? departmentId : target.departmentId || 'none'
              }, ward=${
                typeof wardId === 'string' ? wardId : target.wardId || 'none'
              }, active=${typeof patch.active === 'boolean' ? patch.active : target.active}`.slice(0, 500),
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

adminRoutes.get(
  '/authority-applications',
  requireAuth,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const applications = await firestoreListCollection<AuthorityApplication>(
        'authority_applications',
        req.firebaseIdToken!,
        200
      );
      applications.sort(
        (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      );
      res.json({ applications });
    } catch (err) {
      next(err);
    }
  }
);

adminRoutes.post(
  '/authority-applications/:uid/approve',
  requireAuth,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const token = req.firebaseIdToken!;
      const targetUid = req.params.uid;
      const { departmentId: bodyDeptId, wardId: bodyWardId } = req.body as {
        departmentId?: string;
        wardId?: string;
      };

      const [app, targetUser, fsDepts, fsWards] = await Promise.all([
        firestoreGetDoc<AuthorityApplication>(`authority_applications/${targetUid}`, token),
        firestoreGetDoc<UserProfile>(`users/${targetUid}`, token),
        firestoreListCollection<Department>('departments', token, 100, {
          field: 'active',
          op: 'EQUAL',
          value: true,
        }),
        firestoreListCollection<Ward>('wards', token, 100, {
          field: 'active',
          op: 'EQUAL',
          value: true,
        }),
      ]);

      if (!app) {
        res.status(404).json({ error: 'Authority application not found in Cloud Firestore.' });
        return;
      }
      if (!targetUser) {
        res.status(404).json({ error: 'Applicant user profile not found in Cloud Firestore.' });
        return;
      }
      if (!app.emailVerified) {
        res.status(400).json({
          error:
            'Applicant official email address is not yet verified in Firebase Authentication. Email verification is required before activating an authority account.',
        });
        return;
      }

      const departments = fsDepts.length > 0 ? fsDepts : MUNICIPAL_DEPARTMENTS;
      const wards = fsWards.length > 0 ? fsWards : MUNICIPAL_WARDS;

      const resolvedDeptId = bodyDeptId || app.departmentId;
      const resolvedWardId = bodyWardId || app.wardId;
      const dept = departments.find((d) => d.id === resolvedDeptId);
      const ward = wards.find((w) => w.id === resolvedWardId);
      if (!dept || !ward) {
        res.status(400).json({ error: 'Valid municipal department and ward are required.' });
        return;
      }

      const auditId = `audit_${Date.now()}`;
      const notifId = `notif_${Date.now()}`;
      await firestoreCommitBatch(
        [
          {
            docPath: `users/${targetUid}`,
            data: {
              role: 'authority',
              accountStatus: 'approved',
              active: true,
              departmentId: dept.id,
              wardId: ward.id,
              designation: app.designation,
              municipality: app.municipality,
              employeeId: app.employeeId,
              approvedBy: req.user!.uid,
            },
            updateMask: [
              'role',
              'accountStatus',
              'active',
              'departmentId',
              'wardId',
              'designation',
              'municipality',
              'employeeId',
              'approvedBy',
              'approvedAt',
              'updatedAt',
            ],
            serverTimestamps: ['approvedAt', 'updatedAt'],
          },
          {
            docPath: `authority_applications/${targetUid}`,
            data: {
              status: 'approved',
              departmentId: dept.id,
              departmentName: dept.name.slice(0, 120),
              wardId: ward.id,
              wardName: ward.name.slice(0, 120),
              reviewedBy: req.user!.uid,
              reviewedByName: req.user!.displayName.slice(0, 120),
              rejectionReason: '',
            },
            updateMask: [
              'status',
              'departmentId',
              'departmentName',
              'wardId',
              'wardName',
              'reviewedBy',
              'reviewedByName',
              'reviewedAt',
              'rejectionReason',
              'updatedAt',
            ],
            serverTimestamps: ['reviewedAt', 'updatedAt'],
          },
          {
            docPath: `audit_logs/${auditId}`,
            data: {
              id: auditId,
              actorId: req.user!.uid,
              actorName: req.user!.displayName.slice(0, 120),
              actorRole: 'admin',
              action: 'AUTHORITY_APPLICATION_APPROVED',
              targetType: 'authority_application',
              targetId: targetUid,
              details: `Approved ${app.fullName} (${app.employeeId}, ${app.municipality}) for ${dept.name} / ${ward.name}`.slice(0, 500),
            },
            serverTimestamps: ['createdAt'],
          },
          {
            docPath: `notifications/${notifId}`,
            data: {
              id: notifId,
              recipientId: targetUid,
              title: 'Municipal Authority Access Approved',
              message: `Your authority verification for ${dept.name} (${ward.name}) has been approved. Sign in to access the Authority Console.`,
              type: 'authority_verification',
              read: false,
            },
            serverTimestamps: ['createdAt'],
          },
        ],
        token
      );

      const [updatedApp, updatedUser] = await Promise.all([
        firestoreGetDoc<AuthorityApplication>(`authority_applications/${targetUid}`, token),
        firestoreGetDoc<UserProfile>(`users/${targetUid}`, token),
      ]);
      res.json({ application: updatedApp, user: updatedUser });
    } catch (err) {
      next(err);
    }
  }
);

adminRoutes.post(
  '/authority-applications/:uid/reject',
  requireAuth,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const token = req.firebaseIdToken!;
      const targetUid = req.params.uid;
      const { rejectionReason } = req.body as { rejectionReason?: string };

      if (!rejectionReason || rejectionReason.trim().length < 5) {
        res.status(400).json({ error: 'A clear rejection reason (minimum 5 characters) is required.' });
        return;
      }

      const [app, targetUser] = await Promise.all([
        firestoreGetDoc<AuthorityApplication>(`authority_applications/${targetUid}`, token),
        firestoreGetDoc<UserProfile>(`users/${targetUid}`, token),
      ]);
      if (!app || !targetUser) {
        res.status(404).json({ error: 'Authority application or user record not found.' });
        return;
      }

      const cleanReason = rejectionReason.trim().slice(0, 500);
      const auditId = `audit_${Date.now()}`;
      const notifId = `notif_${Date.now()}`;

      await firestoreCommitBatch(
        [
          {
            docPath: `users/${targetUid}`,
            data: {
              role: 'citizen',
              accountStatus: 'rejected',
              active: true,
              departmentId: '',
            },
            updateMask: ['role', 'accountStatus', 'active', 'departmentId', 'updatedAt'],
            serverTimestamps: ['updatedAt'],
          },
          {
            docPath: `authority_applications/${targetUid}`,
            data: {
              status: 'rejected',
              rejectionReason: cleanReason,
              reviewedBy: req.user!.uid,
              reviewedByName: req.user!.displayName.slice(0, 120),
            },
            updateMask: [
              'status',
              'rejectionReason',
              'reviewedBy',
              'reviewedByName',
              'reviewedAt',
              'updatedAt',
            ],
            serverTimestamps: ['reviewedAt', 'updatedAt'],
          },
          {
            docPath: `audit_logs/${auditId}`,
            data: {
              id: auditId,
              actorId: req.user!.uid,
              actorName: req.user!.displayName.slice(0, 120),
              actorRole: 'admin',
              action: 'AUTHORITY_APPLICATION_REJECTED',
              targetType: 'authority_application',
              targetId: targetUid,
              details: `Rejected authority request from ${app.fullName} (${app.employeeId}): ${cleanReason}`.slice(0, 500),
            },
            serverTimestamps: ['createdAt'],
          },
          {
            docPath: `notifications/${notifId}`,
            data: {
              id: notifId,
              recipientId: targetUid,
              title: 'Authority Access Request Not Approved',
              message: `Reason: ${cleanReason}`.slice(0, 380),
              type: 'authority_verification',
              read: false,
            },
            serverTimestamps: ['createdAt'],
          },
        ],
        token
      );

      const updatedApp = await firestoreGetDoc<AuthorityApplication>(
        `authority_applications/${targetUid}`,
        token
      );
      res.json({ application: updatedApp });
    } catch (err) {
      next(err);
    }
  }
);

adminRoutes.post(
  '/authority-applications/:uid/suspend',
  requireAuth,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const token = req.firebaseIdToken!;
      const targetUid = req.params.uid;
      const { reason } = req.body as { reason?: string };

      const [app, targetUser] = await Promise.all([
        firestoreGetDoc<AuthorityApplication>(`authority_applications/${targetUid}`, token),
        firestoreGetDoc<UserProfile>(`users/${targetUid}`, token),
      ]);
      if (!targetUser) {
        res.status(404).json({ error: 'Target user not found in Cloud Firestore.' });
        return;
      }

      const cleanReason = (reason?.trim() || 'Suspended by Administrator during oversight review.').slice(0, 500);
      const auditId = `audit_${Date.now()}`;
      const ops: Parameters<typeof firestoreCommitBatch>[0] = [
        {
          docPath: `users/${targetUid}`,
          data: {
            accountStatus: 'suspended',
            active: false,
          },
          updateMask: ['accountStatus', 'active', 'updatedAt'],
          serverTimestamps: ['updatedAt'],
        },
        {
          docPath: `audit_logs/${auditId}`,
          data: {
            id: auditId,
            actorId: req.user!.uid,
            actorName: req.user!.displayName.slice(0, 120),
            actorRole: 'admin',
            action: 'AUTHORITY_ACCOUNT_SUSPENDED',
            targetType: 'authority_application',
            targetId: targetUid,
            details: `Suspended authority access for ${targetUser.displayName}: ${cleanReason}`.slice(0, 500),
          },
          serverTimestamps: ['createdAt'],
        },
      ];

      if (app) {
        ops.push({
          docPath: `authority_applications/${targetUid}`,
          data: {
            status: 'suspended',
            rejectionReason: cleanReason,
            reviewedBy: req.user!.uid,
            reviewedByName: req.user!.displayName.slice(0, 120),
          },
          updateMask: [
            'status',
            'rejectionReason',
            'reviewedBy',
            'reviewedByName',
            'reviewedAt',
            'updatedAt',
          ],
          serverTimestamps: ['reviewedAt', 'updatedAt'],
        });
      }

      await firestoreCommitBatch(ops, token);
      const updatedApp = app
        ? await firestoreGetDoc<AuthorityApplication>(`authority_applications/${targetUid}`, token)
        : null;
      res.json({ application: updatedApp });
    } catch (err) {
      next(err);
    }
  }
);

adminRoutes.patch(
  '/authority-applications/:uid/assignment',
  requireAuth,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const token = req.firebaseIdToken!;
      const targetUid = req.params.uid;
      const { departmentId, wardId } = req.body as { departmentId?: string; wardId?: string };

      const [app, targetUser, fsDepts, fsWards] = await Promise.all([
        firestoreGetDoc<AuthorityApplication>(`authority_applications/${targetUid}`, token),
        firestoreGetDoc<UserProfile>(`users/${targetUid}`, token),
        firestoreListCollection<Department>('departments', token, 100, {
          field: 'active',
          op: 'EQUAL',
          value: true,
        }),
        firestoreListCollection<Ward>('wards', token, 100, {
          field: 'active',
          op: 'EQUAL',
          value: true,
        }),
      ]);
      if (!targetUser) {
        res.status(404).json({ error: 'Target authority user not found.' });
        return;
      }

      const departments = fsDepts.length > 0 ? fsDepts : MUNICIPAL_DEPARTMENTS;
      const wards = fsWards.length > 0 ? fsWards : MUNICIPAL_WARDS;
      const dept = departments.find((d) => d.id === (departmentId || targetUser.departmentId));
      const ward = wards.find((w) => w.id === (wardId || targetUser.wardId));
      if (!dept || !ward) {
        res.status(400).json({ error: 'Valid departmentId and wardId are required.' });
        return;
      }

      const auditId = `audit_${Date.now()}`;
      const ops: Parameters<typeof firestoreCommitBatch>[0] = [
        {
          docPath: `users/${targetUid}`,
          data: { departmentId: dept.id, wardId: ward.id },
          updateMask: ['departmentId', 'wardId', 'updatedAt'],
          serverTimestamps: ['updatedAt'],
        },
        {
          docPath: `audit_logs/${auditId}`,
          data: {
            id: auditId,
            actorId: req.user!.uid,
            actorName: req.user!.displayName.slice(0, 120),
            actorRole: 'admin',
            action: 'AUTHORITY_ASSIGNMENT_UPDATED',
            targetType: 'authority_application',
            targetId: targetUid,
            details: `Updated scope for ${targetUser.displayName} to ${dept.name} / ${ward.name}`.slice(0, 500),
          },
          serverTimestamps: ['createdAt'],
        },
      ];

      if (app) {
        ops.push({
          docPath: `authority_applications/${targetUid}`,
          data: {
            departmentId: dept.id,
            departmentName: dept.name.slice(0, 120),
            wardId: ward.id,
            wardName: ward.name.slice(0, 120),
          },
          updateMask: ['departmentId', 'departmentName', 'wardId', 'wardName', 'updatedAt'],
          serverTimestamps: ['updatedAt'],
        });
      }

      await firestoreCommitBatch(ops, token);
      const [updatedApp, updatedUser] = await Promise.all([
        app ? firestoreGetDoc<AuthorityApplication>(`authority_applications/${targetUid}`, token) : Promise.resolve(null),
        firestoreGetDoc<UserProfile>(`users/${targetUid}`, token),
      ]);
      res.json({ application: updatedApp, user: updatedUser });
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
      const token = req.firebaseIdToken!;
      const duplicates = await firestoreListCollection<DuplicateMatchRecord>(
        'duplicate_matches',
        token,
        200
      );
      if (req.user!.role === 'authority') {
        const scoped: DuplicateMatchRecord[] = [];
        for (const d of duplicates) {
          const src = await firestoreGetDoc<{
            assignedDepartmentId?: string;
            assignedAuthorityId?: string;
            wardId?: string;
          }>(`complaints/${d.sourceComplaintId}`, token).catch(() => null);
          if (src && isAuthorityAuthorizedForComplaint(req.user!, src)) {
            scoped.push(d);
          }
        }
        res.json({ duplicates: scoped });
        return;
      }
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
      if (req.user!.role === 'authority') {
        const src = await firestoreGetDoc<{
          assignedDepartmentId?: string;
          assignedAuthorityId?: string;
          wardId?: string;
        }>(`complaints/${match.sourceComplaintId}`, token).catch(() => null);
        if (!src || !isAuthorityAuthorizedForComplaint(req.user!, src)) {
          res.status(403).json({
            error: 'Access denied. Duplicate record is outside your authorized department or ward.',
          });
          return;
        }
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
  requireRole('admin', 'system'),
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

adminRoutes.get(
  '/system/status',
  requireAuth,
  requireDeveloperAccess,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const mlHealth = await mlService.getHealth();
      res.json({
        service: 'CivicSense AI System Runtime',
        actorUid: req.user!.uid,
        actorRole: req.user!.role,
        mlService: {
          configuredUrl: mlHealth.configuredUrl ? 'Configured (server-side)' : null,
          pythonServiceReachable: mlHealth.pythonServiceReachable,
          activeMode: mlHealth.activeMode,
        },
        environment: {
          nodeEnv: ENV.NODE_ENV,
          firebaseProjectId: ENV.FIREBASE_PROJECT_ID || 'Configured',
          firestoreDatabaseId: ENV.FIRESTORE_DATABASE_ID || '(default)',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);
