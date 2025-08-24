import { config } from 'dotenv';
import { resolve } from 'path';

// ✅ โหลด env ทันทีที่เข้าไฟล์นี้
config({ path: resolve(process.cwd(), '.env.local') });

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Debug: แสดงว่า env ถูกโหลดหรือไม่
console.log('🔧 Firebase Admin loading with PROJECT_ID:', process.env.FIREBASE_PROJECT_ID ? 'LOADED' : 'MISSING');

const firebaseAdminConfig = {
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
};

// Initialize admin app (singleton pattern)
export const adminApp = getApps().find(app => app.name === 'admin') || 
  initializeApp(firebaseAdminConfig, 'admin');

// Export admin services
export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);

export default adminApp;