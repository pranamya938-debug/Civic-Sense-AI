import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { AuthorityApplication, UserProfile } from '../shared/types';
import { apiRequest, setStoredToken } from '../services/apiClient';
import {
  auth,
  ensureUserProfileInFirestore,
  isFirebaseAvailable,
  registerWithEmailFirebase,
  reloadFirebaseUser,
  resetPasswordFirebase,
  sendEmailVerificationFirebase,
  signInWithEmailFirebase,
  signInWithGoogleFirebase,
  signOutFirebase,
  updateUserProfileInFirestore,
} from '../services/firebaseClient';

interface AuthContextValue {
  user: UserProfile | null;
  authorityApplication: AuthorityApplication | null;
  loading: boolean;
  hasDeveloperAccess: boolean;
  authError: string | null;
  clearAuthError: () => void;
  firebaseConnected: boolean;
  loginWithEmail: (email: string, password: string) => Promise<UserProfile>;
  registerCitizen: (input: {
    email: string;
    password: string;
    displayName: string;
    wardId?: string;
    phone?: string;
  }) => Promise<UserProfile>;
  registerAuthorityIdentityWithEmail: (input: {
    email: string;
    password: string;
    displayName: string;
    phone?: string;
  }) => Promise<UserProfile>;
  registerAuthorityIdentityWithGoogle: () => Promise<UserProfile>;
  resendVerificationEmail: () => Promise<void>;
  refreshEmailVerification: () => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<void>;
  loginWithGoogle: () => Promise<UserProfile>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: { displayName?: string; wardId?: string; phone?: string }) => Promise<UserProfile>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchServerSessionState(idToken: string): Promise<{
  developerConsole: boolean;
  authorityApplication: AuthorityApplication | null;
}> {
  try {
    const res = await apiRequest<{
      authorityApplication?: AuthorityApplication | null;
      capabilities?: { developerConsole?: boolean; sourceExport?: boolean };
    }>('/api/auth/me', { tokenOverride: idToken });
    return {
      developerConsole: Boolean(res?.capabilities?.developerConsole),
      authorityApplication: res?.authorityApplication || null,
    };
  } catch {
    return { developerConsole: false, authorityApplication: null };
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authorityApplication, setAuthorityApplication] = useState<AuthorityApplication | null>(null);
  const [hasDeveloperAccess, setHasDeveloperAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const explicitAuthFlowRef = useRef(false);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const syncCurrentFirebaseUser = useCallback(async () => {
    if (!auth?.currentUser) {
      setStoredToken(null);
      setUser(null);
      setAuthorityApplication(null);
      setHasDeveloperAccess(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const idToken = await auth.currentUser.getIdToken(true);
      setStoredToken(idToken);
      const profile = await ensureUserProfileInFirestore(auth.currentUser, undefined, {
        allowAutoProvision: false,
      });
      if (!profile.active && profile.accountStatus !== 'suspended') {
        await signOutFirebase();
        setStoredToken(null);
        setUser(null);
        setAuthorityApplication(null);
        setHasDeveloperAccess(false);
        setAuthError('Your account has been deactivated by an administrator.');
      } else {
        const sessionState = await fetchServerSessionState(idToken);
        setAuthError(null);
        setUser(profile);
        setAuthorityApplication(sessionState.authorityApplication);
        setHasDeveloperAccess(sessionState.developerConsole);
      }
    } catch (err) {
      await signOutFirebase().catch(() => undefined);
      setStoredToken(null);
      setUser(null);
      setAuthorityApplication(null);
      setHasDeveloperAccess(false);
      setAuthError(err instanceof Error ? err.message : 'Unable to verify account role.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (explicitAuthFlowRef.current) {
        return;
      }
      if (!fbUser) {
        setStoredToken(null);
        setUser(null);
        setAuthorityApplication(null);
        setHasDeveloperAccess(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const idToken = await fbUser.getIdToken();
        setStoredToken(idToken);
        const isGoogleProvider = fbUser.providerData.some((p) => p.providerId === 'google.com');
        const profile = await ensureUserProfileInFirestore(fbUser, undefined, {
          allowAutoProvision: isGoogleProvider,
        });
        if (!profile.active && profile.accountStatus !== 'suspended') {
          await signOutFirebase();
          setStoredToken(null);
          setUser(null);
          setAuthorityApplication(null);
          setHasDeveloperAccess(false);
          setAuthError('Your account has been deactivated by an administrator.');
        } else {
          const sessionState = await fetchServerSessionState(idToken);
          setAuthError(null);
          setUser(profile);
          setAuthorityApplication(sessionState.authorityApplication);
          setHasDeveloperAccess(sessionState.developerConsole);
        }
      } catch (err) {
        await signOutFirebase().catch(() => undefined);
        setStoredToken(null);
        setUser(null);
        setAuthorityApplication(null);
        setHasDeveloperAccess(false);
        setAuthError(err instanceof Error ? err.message : 'Unable to verify account role.');
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const loginWithEmail = async (email: string, password: string) => {
    setAuthError(null);
    explicitAuthFlowRef.current = true;
    setLoading(true);
    try {
      const cred = await signInWithEmailFirebase(email, password);
      const idToken = await cred.user.getIdToken(true);
      setStoredToken(idToken);
      const profile = await ensureUserProfileInFirestore(cred.user, undefined, {
        allowAutoProvision: false,
      });
      if (!profile.active && profile.accountStatus !== 'suspended') {
        await signOutFirebase();
        setStoredToken(null);
        throw new Error('Your account has been deactivated by an administrator.');
      }
      const sessionState = await fetchServerSessionState(idToken);
      setUser(profile);
      setAuthorityApplication(sessionState.authorityApplication);
      setHasDeveloperAccess(sessionState.developerConsole);
      return profile;
    } catch (err) {
      await signOutFirebase().catch(() => undefined);
      setStoredToken(null);
      setUser(null);
      setAuthorityApplication(null);
      setHasDeveloperAccess(false);
      const msg = err instanceof Error ? err.message : 'Sign-in failed.';
      setAuthError(msg);
      throw new Error(msg);
    } finally {
      explicitAuthFlowRef.current = false;
      setLoading(false);
    }
  };

  const registerCitizen = async (input: {
    email: string;
    password: string;
    displayName: string;
    wardId?: string;
    phone?: string;
  }) => {
    setAuthError(null);
    explicitAuthFlowRef.current = true;
    setLoading(true);
    try {
      const cred = await registerWithEmailFirebase(input.email, input.password, input.displayName);
      const idToken = await cred.user.getIdToken();
      setStoredToken(idToken);
      const profile = await ensureUserProfileInFirestore(
        cred.user,
        {
          displayName: input.displayName,
          wardId: input.wardId,
          phone: input.phone,
          accountStatus: 'active',
        },
        { allowAutoProvision: true }
      );
      const sessionState = await fetchServerSessionState(idToken);
      setUser(profile);
      setAuthorityApplication(sessionState.authorityApplication);
      setHasDeveloperAccess(sessionState.developerConsole);
      return profile;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed.';
      setAuthError(msg);
      throw new Error(msg);
    } finally {
      explicitAuthFlowRef.current = false;
      setLoading(false);
    }
  };

  const registerAuthorityIdentityWithEmail = async (input: {
    email: string;
    password: string;
    displayName: string;
    phone?: string;
  }) => {
    setAuthError(null);
    explicitAuthFlowRef.current = true;
    setLoading(true);
    try {
      const cred = await registerWithEmailFirebase(input.email, input.password, input.displayName);
      await sendEmailVerificationFirebase().catch(() => undefined);
      const idToken = await cred.user.getIdToken();
      setStoredToken(idToken);
      const profile = await ensureUserProfileInFirestore(
        cred.user,
        {
          displayName: input.displayName,
          phone: input.phone,
          accountStatus: 'pending_verification',
        },
        { allowAutoProvision: true }
      );
      const sessionState = await fetchServerSessionState(idToken);
      setUser(profile);
      setAuthorityApplication(sessionState.authorityApplication);
      setHasDeveloperAccess(sessionState.developerConsole);
      return profile;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authority account creation failed.';
      setAuthError(msg);
      throw new Error(msg);
    } finally {
      explicitAuthFlowRef.current = false;
      setLoading(false);
    }
  };

  const registerAuthorityIdentityWithGoogle = async () => {
    setAuthError(null);
    explicitAuthFlowRef.current = true;
    setLoading(true);
    try {
      const cred = await signInWithGoogleFirebase();
      const idToken = await cred.user.getIdToken(true);
      setStoredToken(idToken);
      const profile = await ensureUserProfileInFirestore(
        cred.user,
        {
          displayName: cred.user.displayName || undefined,
        },
        { allowAutoProvision: true }
      );
      if (!profile.active && profile.accountStatus !== 'suspended') {
        await signOutFirebase();
        setStoredToken(null);
        throw new Error('Your account has been deactivated by an administrator.');
      }
      const sessionState = await fetchServerSessionState(idToken);
      setUser(profile);
      setAuthorityApplication(sessionState.authorityApplication);
      setHasDeveloperAccess(sessionState.developerConsole);
      return profile;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      setAuthError(msg);
      throw new Error(msg);
    } finally {
      explicitAuthFlowRef.current = false;
      setLoading(false);
    }
  };

  const resendVerificationEmail = async () => {
    await sendEmailVerificationFirebase();
  };

  const refreshEmailVerification = async () => {
    const reloaded = await reloadFirebaseUser();
    if (!reloaded) return false;
    const freshToken = await reloaded.getIdToken(true);
    setStoredToken(freshToken);
    if (reloaded.emailVerified) {
      try {
        const res = await apiRequest<{ application?: AuthorityApplication | null }>(
          '/api/authority-applications/sync-email-verification',
          { method: 'POST', tokenOverride: freshToken }
        );
        if (res?.application) {
          setAuthorityApplication(res.application);
        }
      } catch {
        // ignore if no application doc yet
      }
    }
    await syncCurrentFirebaseUser();
    return Boolean(reloaded.emailVerified);
  };

  const sendPasswordReset = async (email: string) => {
    await resetPasswordFirebase(email);
  };

  const loginWithGoogle = async () => {
    setAuthError(null);
    explicitAuthFlowRef.current = true;
    setLoading(true);
    try {
      const cred = await signInWithGoogleFirebase();
      const idToken = await cred.user.getIdToken(true);
      setStoredToken(idToken);
      const profile = await ensureUserProfileInFirestore(cred.user, undefined, {
        allowAutoProvision: true,
      });
      if (!profile.active && profile.accountStatus !== 'suspended') {
        await signOutFirebase();
        setStoredToken(null);
        throw new Error('Your account has been deactivated by an administrator.');
      }
      const sessionState = await fetchServerSessionState(idToken);
      setUser(profile);
      setAuthorityApplication(sessionState.authorityApplication);
      setHasDeveloperAccess(sessionState.developerConsole);
      return profile;
    } catch (err) {
      await signOutFirebase().catch(() => undefined);
      setStoredToken(null);
      setUser(null);
      setAuthorityApplication(null);
      setHasDeveloperAccess(false);
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      setAuthError(msg);
      throw new Error(msg);
    } finally {
      explicitAuthFlowRef.current = false;
      setLoading(false);
    }
  };

  const logout = async () => {
    setAuthError(null);
    await signOutFirebase();
    setStoredToken(null);
    setUser(null);
    setAuthorityApplication(null);
    setHasDeveloperAccess(false);
  };

  const updateProfile = async (patch: { displayName?: string; wardId?: string; phone?: string }) => {
    if (!user) throw new Error('You must be signed in to update your profile.');
    const updated = await updateUserProfileInFirestore(user.uid, user.email, patch, user.role);
    setUser(updated);
    return updated;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authorityApplication,
        loading,
        hasDeveloperAccess,
        authError,
        clearAuthError,
        firebaseConnected: isFirebaseAvailable,
        loginWithEmail,
        registerCitizen,
        registerAuthorityIdentityWithEmail,
        registerAuthorityIdentityWithGoogle,
        resendVerificationEmail,
        refreshEmailVerification,
        sendPasswordReset,
        loginWithGoogle,
        logout,
        refreshProfile: syncCurrentFirebaseUser,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
