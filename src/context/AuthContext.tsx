import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { ADMIN_BOOTSTRAP_EMAIL, auth, googleProvider } from '../lib/firebase';
import { firestoreRepo } from '../lib/firestoreRepo';
import type { PrivateUser, PublicProfile } from '../types/domain';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: PublicProfile | null;
  privateUser: PrivateUser | null;
  loading: boolean;
  isAdmin: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  firebaseUser: null,
  profile: null,
  privateUser: null,
  loading: true,
  isAdmin: false,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [privateUser, setPrivateUser] = useState<PrivateUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAccount = useCallback(async (user: User | null) => {
    if (!user) {
      setProfile(null);
      setPrivateUser(null);
      setLoading(false);
      return;
    }
    try {
      if (user.emailVerified && user.email) {
        const ensured = await firestoreRepo.ensureUserAccount(
          user.uid,
          user.email,
          user.displayName || user.email.split('@')[0],
          user.photoURL || ''
        );
        setProfile(ensured.profile);
        setPrivateUser(ensured.privateUser);
      }
    } catch (err) {
      console.error('Failed to load SOUL HUB profile:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      void loadAccount(user);
    });
    return () => unsub();
  }, [loadAccount]);

  const signInWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setProfile(null);
    setPrivateUser(null);
  };

  const refreshProfile = async () => {
    if (firebaseUser) {
      await loadAccount(firebaseUser);
    }
  };

  const isAdmin = Boolean(
    firebaseUser?.emailVerified && firebaseUser.email === ADMIN_BOOTSTRAP_EMAIL
  );

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        privateUser,
        loading,
        isAdmin,
        signInWithGoogle,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
