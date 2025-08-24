// scripts/test-firebase.ts - FIXED VERSION
import { config } from 'dotenv';
import { resolve } from 'path';

// ✅ CRITICAL: Load .env.local BEFORE importing Firebase
console.log('🔍 Loading environment variables...');
config({ path: resolve(process.cwd(), '.env.local') });

// Debug environment variables
console.log('PROJECT_ID:', process.env.FIREBASE_PROJECT_ID ? 'LOADED' : 'MISSING');
console.log('CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL ? 'LOADED' : 'MISSING'); 
console.log('PRIVATE_KEY:', process.env.FIREBASE_PRIVATE_KEY ? 'LOADED' : 'MISSING');

if (!process.env.FIREBASE_PROJECT_ID) {
  console.error('❌ FIREBASE_PROJECT_ID is missing from environment');
  process.exit(1);
}

// NOW import Firebase (after env vars loaded)
import { adminAuth, adminDb } from '../src/lib/firebase/admin';

async function testFirebaseConnection() {
  console.log('\n🚀 Testing Firebase Admin SDK connection...\n');

  try {
    // Test Firestore
    console.log('📊 Testing Firestore connection...');
    await adminDb.collection('test').doc('connection').set({
      message: 'Firebase connected!',
      timestamp: new Date(),
      testId: Math.random().toString(36).substring(7)
    });
    console.log('✅ Firestore: Connection successful');

    // Test Auth
    console.log('🔐 Testing Authentication service...');
    const users = await adminAuth.listUsers(1);
    console.log('✅ Auth: Connection successful');
    console.log(`📊 Users: ${users.users.length}`);

    // Test read
    console.log('📖 Testing document read...');
    const doc = await adminDb.collection('test').doc('connection').get();
    if (doc.exists) {
      console.log('✅ Read successful:', doc.data()?.message);
    }

    console.log('\n🎉 All tests passed! Firebase is working!');

  } catch (error) {
    console.error('❌ Firebase test failed:', error);
  }
}

testFirebaseConnection();