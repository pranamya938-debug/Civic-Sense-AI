import { NextFunction, Request, Response } from 'express';
import { ENV } from '../config/env.ts';
import {
  FirestoreQueryFilter,
  firestoreGetDoc,
  firestoreListCollection,
} from '../services/firestoreRestService.ts';
import {
  AccountStatus,
  COMPLAINT_STATUSES,
  UserProfile,
  UserRole,
  normalizeUserRole,
} from '../../shared/types.ts';

export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
  firebaseIdToken?: string;
  emailVerified?: boolean;
  authFailureStatus?: 401 | 403;
  authFailureReason?: string;
}

const BOOTSTRAP_ADMIN_EMAIL = '4al24cd025@aiet.org.in';

async function verifyFirebaseIdToken(idToken: string): Promise<{
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
} | null> {
  if (!ENV.FIREBASE_WEB_API_KEY) return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${ENV.FIREBASE_WEB_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      users?: Array<{
        localId: string;
        email?: string;
        displayName?: string;
        emailVerified?: boolean;
        disabled?: boolean;
      }>;
    };
    const fbUser = data.users?.[0];
    if (!fbUser || fbUser.disabled || !fbUser.localId || !fbUser.email) return null;
    return {
      uid: fbUser.localId,
      email: fbUser.email,
      displayName: fbUser.displayName || fbUser.email.split('@')[0],
      emailVerified: Boolean(fbUser.emailVerified),
    };
  } catch {
    return null;
  }
}

export async function resolveAuthUser(req: AuthenticatedRequest): Promise<UserProfile | null> {
  req.authFailureStatus = undefined;
  req.authFailureReason = undefined;

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    req.authFailureStatus = 401;
    req.authFailureReason = 'Firebase authentication required. Please sign in to continue.';
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    req.authFailureStatus = 401;
    req.authFailureReason = 'Firebase authentication required. Please sign in to continue.';
    return null;
  }

  const fbUser = await verifyFirebaseIdToken(token);
  if (!fbUser) {
    req.authFailureStatus = 401;
    req.authFailureReason = 'Invalid or expired Firebase session. Please sign in again.';
    return null;
  }

  req.firebaseIdToken = token;
  req.emailVerified = fbUser.emailVerified;

  const isBootstrapAdmin =
    fbUser.emailVerified && fbUser.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL;

  let role: UserRole = isBootstrapAdmin ? 'admin' : 'citizen';
  let accountStatus: AccountStatus = isBootstrapAdmin ? 'active' : 'active';
  let displayName = fbUser.displayName;
  let departmentId: string | undefined;
  let wardId: string | undefined;
  let designation: string | undefined;
  let municipality: string | undefined;
  let employeeId: string | undefined;
  let approvedBy: string | undefined;
  let approvedAt: string | undefined;
  let createdAt = new Date().toISOString();
  let updatedAt = createdAt;
  let phone: string | undefined;

  try {
    const [userDoc, adminDoc] = await Promise.all([
      firestoreGetDoc<{
        uid?: string;
        displayName?: string;
        role?: string;
        accountStatus?: AccountStatus;
        departmentId?: string;
        wardId?: string;
        designation?: string;
        municipality?: string;
        employeeId?: string;
        approvedBy?: string;
        approvedAt?: string;
        active?: boolean;
        createdAt?: string;
        updatedAt?: string;
      }>(`users/${fbUser.uid}`, token),
      firestoreGetDoc<{ uid?: string }>(`admins/${fbUser.uid}`, token).catch(() => null),
    ]);

    if (!userDoc && !isBootstrapAdmin && !adminDoc) {
      req.authFailureStatus = 403;
      req.authFailureReason = 'User role record is missing in Cloud Firestore.';
      return null;
    }

    if (userDoc) {
      if (userDoc.active === false || userDoc.accountStatus === 'suspended') {
        req.authFailureStatus = 403;
        req.authFailureReason =
          userDoc.accountStatus === 'suspended'
            ? 'Your authority account has been suspended by an administrator.'
            : 'This account has been deactivated by an administrator.';
        return null;
      }

      const rawRole = isBootstrapAdmin || adminDoc ? 'admin' : normalizeUserRole(userDoc.role);
      accountStatus = userDoc.accountStatus || (rawRole === 'authority' ? 'pending_verification' : 'active');

      // Enforce strict authority activation: must have approved accountStatus AND verified email
      if (rawRole === 'authority' && (accountStatus !== 'approved' || !fbUser.emailVerified)) {
        role = 'citizen';
      } else {
        role = rawRole;
      }

      displayName = userDoc.displayName || displayName;
      departmentId = userDoc.departmentId;
      wardId = userDoc.wardId;
      designation = userDoc.designation;
      municipality = userDoc.municipality;
      employeeId = userDoc.employeeId;
      approvedBy = userDoc.approvedBy;
      approvedAt = userDoc.approvedAt;
      createdAt = userDoc.createdAt || createdAt;
      updatedAt = userDoc.updatedAt || updatedAt;
    } else if (isBootstrapAdmin || adminDoc) {
      role = 'admin';
      accountStatus = 'active';
    }

    const privateDoc = await firestoreGetDoc<{ phone?: string }>(
      `users/${fbUser.uid}/private/info`,
      token
    ).catch(() => null);
    if (privateDoc?.phone) {
      phone = privateDoc.phone;
    }
  } catch (err) {
    req.authFailureStatus = 403;
    req.authFailureReason =
      err instanceof Error ? err.message : 'Unable to verify Firestore role record.';
    return null;
  }

  return {
    uid: fbUser.uid,
    email: fbUser.email,
    displayName,
    role,
    accountStatus,
    departmentId,
    wardId,
    designation,
    municipality,
    employeeId,
    approvedBy,
    approvedAt,
    emailVerified: fbUser.emailVerified,
    phone,
    active: true,
    authProvider: 'firebase',
    createdAt,
    updatedAt,
  };
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = await resolveAuthUser(req);
  if (!user) {
    res.status(req.authFailureStatus || 401).json({
      error: req.authFailureReason || 'Firebase authentication required. Please sign in to continue.',
    });
    return;
  }
  req.user = user;
  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}. Your role: ${req.user.role}.`,
      });
      return;
    }
    next();
  };
}

export function isDeveloperAuthorized(
  user: UserProfile,
  emailVerified?: boolean
): boolean {
  if (!user.active) return false;
  if (user.role === 'system') return true;
  if (ENV.DEVELOPER_ALLOWLIST_UIDS.includes(user.uid)) return true;
  if (
    emailVerified === true &&
    user.email &&
    ENV.DEVELOPER_ALLOWLIST_EMAILS.includes(user.email.toLowerCase())
  ) {
    return true;
  }
  return false;
}

export function requireDeveloperAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Firebase authentication required.' });
    return;
  }
  if (!isDeveloperAuthorized(req.user, req.emailVerified)) {
    res.status(403).json({
      error:
        'Access denied. Developer Console and source export privileges are restricted to explicitly authorized platform owner or system accounts.',
    });
    return;
  }
  next();
}

export function isAuthorityAuthorizedForComplaint(
  user: UserProfile,
  record: {
    assignedDepartmentId?: string;
    assignedAuthorityId?: string;
    wardId?: string;
  }
): boolean {
  if (user.role === 'admin') return true;
  if (user.role !== 'authority' || !user.active || user.accountStatus !== 'approved') return false;
  const hasDept = Boolean(user.departmentId && user.departmentId.trim());
  const hasWard = Boolean(user.wardId && user.wardId.trim());
  if (!hasDept && !hasWard) return false;
  const deptMatches = !hasDept || record.assignedDepartmentId === user.departmentId;
  const wardMatches = !hasWard || record.wardId === user.wardId;
  return deptMatches && wardMatches;
}

export async function loadRoleScopedCollectionDocs<T extends { id?: string }>(
  collectionPath: 'complaints' | 'gis_markers',
  user: UserProfile,
  idToken: string,
  limit = 300
): Promise<T[]> {
  if (user.role === 'admin') {
    if (collectionPath === 'gis_markers') {
      return firestoreListCollection<T>('gis_markers', idToken, limit, {
        field: 'status',
        op: 'IN',
        value: [...COMPLAINT_STATUSES],
      });
    }
    return firestoreListCollection<T>('complaints', idToken, limit);
  }

  if (user.role === 'citizen') {
    if (collectionPath === 'complaints') {
      return firestoreListCollection<T>('complaints', idToken, limit, {
        field: 'citizenId',
        op: 'EQUAL',
        value: user.uid,
      });
    }
    return [];
  }

  if (user.role === 'authority' && user.accountStatus === 'approved' && user.active) {
    const filters: FirestoreQueryFilter[] = [];
    if (user.departmentId) {
      filters.push({
        field: 'assignedDepartmentId',
        op: 'EQUAL',
        value: user.departmentId,
      });
    }
    if (user.wardId) {
      filters.push({
        field: 'wardId',
        op: 'EQUAL',
        value: user.wardId,
      });
    }
    if (filters.length === 0) return [];
    return firestoreListCollection<T>(collectionPath, idToken, limit, filters);
  }

  return [];
}
