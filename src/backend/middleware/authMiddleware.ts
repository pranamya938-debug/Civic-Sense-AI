import { NextFunction, Request, Response } from 'express';
import { ENV } from '../config/env.ts';
import { firestoreGetDoc } from '../services/firestoreRestService.ts';
import { UserProfile, UserRole } from '../../shared/types.ts';

export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
  firebaseIdToken?: string;
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
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;

  const fbUser = await verifyFirebaseIdToken(token);
  if (!fbUser) return null;

  req.firebaseIdToken = token;

  const isBootstrapAdmin =
    fbUser.emailVerified && fbUser.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL;

  let role: UserRole = isBootstrapAdmin ? 'admin' : 'citizen';
  let displayName = fbUser.displayName;
  let departmentId: string | undefined;
  let wardId: string | undefined;
  let active = true;
  let createdAt = new Date().toISOString();
  let updatedAt = createdAt;
  let phone: string | undefined;

  try {
    const userDoc = await firestoreGetDoc<{
      uid?: string;
      displayName?: string;
      role?: UserRole;
      departmentId?: string;
      wardId?: string;
      active?: boolean;
      createdAt?: string;
      updatedAt?: string;
    }>(`users/${fbUser.uid}`, token);

    if (userDoc) {
      if (userDoc.active === false) return null;
      role = isBootstrapAdmin ? 'admin' : userDoc.role || 'citizen';
      displayName = userDoc.displayName || displayName;
      departmentId = userDoc.departmentId;
      wardId = userDoc.wardId;
      active = true;
      createdAt = userDoc.createdAt || createdAt;
      updatedAt = userDoc.updatedAt || updatedAt;
    }

    const privateDoc = await firestoreGetDoc<{ phone?: string }>(
      `users/${fbUser.uid}/private/info`,
      token
    );
    if (privateDoc?.phone) {
      phone = privateDoc.phone;
    }
  } catch {
    // Allow identity resolution even if profile doc is in initial creation
  }

  return {
    uid: fbUser.uid,
    email: fbUser.email,
    displayName,
    role,
    departmentId,
    wardId,
    phone,
    active,
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
    res.status(401).json({ error: 'Firebase authentication required. Please sign in to continue.' });
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
