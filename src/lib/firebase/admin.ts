// src/lib/firebase/admin.ts (Final Corrected Version)
import * as admin from "firebase-admin";

// Set Emulator Env Vars if enabled
if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
  console.log('🔧 Admin SDK switched to Emulator mode');
}

// --- Helper Functions to ensure apps are initialized only once ---
const initializeAppOnce = (name: string, config: admin.AppOptions): admin.app.App => {
  return admin.apps.find(app => app?.name === name) || admin.initializeApp(config, name);
};

// --- App Getters (Lazy Initialization) ---

const getTtsdocApp = () => {
  const config = {
    credential: admin.credential.cert({
      projectId: process.env.TTSDOC_PROJECT_ID,
      clientEmail: process.env.TTSDOC_CLIENT_EMAIL,
      privateKey: process.env.TTSDOC_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  };
  return initializeAppOnce('ttsdoc-v2', config);
};

const getBimTrackingApp = () => {
  const config = {
    credential: admin.credential.cert({
      projectId: process.env.BIM_TRACKING_PROJECT_ID,
      clientEmail: process.env.BIM_TRACKING_CLIENT_EMAIL,
      privateKey: process.env.BIM_TRACKING_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  };
  return initializeAppOnce('bim-tracking', config);
};


// --- Main Exports ---
export const adminDb = getTtsdocApp().firestore();
export const adminAuth = getTtsdocApp().auth();
export const adminBucket = getTtsdocApp().storage().bucket();
export const adminMessaging = getTtsdocApp().messaging();

// Temporarily remove FIRESTORE_EMULATOR_HOST to force BIM Tracking to use production
const originalFirestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
if (originalFirestoreHost) {
  delete process.env.FIRESTORE_EMULATOR_HOST;
}

export const bimTrackingDb = getBimTrackingApp().firestore();

// Restore FIRESTORE_EMULATOR_HOST for other operations
if (originalFirestoreHost) {
  process.env.FIRESTORE_EMULATOR_HOST = originalFirestoreHost;
}

// Getter functions for lazy initialization in other server-side files if needed
export const getAdminDb = () => adminDb;
export const getAdminAuth = () => adminAuth;
export const getAdminBucket = () => adminBucket;
export const getBimTrackingDb = () => bimTrackingDb;