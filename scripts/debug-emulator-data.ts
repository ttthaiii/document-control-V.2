
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Force connect to Emulator
import { connectFirestoreEmulator } from 'firebase/firestore';
connectFirestoreEmulator(db, '127.0.0.1', 8080);

async function checkData() {
    console.log('🔍 Checking Emulator Data...');

    // 1. Check a known RFA Document to get its Site ID
    console.log('\n📄 Checking RFA Documents...');
    const rfaSnap = await getDocs(collection(db, 'rfaDocuments'));
    console.log(`   Found ${rfaSnap.size} documents.`);

    const siteIdsInDocs = new Set();
    rfaSnap.forEach(doc => {
        const data = doc.data();
        siteIdsInDocs.add(data.siteId);
        console.log(`   - Doc ${doc.id}: SiteID = ${data.siteId}`);
    });

    // 2. Check User "thailungnu" (We need to find the ID first, usually email match)
    console.log('\n👤 Checking Users...');
    const usersSnap = await getDocs(collection(db, 'users'));
    let targetUser: any = null;

    usersSnap.forEach(doc => {
        const data = doc.data();
        if (data.email?.includes('thailungnu')) {
            targetUser = { id: doc.id, ...data };
        }
    });

    if (targetUser) {
        console.log(`   Found User: ${targetUser.email} (ID: ${targetUser.id})`);
        console.log(`   User Sites: ${JSON.stringify(targetUser.sites)}`);

        const hasAccess = targetUser.sites?.some((s: string) => siteIdsInDocs.has(s));
        console.log(`   ✅ Access to existing docs? ${hasAccess ? 'YES' : 'NO'}`);

        if (!hasAccess && targetUser.sites?.length > 0) {
            console.log('   ⚠️ Mismatch detected! User has sites, but none match the documents.');
        } else if (!targetUser.sites || targetUser.sites.length === 0) {
            console.log('   ⚠️ User has NO sites assigned!');
        }

    } else {
        console.log('   ❌ User "thailungnu" not found in Firestore!');
    }
}

checkData().catch(console.error);
