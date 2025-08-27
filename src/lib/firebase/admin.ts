import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    // ใช้ bucket ดีฟอลต์ของโปรเจ็กต์
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    // ถ้าอยากซ่อนค่าฝั่ง server เท่านั้น ให้ใช้ตัวแปรเช่น FIREBASE_STORAGE_BUCKET แทน
    // แล้วเปลี่ยนเป็น: storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
// export bucket instance ที่พร้อมใช้งานเลย
export const adminBucket = admin.storage().bucket();
