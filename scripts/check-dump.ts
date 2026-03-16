import fs from 'fs';
import path from 'path';
import url from 'url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function checkDump() {
    const dumpPath = path.resolve(__dirname, '../firestore-dump.json');
    if (!fs.existsSync(dumpPath)) {
        console.log('Dump file not found');
        return;
    }
    const data = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
    const rfaDocs = data.rfaDocuments || {};
    let recoverCount = 0;

    // Count how many rfaDocuments in the dump were created by the admin UID
    for (const [docId, docData] of Object.entries(rfaDocs)) {
        if (docData.createdBy === 'iDfR6WhteDV0O14sNAVwO70vYIz2') {
            recoverCount++;
            console.log('Found doc:', docData.documentNumber);
        }
    }

    console.log(`Found ${recoverCount} documents in firestore-dump.json created by Admin UID.`);
}

checkDump();
