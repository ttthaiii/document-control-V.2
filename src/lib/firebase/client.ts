// src/lib/firebase/client.ts (โค้ดฉบับสมบูรณ์)
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
// v 1. Import ฟังก์ชันที่จำเป็นเพิ่มเข้ามา
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// v 2. เพิ่มโค้ดส่วนนี้ทั้งหมดเข้าไปเพื่อเปิดใช้งาน Cache แบบถาวร
try {
  enableIndexedDbPersistence(db)
    .then(() => {
      console.log("✅ Firestore offline persistence enabled.");
    })
    .catch((err) => {
      if (err.code == 'failed-precondition') {
        // เกิดขึ้นเมื่อผู้ใช้เปิดเว็บไว้หลายแท็บพร้อมกัน
        console.warn("Firestore persistence failed: Multiple tabs open. Persistence will be enabled in one tab only.");
      } else if (err.code == 'unimplemented') {
        // เกิดขึ้นเมื่อเบราว์เซอร์ไม่รองรับ
        console.warn("Firestore persistence is not supported in this browser.");
      }
    });
} catch (error) {
    console.error("An error occurred while enabling Firestore persistence:", error);
}