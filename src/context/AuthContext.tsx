import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { UserProfile } from '../shared/types';
import { setStoredToken } from '../services/apiClient';
import {
  auth,
  ensureUserProfileInFirestore,
  isFirebaseAvailable,
  registerWithEmailFirebase,
  resetPasswordFirebase,
  signInWithEmailFirebase,
  signInWithGoogleFirebase,
  signOutFirebase,
  updateUserProfileInFirestore,
} from '../services/firebaseClient';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  firebaseConnected: boolean;
  loginWithEmail: (email: string, password: string) => Promise<UserProfile>;
  registerCitizen: (input: {
    email: string;
    password: string;
    displayName: string;
    wardId?: string;
    phone?: string;
  }) => Promise<UserProfile>;
  sendPasswordReset: (email: string) => Promise<void>;
  loginWithGoogle: () => Promise<UserProfile>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: { displayName?: string; wardId?: string; phone?: string }) => Promise<UserProfile>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const syncCurrentFirebaseUser = useCallback(async () => {
    if (!auth?.currentUser) {
      setStoredToken(null);
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const idToken = await auth.currentUser.getIdToken();
      setStoredToken(idToken);
      const profile = await ensureUserProfileInFirestore(auth.currentUser);
      if (!profile.active) {
        await signOutFirebase();
        setStoredToken(null);
        setUser(null);
      } else {
        setUser(profile);
      }
    } catch {
      setUser(null);
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
      if (!fbUser) {
        setStoredToken(null);
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const idToken = await fbUser.getIdToken();
        setStoredToken(idToken);
        const profile = await ensureUserProfileInFirestore(fbUser);
        if (!profile.active) {
          await signOutFirebase();
          setStoredToken(null);
          setUser(null);
        } else {
          setUser(profile);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const loginWithEmail = async (email: string, password: string) => {
    const cred = await signInWithEmailFirebase(email, password);
    const idToken = await cred.user.getIdToken();
    setStoredToken(idToken);
    const profile = await ensureUserProfileInFirestore(cred.user);
    if (!profile.active) {
      await signOutFirebase();
      setStoredToken(null);
      throw new Error('This account has been deactivated by an administrator.');
    }
    setUser(profile);
    return profile;
  };

  const registerCitizen = async (input: {
    email: string;
    password: string;
    displayName: string;
    wardId?: string;
    phone?: string;
  }) => {
    const cred = await registerWithEmailFirebase(input.email, input.password, input.displayName);
    const idToken = await cred.user.getIdToken();
    setStoredToken(idToken);
    const profile = await ensureUserProfileInFirestore(cred.user, {
      displayName: input.displayName,
      wardId: input.wardId,
      phone: input.phone,
    });
    setUser(profile);
    return profile;
  };

  const sendPasswordReset = async (email: string) => {
    await resetPasswordFirebase(email);
  };

  const loginWithGoogle = async () => {
    const cred = await signInWithGoogleFirebase();
    const idToken = await cred.user.getIdToken();
    setStoredToken(idToken);
    const profile = await ensureUserProfileInFirestore(cred.user);
    if (!profile.active) {
      await signOutFirebase();
      setStoredToken(null);
      throw new Error('This account has been deactivated by an administrator.');
    }
    setUser(profile);
    return profile;
  };

  const logout = async () => {
    await signOutFirebase();
    setStoredToken(null);
    setUser(null);
  };

  const updateProfile = async (patch: { displayName?: string; wardId?: string; phone?: string }) => {
    if (!user) throw new Error('You must be signed in to update your profile.');
    const updated = await updateUserProfileInFirestore(user.uid, user.email, patch);
    setUser(updated);
    return updated;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        firebaseConnected: isFirebaseAvailable,
        loginWithEmail,
        registerCitizen,
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
