const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());

import { adminDb } from './src/lib/firebase/admin';

async function revert039() {
    console.log("Looking for MAT-AR-039...");

    const snapshot = await adminDb.collection('rfaDocuments')
        .where('documentNumber', '==', 'VLH-TTS-DPM-MAT-AR-039')
        .get();

    if (snapshot.empty) {
        console.log("Could not find document VLH-TTS-DPM-MAT-AR-039");
        return;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    console.log(`Found DOC ID: ${doc.id}`);

    const updatePayload: any = {
        status: 'REJECTED',
        currentStep: 'REJECTED',
        // Special flag to tell our Cloud Function (onRfaUpdate) to SKIP sending LINE notification.
        // Our Cloud Function has this line: if (newData?.isMigration === true) { logger.log(...skipped) }
        isMigration: true
    };

    if (data.workflow && data.workflow.length > 0) {
        // Modify the last workflow item back to REJECTED
        const newWorkflow = [...data.workflow];
        const lastIndex = newWorkflow.length - 1;
        newWorkflow[lastIndex] = {
            ...newWorkflow[lastIndex],
            status: 'REJECTED',
            action: 'REJECT'
        };
        updatePayload.workflow = newWorkflow;
    }

    try {
        await doc.ref.update(updatePayload);

        // We add a tiny delay, then remove the isMigration flag so the document isn't permanently stuck as a "migration" doc 
        // which would prevent future notifications.
        setTimeout(async () => {
            await doc.ref.update({ isMigration: adminDb.FieldValue.delete() });
            console.log("Removed isMigration flag. Revert complete.");
            process.exit(0);
        }, 3000);

        console.log(`Successfully reverted Firestore for ID: ${doc.id} back to REJECTED silently.`);
    } catch (err) {
        console.error(`Failed to revert:`, err);
    }
}

revert039().catch(console.error);
