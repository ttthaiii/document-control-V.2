import admin from "firebase-admin";

// --- Config for Project 1: ttsdoc-v2 (Document System) ---
const ttsdocConfig = {
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
};

// --- Config for Project 2: BIM-Tracking (Task System) ---
const bimTrackingConfig = {
  credential: admin.credential.cert({
    projectId: process.env.BIM_TRACKING_PROJECT_ID,
    clientEmail: process.env.BIM_TRACKING_CLIENT_EMAIL,
    privateKey: process.env.BIM_TRACKING_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
};

// --- Initialize Apps ---
// ตั้งชื่อแอปพลิเคชันเพื่อแยกการเชื่อมต่อ
const ttsdocApp = admin.apps.find(app => app?.name === 'ttsdoc-v2') 
  || admin.initializeApp(ttsdocConfig, 'ttsdoc-v2');

const bimTrackingApp = admin.apps.find(app => app?.name === 'bim-tracking') 
  || admin.initializeApp(bimTrackingConfig, 'bim-tracking');


// --- Exports for Project 1: ttsdoc-v2 ---
export const adminDb = ttsdocApp.firestore();
export const adminAuth = ttsdocApp.auth();
export const adminBucket = ttsdocApp.storage().bucket();

// --- Exports for Project 2: BIM-Tracking ---
export const bimTrackingDb = bimTrackingApp.firestore();