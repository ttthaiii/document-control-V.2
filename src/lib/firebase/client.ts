import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
// 1. Import Messaging และ isSupported
import { getMessaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize App (ใช้ getApp เพื่อความชัวร์ว่าไม่ init ซ้ำ)
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// 2. Export messaging แบบปลอดภัย (เช็คว่ารันบน Browser หรือไม่)
let messaging: any = null;

if (typeof window !== 'undefined') {
  // เช็คว่า Browser รองรับ Service Worker และ Push API หรือไม่
  isSupported().then((supported) => {
    if (supported) {
      messaging = getMessaging(app);
    }
  });
}

// Enable Offline Persistence
try {
  if (typeof window !== 'undefined') {
    enableIndexedDbPersistence(db)
      .then(() => {
        console.log("✅ Firestore offline persistence enabled.");
      })
      .catch((err) => {
        if (err.code == 'failed-precondition') {
          console.warn("Firestore persistence failed: Multiple tabs open.");
        } else if (err.code == 'unimplemented') {
          console.warn("Firestore persistence is not supported in this browser.");
        }
      });
  }
} catch (error) {
    console.error("An error occurred while enabling Firestore persistence:", error);
}

// Export ตัว messaging ออกไปให้ไฟล์อื่นใช้
export { messaging };