// src/lib/auth/useAuth.tsx
// ✅ VERSION: แก้ไข Permission Error สมบูรณ์
'use client'

import React, { useState, useEffect, useContext, createContext, ReactNode, useCallback } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc, FirestoreError } from 'firebase/firestore'; 
import { getToken, deleteToken, onMessage, MessagePayload } from 'firebase/messaging';
import { auth, db, messaging } from '@/lib/firebase/client';
import { Role } from '@/lib/config/workflow';

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════════════
export interface AppUser {
  id: string;
  email: string;
  role: Role;
  sites?: string[];
  status: 'ACTIVE' | 'DISABLED';
  createdFromInvitation?: boolean;
  createdAt?: Date;
  acceptedAt?: Date;
}

interface AuthContextType {
  user: AppUser | null;
  firebaseUser: User | null;
  loading: boolean;
  error: string | null;
  logout: () => Promise<void>;
  requestNotificationPermission: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  loading: true,
  error: null,
  logout: async () => {},
  requestNotificationPermission: async () => {},
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════
const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

// ═══════════════════════════════════════════════════════════════════════════
// AUTH PROVIDER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ═══════════════════════════════════════════════════════════════════════════
  // FCM TOKEN MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  const handleFCMToken = useCallback(async (uid: string, action: 'SAVE' | 'REMOVE') => {
    if (!messaging) return;

    // ✅ Desktop ไม่รับ Notification
    if (!isMobileDevice() && action === 'SAVE') {
      console.log('💻 Desktop detected: Notifications are disabled for desktop devices.');
      return;
    }

    try {
      if (action === 'SAVE') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          const currentToken = await getToken(messaging, {
            vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY 
          });
          
          if (currentToken) {
            // ใช้ setDoc + merge: true เพื่อไม่ overwrite ข้อมูลอื่น
            await setDoc(doc(db, 'users', uid), {
              fcmTokens: [currentToken], 
              lastLogin: new Date()
            }, { merge: true });

            console.log('📱 Mobile Notification Token Updated');
          }
        }
      } else if (action === 'REMOVE') {
        await deleteToken(messaging);
      }
    } catch (err) {
      console.error('FCM Token Error:', err);
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVICE WORKER REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('✅ PWA Service Worker (sw.js) registered successfully:', registration.scope);
        })
        .catch((err) => {
          console.error('❌ PWA Service Worker registration failed:', err);
        });
    }
  }, []);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FOREGROUND MESSAGE LISTENER
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (typeof window !== 'undefined' && messaging && isMobileDevice()) {
      const unsubscribe = onMessage(messaging, (payload: MessagePayload) => {
        console.log('📩 Foreground Message Received:', payload);
        const title = payload.data?.title || 'การแจ้งเตือนใหม่';
        const body = payload.data?.body || '';
        const url = payload.data?.url;

        if (Notification.permission === 'granted') {
          const notification = new Notification(title, {
            body: body,
            icon: '/favicon.ico',
          });
          notification.onclick = () => {
            if (url) window.location.href = url;
            notification.close();
          };
        }
      });
      return () => unsubscribe();
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // ✅ MAIN AUTH STATE CHANGE HANDLER (จุดสำคัญที่แก้ไข)
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;
    let isMounted = true; // ป้องกัน state update หลัง unmount

    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      // ✅ ตั้งค่าเริ่มต้น
      if (isMounted) {
        setLoading(true);
        setFirebaseUser(fbUser);
        setError(null);
      }

      // Cleanup snapshot listener ก่อนหน้า
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      // ═══════════════════════════════════════════════════════════════════════
      // กรณี: USER LOGGED IN
      // ═══════════════════════════════════════════════════════════════════════
      if (fbUser) {
        const userDocRef = doc(db, 'users', fbUser.uid);
        
        // ✅ ขั้นตอนที่ 1: ตรวจสอบและสร้าง User Document ถ้ายังไม่มี
        // สำคัญ: ต้องทำก่อน onSnapshot เพื่อป้องกัน Permission Error
        try {
          const docSnapCheck = await getDoc(userDocRef);
          
          if (!docSnapCheck.exists()) {
            console.log("📝 User doc not found, creating new one...");
            
            // สร้าง User Document ใหม่สำหรับ User ที่ Login ผ่าน Provider (Google, etc.)
            // หรือ User ที่ Document หายไป
            await setDoc(userDocRef, {
              email: fbUser.email,
              role: 'BIM' as Role, // Default role - ควรเปลี่ยนตาม Business Logic
              status: 'ACTIVE',
              sites: [], // เริ่มต้นไม่มี Site - Admin ต้องเพิ่มภายหลัง
              createdAt: new Date(),
              updatedAt: new Date(),
              fcmTokens: [],
            });
            
            console.log("✅ New user document created successfully");
          }
        } catch (err) {
          const firestoreError = err as FirestoreError;
          console.error("❌ Error checking/creating user doc:", firestoreError.code, firestoreError.message);
          
          // ถ้าเป็น Permission Error ให้แสดง Error และ Logout
          if (firestoreError.code === 'permission-denied') {
            if (isMounted) {
              setError('ไม่สามารถเข้าถึงข้อมูลผู้ใช้ได้ กรุณาติดต่อผู้ดูแลระบบ');
              setUser(null);
              setLoading(false);
            }
            // ไม่ต้อง Logout อัตโนมัติ - อาจเป็นปัญหา Rules ชั่วคราว
            return;
          }
        }

        // ✅ ขั้นตอนที่ 2: Subscribe to User Document Changes
        unsubscribeSnapshot = onSnapshot(
          userDocRef, 
          // Success callback
          (docSnap) => {
            if (!isMounted) return;
            
            if (docSnap.exists()) {
              const userData = docSnap.data();
              
              // ✅ เช็คสถานะ DISABLED
              if (userData.status === 'DISABLED') {
                console.warn("⚠️ User account is disabled");
                signOut(auth);
                setUser(null);
                setError('บัญชีของคุณถูกระงับการใช้งาน');
                setLoading(false);
                return;
              }

              // ✅ อัปเดต User State
              setUser({
                id: fbUser.uid,
                email: fbUser.email || '',
                role: userData.role,
                sites: userData.sites || [],
                status: userData.status || 'ACTIVE',
                createdFromInvitation: userData.createdFromInvitation,
                createdAt: userData.createdAt?.toDate?.() || userData.createdAt,
                acceptedAt: userData.acceptedAt?.toDate?.() || userData.acceptedAt,
              });
              setError(null);
            } else {
              // Document ไม่มีอยู่ (อาจถูกลบ)
              console.warn("⚠️ User document does not exist");
              setUser(null);
            }
            setLoading(false);
          }, 
          // Error callback
          (err: FirestoreError) => {
            if (!isMounted) return;
            
            console.error('❌ Snapshot Error:', err.code, err.message);
            
            if (err.code === 'permission-denied') {
              setError('ไม่สามารถเข้าถึงข้อมูลผู้ใช้ได้');
            } else {
              setError('เกิดข้อผิดพลาดในการโหลดข้อมูล');
            }
            
            setUser(null);
            setLoading(false);
          }
        );
        
        // ✅ Save FCM Token (async, ไม่ block)
        handleFCMToken(fbUser.uid, 'SAVE');
        
      } else {
        // ═══════════════════════════════════════════════════════════════════════
        // กรณี: USER NOT LOGGED IN
        // ═══════════════════════════════════════════════════════════════════════
        if (isMounted) {
          setUser(null);
          setError(null);
          setLoading(false);
        }
      }
    });

    // Cleanup function
    return () => {
      isMounted = false;
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, [handleFCMToken]);

  // ═══════════════════════════════════════════════════════════════════════════
  // LOGOUT FUNCTION
  // ═══════════════════════════════════════════════════════════════════════════
  const logout = useCallback(async () => {
    try {
      if (user?.id) {
        await handleFCMToken(user.id, 'REMOVE');
      }
      await signOut(auth);
      setUser(null);
      setError(null);
    } catch (err) {
      console.error('Logout error:', err);
      throw err;
    }
  }, [user?.id, handleFCMToken]);

  // ═══════════════════════════════════════════════════════════════════════════
  // REQUEST NOTIFICATION PERMISSION
  // ═══════════════════════════════════════════════════════════════════════════
  const requestNotificationPermission = useCallback(async () => {
    if (!isMobileDevice()) {
      alert('ระบบแจ้งเตือนรองรับเฉพาะการใช้งานบนโทรศัพท์มือถือเท่านั้น');
      return;
    }
    if (user?.id) {
      await handleFCMToken(user.id, 'SAVE');
      alert('เปิดรับการแจ้งเตือนเรียบร้อยแล้ว');
    }
  }, [user?.id, handleFCMToken]);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <AuthContext.Provider value={{ 
      user, 
      firebaseUser, 
      loading, 
      error, 
      logout, 
      requestNotificationPermission 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK EXPORT
// ═══════════════════════════════════════════════════════════════════════════
export function useAuth() {
  return useContext(AuthContext);
}