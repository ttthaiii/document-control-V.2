// src/lib/auth/useAuth.tsx
'use client'

import React, { useState, useEffect, useContext, createContext, ReactNode } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
// ✅ แก้ไข: เพิ่ม getDoc เข้าไปใน import แล้ว
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore'; 
import { getToken, deleteToken, onMessage, MessagePayload } from 'firebase/messaging';
import { auth, db, messaging } from '@/lib/firebase/client';
import { Role } from '@/lib/config/workflow';

// ... (Interfaces เหมือนเดิม) ...
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

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ฟังก์ชันจัดการ FCM Token
  const handleFCMToken = async (uid: string, action: 'SAVE' | 'REMOVE') => {
    if (!messaging) return;

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
            // ใช้ setDoc + merge: true เพื่อสร้างเอกสารใหม่ถ้ายังไม่มี
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
  };

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
  
  // ส่วนรับข้อความ Foreground
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

  // ส่วน Auth State Change
  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      setLoading(true);
      setFirebaseUser(fbUser);

      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (fbUser) {
        const userDocRef = doc(db, 'users', fbUser.uid);
        
        // ✅ เพิ่ม Logic: เช็คก่อนว่ามี Doc ไหม ถ้าไม่มีให้สร้างทันที ก่อนจะเริ่ม Listen
        // วิธีนี้ช่วยแก้ปัญหา Permission Error ได้ชะงัดที่สุด
        try {
            const docSnapCheck = await getDoc(userDocRef);
            if (!docSnapCheck.exists()) {
                console.log("User doc not found, creating new one...");
                await setDoc(userDocRef, {
                    email: fbUser.email,
                    role: 'BIM', // กำหนด Role เริ่มต้น (อาจเปลี่ยนได้ตาม Logic ของคุณ)
                    status: 'ACTIVE',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    fcmTokens: [],
                }, { merge: true });
            }
        } catch (err) {
            console.error("Error checking/creating user doc:", err);
        }

        unsubscribeSnapshot = onSnapshot(userDocRef, 
          (docSnap) => {
            if (docSnap.exists()) {
              const userData = docSnap.data();
              if (userData.status === 'DISABLED') {
                signOut(auth);
                setUser(null);
                setError('บัญชีของคุณถูกระงับการใช้งาน');
                return;
              }
              setUser({
                id: fbUser.uid,
                email: fbUser.email || '',
                role: userData.role,
                sites: userData.sites || [],
                status: userData.status || 'ACTIVE',
                createdFromInvitation: userData.createdFromInvitation,
                createdAt: userData.createdAt?.toDate(),
                acceptedAt: userData.acceptedAt?.toDate(),
              });
            } else {
              setUser(null);
            }
            setLoading(false);
          }, 
          (err) => {
            console.error('Snapshot Error:', err);
            // ถ้า Error ลองพยายามสร้างใหม่อีกครั้ง (เผื่อกรณี Race condition)
            handleFCMToken(fbUser.uid, 'SAVE');
            setLoading(false);
          }
        );
        
        handleFCMToken(fbUser.uid, 'SAVE');
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  const logout = async () => {
    try {
      if (user?.id) {
        await handleFCMToken(user.id, 'REMOVE');
      }
      await signOut(auth);
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
      throw err;
    }
  };

  const requestNotificationPermission = async () => {
    if (!isMobileDevice()) {
        alert('ระบบแจ้งเตือนรองรับเฉพาะการใช้งานบนโทรศัพท์มือถือเท่านั้น');
        return;
    }
    if (user?.id) {
      await handleFCMToken(user.id, 'SAVE');
      alert('เปิดรับการแจ้งเตือนเรียบร้อยแล้ว');
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, firebaseUser, loading, error, logout, requestNotificationPermission 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}