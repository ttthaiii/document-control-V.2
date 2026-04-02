import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// โหลด Environment Variables จาก .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.TTSDOC_PROJECT_ID,
            clientEmail: process.env.TTSDOC_CLIENT_EMAIL,
            privateKey: process.env.TTSDOC_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        })
    });
}

const db = admin.firestore();

async function checkDoc() {
    const TARGET = 'RFA-SHOP-ESNKR3-0080';
    console.log(`\n🔍 Searching Firestore for "${TARGET}"...\n`);

    const snapshot = await db.collection('rfaDocuments')
        .where('runningNumber', '==', TARGET)
        .get();

    if (snapshot.empty) {
        console.log('❌ ไม่พบเอกสารนี้ในฐานข้อมูล');
        process.exit(0);
    }

    const docs: any[] = [];
    snapshot.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));

    // เรียงตาม Rev
    docs.sort((a, b) => (a.revisionNumber || 0) - (b.revisionNumber || 0));

    for (const d of docs) {
        console.log(`========== Rev.${d.revisionNumber} ==========`);
        console.log(`docId             : ${d.id}`);
        console.log(`taskUid           : ${d.taskData?.taskUid || '-'}`);
        console.log(`previousRevisionId: ${d.previousRevisionId || '-'}`);
        console.log(`workflow Steps    : ${(d.workflow || []).length} steps`);
        if ((d.workflow || []).length > 0) {
            console.log(`\n--- Workflow History for Rev.${d.revisionNumber} ---`);
            d.workflow.forEach((w: any, index: number) => {
                console.log(`  ${index + 1}. [Rev.${w.revisionNumber ?? '?'}] ${w.action || w.status} (by ${w.userName || w.userId})`);
            });
        }
        console.log('\n----------------------------------------\n');
    }
}

checkDoc().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
