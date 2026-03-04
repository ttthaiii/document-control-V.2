import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

if (!getApps().length) {

    initializeApp({
        credential: cert({
            projectId: process.env.BIM_TRACKING_PROJECT_ID,
            clientEmail: process.env.BIM_TRACKING_CLIENT_EMAIL,
            privateKey: process.env.BIM_TRACKING_PRIVATE_KEY?.replace(/\\n/g, '\n')
        })
    }, 'bim-tracking');
}

const bimTrackingApp = getApps().find(app => app.name === 'bim-tracking')!;
const bimTrackingDb = getFirestore(bimTrackingApp);

async function main() {
    const snapshot = await bimTrackingDb.collection('relateWorks').get();
    console.log(`Found ${snapshot.size} documents in relateWorks`);
    snapshot.forEach(doc => {
        console.log(doc.id, '=>', doc.data().activityName);
    });
}
main().catch(console.error);
