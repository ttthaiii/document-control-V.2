// src/lib/auth/useAuth.tsx
// ✅ VERSION: แก้ไข Error "Cannot find name 'messaging'"
'use client'

import React, { useState, useEffect, useContext, createContext, ReactNode, useCallback } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc, FirestoreError } from 'firebase/firestore';
// เพิ่ม Unsubscribe ใน import
import { getToken, deleteToken, onMessage, MessagePayload, Unsubscribe } from 'firebase/messaging';
// ใช้ getMessagingInstance แทน messaging
import { auth, db, getMessagingInstance } from '@/lib/firebase/client';
import { Role } from '@/lib/config/workflow';
import { useNotification } from '@/lib/context/NotificationContext';

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
  logout: async () => { },
  requestNotificationPermission: async () => { },
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
  const { showNotification } = useNotification();

  // ═══════════════════════════════════════════════════════════════════════════
  // FCM TOKEN MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  const handleFCMToken = useCallback(async (uid: string, action: 'SAVE' | 'REMOVE') => {
    if (!isMobileDevice()) return;

    try {
      // 1. เรียกใช้ messaging ผ่านฟังก์ชัน Async เพื่อความชัวร์
      const messaging = await getMessagingInstance();
      if (!messaging) {
        console.log('❌ FCM not supported on this device');
        return;
      }

      if (action === 'SAVE') {
        // 2. เช็ค Permission
        const currentPermission = Notification.permission;
        if (currentPermission !== 'granted') {
          console.log('⚠️ Notification permission not granted yet. Waiting for user gesture.');
          return;
        }

        // 3. ✅ iOS FIX: ต้องรอ Service Worker Ready และส่ง registration ไปให้ getToken
        let registration;
        try {
          if ('serviceWorker' in navigator) {
            registration = await navigator.serviceWorker.ready;
          }
        } catch (e) {
          console.error('❌ Service Worker not ready:', e);
        }

        // 4. ขอ Token
        const currentToken = await getToken(messaging, {
          vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: registration
        });

        if (currentToken) {
          await setDoc(doc(db, 'users', uid), {
            fcmTokens: [currentToken],
            lastLogin: new Date()
          }, { merge: true });
          console.log('✅ FCM Token Updated');
        }

      } else if (action === 'REMOVE') {
        await deleteToken(messaging);
      }
    } catch (err) {
      console.error('🔥 FCM Token Error:', err);
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVICE WORKER REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // ❌ ของเดิม: navigator.serviceWorker.register('/sw.js') 

      // ✅ แก้ไข: เปลี่ยนเป็นไฟล์ที่มีโค้ด Firebase ของเรา
      navigator.serviceWorker
        .register('/firebase-messaging-sw.js')
        .then((registration) => {
          console.log('✅ Service Worker registered:', registration.scope);
        })
        .catch((err) => {
          console.error('❌ Service Worker registration failed:', err);
        });
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // FOREGROUND MESSAGE LISTENER (แก้ไขส่วนนี้)
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    let unsubscribe: Unsubscribe | null = null;

    const setupForegroundMessaging = async () => {
      if (typeof window === 'undefined' || !isMobileDevice()) return;

      // ✅ เรียกใช้ messaging ผ่านฟังก์ชัน Async แทนตัวแปร global
      const messaging = await getMessagingInstance();

      if (messaging) {
        unsubscribe = onMessage(messaging, (payload: MessagePayload) => {
          console.log('📩 Foreground Message Received:', payload);

          // ดึงข้อมูล Title/Body (รองรับทั้ง notification และ data payload)
          const title = payload.notification?.title || payload.data?.title || 'การแจ้งเตือนใหม่';
          const body = payload.notification?.body || payload.data?.body || '';
          const url = payload.data?.url;

          if (Notification.permission === 'granted') {
            const notification = new Notification(title, {
              body: body,
              icon: '/icons/icon-192x192.png',
            });
            notification.onclick = () => {
              if (url) window.location.href = url;
              notification.close();
            };
          }
        });
      }
    };

    setupForegroundMessaging();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN AUTH STATE CHANGE HANDLER
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;
    let isMounted = true;

    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (isMounted) {
        setLoading(true);
        setFirebaseUser(fbUser);
        setError(null);
      }

      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (fbUser) {
        const userDocRef = doc(db, 'users', fbUser.uid);

        try {
          const docSnapCheck = await getDoc(userDocRef);

          if (!docSnapCheck.exists()) {
            console.log("📝 User doc not found, creating new one...");
            await setDoc(userDocRef, {
              email: fbUser.email,
              role: 'BIM' as Role,
              status: 'ACTIVE',
              sites: [],
              createdAt: new Date(),
              updatedAt: new Date(),
              fcmTokens: [],
            });
          }
        } catch (err) {
          const firestoreError = err as FirestoreError;
          console.error("❌ Error checking/creating user doc:", firestoreError.code, firestoreError.message);

          if (firestoreError.code === 'permission-denied') {
            if (isMounted) {
              setError('ไม่สามารถเข้าถึงข้อมูลผู้ใช้ได้ กรุณาติดต่อผู้ดูแลระบบ');
              setUser(null);
              setLoading(false);
            }
            return;
          }
        }

        unsubscribeSnapshot = onSnapshot(
          userDocRef,
          (docSnap) => {
            if (!isMounted) return;

            if (docSnap.exists()) {
              const userData = docSnap.data();

              if (userData.status === 'DISABLED') {
                console.warn("⚠️ User account is disabled");
                signOut(auth);
                setUser(null);
                setError('บัญชีของคุณถูกระงับการใช้งาน');
                setLoading(false);
                return;
              }

              // [DEBUG] Log user sites
              const appUserData = {
                id: fbUser.uid,
                email: fbUser.email || '',
                role: userData.role,
                sites: userData.sites || [],
                status: userData.status || 'ACTIVE',
                createdFromInvitation: userData.createdFromInvitation,
                createdAt: userData.createdAt?.toDate?.() || userData.createdAt,
                acceptedAt: userData.acceptedAt?.toDate?.() || userData.acceptedAt,
              };
              setUser(appUserData);
              setError(null);

              // --- Activity Log: บันทึก LOGIN ---
              // ป้องกันการ log ซ้ำเมื่อ refresh หน้าจอด้วย sessionStorage
              const sessionKey = `login_logged_${fbUser.uid}`;
              if (!sessionStorage.getItem(sessionKey)) {
                sessionStorage.setItem(sessionKey, 'true');
                fbUser.getIdToken().then(token => {
                  fetch('/api/activity-logs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                      action: 'LOGIN',
                      description: 'เข้าสู่ระบบ',
                    }),
                  }).catch(() => {}); // silent fail
                }).catch(() => {});
              }
            } else {
              console.warn("⚠️ User document does not exist");
              setUser(null);
            }
            setLoading(false);
          },
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

        handleFCMToken(fbUser.uid, 'SAVE');

      } else {
        if (isMounted) {
          setUser(null);
          setError(null);
          setLoading(false);
        }
      }
    });

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
        sessionStorage.removeItem(`login_logged_${user.id}`);
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
      showNotification('warning', 'คำเตือน', 'ระบบแจ้งเตือนรองรับเฉพาะการใช้งานบนโทรศัพท์มือถือเท่านั้น');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        if (user?.id) {
          await handleFCMToken(user.id, 'SAVE');
          showNotification('success', 'สำเร็จ', 'เปิดรับการแจ้งเตือนเรียบร้อยแล้ว');
        }
      } else {
        showNotification('error', 'ข้อผิดพลาด', 'คุณไม่อนุญาตให้แจ้งเตือน กรุณาไปตั้งค่าที่ Settings ของมือถือ');
      }
    } catch (error) {
      console.error('Request Permission Error:', error);
      showNotification('error', 'เกิดข้อผิดพลาด', 'เกิดข้อผิดพลาดในการขอสิทธิ์');
    }
  }, [user?.id, handleFCMToken, showNotification]);

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