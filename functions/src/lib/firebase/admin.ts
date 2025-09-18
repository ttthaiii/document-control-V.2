import * as admin from "firebase-admin";

// --- Helper Functions ---
const getApp = (name: string, configObj: admin.AppOptions) => {
  return admin.apps.find(app => app?.name === name) || admin.initializeApp(configObj, name);
};

// ตรวจสอบว่าตอนนี้โค้ดกำลังรันบน Cloud Functions หรือไม่
const isDeployed = process.env.FUNCTIONS_EMULATOR !== 'true' && process.env.NODE_ENV === 'production';

// --- Initialize Apps ---
let memoizedAdminDb: admin.firestore.Firestore;
let memoizedBimTrackingDb: admin.firestore.Firestore;

export const getAdminDb = () => {
  if (memoizedAdminDb) return memoizedAdminDb;

  const ttsdocConfig = {
    credential: admin.credential.cert({
      project_id: isDeployed ? process.env.TTSDOC_PROJECT_ID : process.env.TTSDOC_PROJECT_ID,
      client_email: isDeployed ? process.env.TTSDOC_CLIENT_EMAIL : process.env.TTSDOC_CLIENT_EMAIL,
      // 🔽 ถ้า Deploy แล้ว ให้ใช้ Secret, ถ้าทดสอบในเครื่อง ให้ใช้ค่า Raw 🔽
      private_key: (isDeployed ? process.env.TTSDOC_PRIVATE_KEY : process.env.TTSDOC_PRIVATE_KEY_RAW)?.replace(/\\n/g, "\n"),
    } as admin.ServiceAccount),
    storageBucket: isDeployed ? process.env.TTSDOC_STORAGE_BUCKET : process.env.TTSDOC_STORAGE_BUCKET,
  };

  const app = getApp('ttsdoc-v2', ttsdocConfig);
  memoizedAdminDb = app.firestore();
  return memoizedAdminDb;
};

export const getBimTrackingDb = () => {
  if (memoizedBimTrackingDb) return memoizedBimTrackingDb;

  const bimTrackingConfig = {
    credential: admin.credential.cert({
      project_id: isDeployed ? process.env.BIM_TRACKING_PROJECT_ID : process.env.BIM_TRACKING_PROJECT_ID,
      client_email: isDeployed ? process.env.BIM_TRACKING_CLIENT_EMAIL : process.env.BIM_TRACKING_CLIENT_EMAIL,
      // 🔽 ถ้า Deploy แล้ว ให้ใช้ Secret, ถ้าทดสอบในเครื่อง ให้ใช้ค่า Raw 🔽
      private_key: (isDeployed ? process.env.BIM_TRACKING_PRIVATE_KEY : process.env.BIM_TRACKING_PRIVATE_KEY_RAW)?.replace(/\\n/g, "\n"),
    } as admin.ServiceAccount),
  };
  
  const app = getApp('bim-tracking', bimTrackingConfig);
  memoizedBimTrackingDb = app.firestore();
  return memoizedBimTrackingDb;
};