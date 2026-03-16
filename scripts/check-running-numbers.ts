import * as admin from 'firebase-admin';
import * as path from 'path';

// @ts-ignore
import serviceAccount from '../migrate/serviceAccountKey.json';

if (!admin.apps.length) {
    admin.initializeApp({
        // @ts-ignore
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkRunningNumbers() {
    console.log('Fetching documents for site 2u5Sn5xKysew0sC8yxbw...');
    const snapshot = await db.collection('rfaDocuments').where('siteId', '==', '2u5Sn5xKysew0sC8yxbw').get();

    const docs: { runNum: string, docNum: string }[] = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.runningNumber && data.runningNumber.startsWith('RFA-SHOP-VH-')) {
            docs.push({
                runNum: data.runningNumber,
                docNum: data.documentNumber
            });
        }
    });

    docs.sort((a, b) => {
        const numA = parseInt(a.runNum.replace('RFA-SHOP-VH-', ''), 10);
        const numB = parseInt(b.runNum.replace('RFA-SHOP-VH-', ''), 10);
        return numA - numB;
    });

    console.log(`Found ${docs.length} documents with RFA-SHOP-VH- prefix`);
    if (docs.length > 0) {
        console.log(`Lowest: ${docs[0].runNum} (${docs[0].docNum})`);
        console.log(`Highest: ${docs[docs.length - 1].runNum} (${docs[docs.length - 1].docNum})`);

        // Find gaps
        const gaps: number[] = [];
        let expected = parseInt(docs[0].runNum.replace('RFA-SHOP-VH-', ''), 10);

        for (const doc of docs) {
            const current = parseInt(doc.runNum.replace('RFA-SHOP-VH-', ''), 10);
            while (expected < current) {
                gaps.push(expected);
                expected++;
            }
            expected = current + 1;
        }

        if (gaps.length > 0) {
            console.log(`Found ${gaps.length} missing numbers in the sequence!`);
            console.log(`First 20 missing:`, gaps.slice(0, 20).map(n => `RFA-SHOP-VH-${String(n).padStart(4, '0')}`).join(', '));
        } else {
            console.log('No gaps found in the sequence.');
        }
    }
}

checkRunningNumbers().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
