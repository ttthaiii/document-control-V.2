import * as admin from "firebase-admin";

// --- Helper Functions ---
const getApp = (name: string, configObj: admin.AppOptions) => {
  return admin.apps.find(app => app?.name === name) || admin.initializeApp(configObj, name);
};

// --- Initialize Apps ---
let memoizedAdminDb: admin.firestore.Firestore;
let memoizedBimTrackingDb: admin.firestore.Firestore;

export const getAdminDb = () => {
  if (memoizedAdminDb) return memoizedAdminDb;

  const ttsdocConfig = {
    credential: admin.credential.cert({
      project_id: process.env.TTSDOC_PROJECT_ID,
      client_email: process.env.TTSDOC_CLIENT_EMAIL,
      private_key: process.env.TTSDOC_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    } as admin.ServiceAccount),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  };

  const app = getApp('ttsdoc-v2', ttsdocConfig);
  memoizedAdminDb = app.firestore();
  return memoizedAdminDb;
};

export const getBimTrackingDb = () => {
  if (memoizedBimTrackingDb) return memoizedBimTrackingDb;

  const bimTrackingConfig = {
    credential: admin.credential.cert({
      project_id: process.env.BIM_TRACKING_PROJECT_ID,
      client_email: process.env.BIM_TRACKING_CLIENT_EMAIL,
      private_key: process.env.BIM_TRACKING_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    } as admin.ServiceAccount),
  };
  
  const app = getApp('bim-tracking', bimTrackingConfig);
  memoizedBimTrackingDb = app.firestore();
  return memoizedBimTrackingDb;
};

// Export default สำหรับใช้งานทั่วไป
export default getAdminDb;