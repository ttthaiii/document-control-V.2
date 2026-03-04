import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getMessaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'asia-southeast1');

// Connect to Emulators if running locally and env var is set
if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  console.log('🔗 Connecting to Firebase Emulators...');
  // auth
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  // firestore
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  // storage
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  // functions
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

// ✅ แก้ไข: สร้างฟังก์ชันเพื่อดึง Messaging instance แทนการ export ตัวแปรโดยตรง
// วิธีนี้จะป้องกันค่า null เวลาเครื่องยังโหลดไม่เสร็จ
export const getMessagingInstance = async () => {
  try {
    if (typeof window !== 'undefined') {
      const supported = await isSupported();
      if (supported) {
        return getMessaging(app);
      }
    }
  } catch (err) {
    console.error('Error checking messaging support:', err);
  }
  return null;
};
/*
// Enable Offline Persistence
try {
  if (typeof window !== 'undefined') {
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code === 'failed-precondition') {
            console.warn('Multiple tabs open, persistence can only be enabled in one tab at a a time.');
        } else if (err.code === 'unimplemented') {
            console.warn('The current browser does not support all of the features required to enable persistence');
        }
    });
  }
} catch (error) {
    console.error("An error occurred while enabling Firestore persistence:", error);
}
*/