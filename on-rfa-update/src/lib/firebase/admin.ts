// src/lib/firebase/admin.ts (Final Corrected Version)
import * as admin from "firebase-admin";

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
// We only export the getter functions.
// This prevents any Firebase App initialization when the file is first loaded.

export const getAdminDb = () => getTtsdocApp().firestore();
export const getBimTrackingDb = () => getBimTrackingApp().firestore();