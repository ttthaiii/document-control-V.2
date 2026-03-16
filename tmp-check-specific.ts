const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());

import { adminDb } from './src/lib/firebase/admin';

async function checkSpecificDocs() {
    const snapshot = await adminDb.collection('rfaDocuments')
        .where('documentNumber', '>=', 'VLH-TTS-DPM-MAT-AR')
        .where('documentNumber', '<=', 'VLH-TTS-DPM-MAT-AR\uf8ff')
        .get();

    console.log(`Found ${snapshot.size} MAT-AR documents...`);

    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.documentNumber.includes('039') || data.documentNumber.includes('007') || data.documentNumber.includes('032')) {
            console.log(`\nDoc ID: ${doc.id}`);
            console.log(`Doc Number: "${data.documentNumber}"`);
            if (data.files && data.files.length > 0) {
                console.log(`First File URL: ${data.files[0].fileUrl}`);
                console.log(`First File Path: ${data.files[0].filePath}`);
            }

            if (data.workflow && data.workflow.length > 0) {
                const latestFiles = data.workflow.slice().reverse().find((step: any) => step.files && step.files.length > 0)?.files;
                if (latestFiles && latestFiles.length > 0) {
                    console.log(`Latest Workflow File URL: ${latestFiles[0].fileUrl}`);
                    console.log(`Latest Workflow File Path: ${latestFiles[0].filePath}`);
                }
            }
        }
    });
}

checkSpecificDocs().catch(console.error);
