// src/lib/auth/useAuth.ts

'use client'

import React, { useState, useEffect, useContext, createContext, ReactNode } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/client';

// Cache interface
interface UserCache {
  user: AppUser | null;
  timestamp: number;
  firebaseUserId: string;
}

// Cache variables
let userCache: UserCache | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 นาที

// User interface for our app
interface AppUser {
  id: string;
  email: string;
  role: 'BIM' | 'Site Admin' | 'CM' | 'Admin' | 'ME' | 'SN';
  sites?: string[];
  status: 'ACTIVE' | 'DISABLED';
  createdFromInvitation?: boolean;
  createdAt?: Date;
  acceptedAt?: Date;
}

// Auth context interface
interface AuthContextType {
  user: AppUser | null;
  firebaseUser: User | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  logout: () => Promise<void>;
}

// Create context with a default value
const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  loading: true,
  error: null,
  refetch: async () => {},
  logout: async () => {},
});

// Auth Provider component
export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserData = async (currentFirebaseUser: User) => {
    try {
      setError(null);
      
      // ✅ ตรวจสอบ cache ก่อน
      if (userCache && 
          userCache.firebaseUserId === currentFirebaseUser.uid &&
          (Date.now() - userCache.timestamp) < CACHE_DURATION) {
        console.log(`📋 Using cached user data for: ${currentFirebaseUser.email}`);
        setUser(userCache.user);
        return;
      }

      console.log(`🔄 Fetching fresh user data for: ${currentFirebaseUser.email}`);
      
      const userDocRef = doc(db, 'users', currentFirebaseUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const appUser: AppUser = {
          id: currentFirebaseUser.uid,
          email: currentFirebaseUser.email || '',
          role: userData.role,
          sites: userData.sites || [],
          status: userData.status || 'ACTIVE',
          createdFromInvitation: userData.createdFromInvitation,
          createdAt: userData.createdAt?.toDate(),
          acceptedAt: userData.acceptedAt?.toDate(),
        };
        
        // ✅ บันทึกลง cache
        userCache = {
          user: appUser,
          timestamp: Date.now(),
          firebaseUserId: currentFirebaseUser.uid
        };
        
        setUser(appUser);
      } else {
        setError('ไม่พบข้อมูลผู้ใช้ในระบบ');
        setUser(null);
      }
    } catch (err) {
      console.error('Error fetching user data:', err);
      setError('เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ใช้');
      setUser(null);
    }
  };

  const refetch = async () => {
    if (firebaseUser) {
      // ล้าง cache ก่อน refetch
      userCache = null;
      await fetchUserData(firebaseUser);
    }
  };

  useEffect(() => {
    // ใน useEffect หลังจากบรรทัด setLoading(true)
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      // ✅ เพิ่ม: ถ้าไม่มี user เปลี่ยนแปลง ไม่ต้อง setLoading
      if (fbUser?.uid === firebaseUser?.uid && user) {
        return; // Skip ถ้า user เดิม
      }
      
      setLoading(true);
      setFirebaseUser(fbUser);
      
      if (fbUser) {
        await fetchUserData(fbUser);
      } else {
        setUser(null);
        setError(null);
        userCache = null; // ✅ เพิ่มบรรทัดนี้
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
      // ✅ ล้าง cache เมื่อ logout
      userCache = null;
      setUser(null);
      setFirebaseUser(null);
      setError(null);
    } catch (err) {
      console.error('Logout error:', err);
      throw err;
    }
  };

  const value = {
    user,
    firebaseUser,
    loading,
    error,
    refetch,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ✅ เพิ่ม utility functions
export function clearUserCache() {
  userCache = null;
  console.log('🗑️ User cache cleared');
}

export function getCacheInfo() {
  return {
    hasCache: !!userCache,
    cacheAge: userCache ? Date.now() - userCache.timestamp : 0,
    cachedUserId: userCache?.firebaseUserId || null,
    isExpired: userCache ? (Date.now() - userCache.timestamp) > CACHE_DURATION : true
  };
}

// Hook to use auth context
export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}