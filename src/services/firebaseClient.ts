import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile as updateFirebaseAuthProfile,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  serverTimestamp,
  setDoc,
  setLogLevel,
  updateDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { UserProfile, UserRole } from '../shared/types';

export const BOOTSTRAP_ADMIN_EMAIL = '4al24cd025@aiet.org.in';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

const isConfigured = Boolean(
  firebaseConfig &&
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.projectId !== 'remixed-project-id'
);

const app = isConfigured ? (getApps().length ? getApp() : initializeApp(firebaseConfig)) : null;
export const auth = app ? getAuth(app) : null;

function createFirestoreInstance() {
  if (!app) return null;
  setLogLevel('silent');
  try {
    return firebaseConfig.firestoreDatabaseId
      ? initializeFirestore(
          app,
          {
            experimentalForceLongPolling: true,
            experimentalLongPollingOptions: { timeoutSeconds: 8 },
          },
          firebaseConfig.firestoreDatabaseId
        )
      : initializeFirestore(app, {
          experimentalForceLongPolling: true,
          experimentalLongPollingOptions: { timeoutSeconds: 8 },
        });
  } catch {
    return firebaseConfig.firestoreDatabaseId
      ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
      : getFirestore(app);
  }
}

export const db = createFirestoreInstance();

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid ?? null,
      email: auth?.currentUser?.email ?? null,
      emailVerified: auth?.currentUser?.emailVerified ?? null,
      isAnonymous: auth?.currentUser?.isAnonymous ?? null,
      tenantId: auth?.currentUser?.tenantId ?? null,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function isFirestoreEndpointReachable(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch('https://firestore.googleapis.com/$discovery/rest?version=v1', {
      method: 'GET',
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function testConnection(): Promise<boolean> {
  if (!db) return false;
  try {
    const reachable = await isFirestoreEndpointReachable();
    if (!reachable) return false;

    await Promise.race([
      getDocFromServer(doc(db, 'test', 'connection')),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Firestore testConnection timed out')), 5000)
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

export const isFirebaseAvailable = isConfigured && Boolean(auth) && Boolean(db);

if (isFirebaseAvailable) {
  void testConnection();
}

function mapFirebaseAuthError(err: unknown): Error {
  const code = (err as { code?: string })?.code || '';
  if (code === 'auth/operation-not-allowed') {
    return new Error(
      'Email/Password sign-in is not yet enabled in Firebase Console (Authentication -> Sign-in method). Please enable Email/Password there, or use Continue with Google.'
    );
  }
  if (code === 'auth/email-already-in-use') {
    return new Error('An account with this email already exists. Please sign in instead.');
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return new Error('Invalid email or password.');
  }
  if (code === 'auth/weak-password') {
    return new Error('Password must be at least 6 characters.');
  }
  if (code === 'auth/popup-closed-by-user') {
    return new Error('Google Sign-In popup was closed before completing authentication.');
  }
  return err instanceof Error ? err : new Error(String(err));
}

export async function signInWithGoogleFirebase() {
  if (!auth) throw new Error('Firebase Authentication is not configured.');
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return await signInWithPopup(auth, provider);
  } catch (err) {
    throw mapFirebaseAuthError(err);
  }
}

export async function signInWithEmailFirebase(email: string, password: string) {
  if (!auth) throw new Error('Firebase Authentication is not configured.');
  try {
    return await signInWithEmailAndPassword(auth, email.trim(), password);
  } catch (err) {
    throw mapFirebaseAuthError(err);
  }
}

export async function registerWithEmailFirebase(
  email: string,
  password: string,
  displayName: string
) {
  if (!auth) throw new Error('Firebase Authentication is not configured.');
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await updateFirebaseAuthProfile(cred.user, { displayName: displayName.trim().slice(0, 120) });
    return cred;
  } catch (err) {
    throw mapFirebaseAuthError(err);
  }
}

export async function resetPasswordFirebase(email: string) {
  if (!auth) throw new Error('Firebase Authentication is not configured.');
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (err) {
    throw mapFirebaseAuthError(err);
  }
}

export async function signOutFirebase() {
  if (!auth) return;
  await signOut(auth);
}

function toIsoString(val: unknown): string {
  if (val && typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

export async function ensureUserProfileInFirestore(
  fbUser: FirebaseUser,
  overrides?: { displayName?: string; wardId?: string; phone?: string }
): Promise<UserProfile> {
  if (!db) throw new Error('Cloud Firestore is not initialized.');

  const userPath = `users/${fbUser.uid}`;
  const privatePath = `users/${fbUser.uid}/private/info`;
  const userRef = doc(db, 'users', fbUser.uid);
  const privateRef = doc(db, 'users', fbUser.uid, 'private', 'info');

  const isBootstrapAdmin =
    fbUser.emailVerified && fbUser.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL;

  try {
    const userSnap = await getDoc(userRef);
    const desiredName = (
      overrides?.displayName ||
      fbUser.displayName ||
      fbUser.email?.split('@')[0] ||
      'Citizen User'
    )
      .trim()
      .slice(0, 120);
    const desiredWard = (overrides?.wardId || 'ward_14').slice(0, 64);

    if (!userSnap.exists()) {
      const initialRole: UserRole = isBootstrapAdmin ? 'admin' : 'citizen';
      await setDoc(userRef, {
        uid: fbUser.uid,
        displayName: desiredName,
        role: initialRole,
        wardId: desiredWard,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (overrides?.displayName || overrides?.wardId) {
      const registrationPatch: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };
      if (overrides.displayName && overrides.displayName.trim()) {
        registrationPatch.displayName = overrides.displayName.trim().slice(0, 120);
      }
      if (overrides.wardId) {
        registrationPatch.wardId = overrides.wardId.slice(0, 64);
      }
      await updateDoc(userRef, registrationPatch);
    }

    const privateData: Record<string, unknown> = {
      uid: fbUser.uid,
      email: (fbUser.email || '').slice(0, 180),
      updatedAt: serverTimestamp(),
    };
    if (overrides?.phone && overrides.phone.trim()) {
      privateData.phone = overrides.phone.trim().slice(0, 32);
    }

    const existingPrivateSnap = await getDoc(privateRef);
    if (!existingPrivateSnap.exists()) {
      await setDoc(privateRef, privateData);
    } else if (overrides?.phone !== undefined) {
      const privateUpdateData: Record<string, unknown> = {
        email: (fbUser.email || '').slice(0, 180),
        updatedAt: serverTimestamp(),
      };
      if (overrides.phone.trim()) {
        privateUpdateData.phone = overrides.phone.trim().slice(0, 32);
      }
      await updateDoc(privateRef, privateUpdateData);
    }

    const [freshUserSnap, freshPrivateSnap] = await Promise.all([
      getDoc(userRef),
      getDoc(privateRef),
    ]);
    const data = freshUserSnap.data() || {};
    const priv = freshPrivateSnap.data() || {};

    return {
      uid: fbUser.uid,
      email: (priv.email as string) || fbUser.email || '',
      displayName: (data.displayName as string) || desiredName,
      role: (isBootstrapAdmin ? 'admin' : (data.role as UserRole)) || 'citizen',
      departmentId: data.departmentId as string | undefined,
      wardId: (data.wardId as string) || desiredWard,
      phone: priv.phone as string | undefined,
      active: data.active !== false,
      authProvider: 'firebase',
      createdAt: toIsoString(data.createdAt),
      updatedAt: toIsoString(data.updatedAt),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${userPath} | ${privatePath}`);
  }
}

export async function updateUserProfileInFirestore(
  uid: string,
  email: string,
  patch: { displayName?: string; wardId?: string; phone?: string }
): Promise<UserProfile> {
  if (!db) throw new Error('Cloud Firestore is not initialized.');
  const userRef = doc(db, 'users', uid);
  const privateRef = doc(db, 'users', uid, 'private', 'info');

  try {
    const publicPatch: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (patch.displayName && patch.displayName.trim()) {
      publicPatch.displayName = patch.displayName.trim().slice(0, 120);
      if (auth?.currentUser) {
        await updateFirebaseAuthProfile(auth.currentUser, {
          displayName: patch.displayName.trim().slice(0, 120),
        });
      }
    }
    if (patch.wardId) {
      publicPatch.wardId = patch.wardId.slice(0, 64);
    }
    await updateDoc(userRef, publicPatch);

    const privatePatch: Record<string, unknown> = {
      email: email.slice(0, 180),
      updatedAt: serverTimestamp(),
    };
    if (typeof patch.phone === 'string') {
      privatePatch.phone = patch.phone.trim().slice(0, 32);
    }
    await updateDoc(privateRef, privatePatch);

    const [freshUser, freshPriv] = await Promise.all([getDoc(userRef), getDoc(privateRef)]);
    const d = freshUser.data() || {};
    const p = freshPriv.data() || {};
    return {
      uid,
      email: (p.email as string) || email,
      displayName: (d.displayName as string) || '',
      role: (d.role as UserRole) || 'citizen',
      departmentId: d.departmentId as string | undefined,
      wardId: d.wardId as string | undefined,
      phone: p.phone as string | undefined,
      active: d.active !== false,
      authProvider: 'firebase',
      createdAt: toIsoString(d.createdAt),
      updatedAt: toIsoString(d.updatedAt),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}
