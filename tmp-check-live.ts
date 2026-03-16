const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());

import { adminDb } from './src/lib/firebase/admin';

async function check() {
    const snapshot = await adminDb.collection('rfaDocuments').get();
    let withSpaces = 0;
    let total = 0;
    let examples = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        const docNum = data.documentNumber;
        if (docNum) {
            total++;
            if (docNum !== docNum.trim()) {
                withSpaces++;
                examples.push(`"${docNum}" (ID: ${doc.id})`);
            }
        }
    });

    console.log(`\n================================`);
    console.log(`Total RFA documents checked: ${total}`);
    console.log(`Documents with trailing/leading spaces: ${withSpaces}`);
    if (examples.length > 0) {
        console.log(`\nExamples of bad document numbers:\n${examples.slice(0, 20).join('\n')}`);
    }
    console.log(`================================\n`);
}

check().catch(console.error).finally(() => process.exit(0));
