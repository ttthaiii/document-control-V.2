const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());

import { adminDb, adminBucket } from '../src/lib/firebase/admin';

async function fixRFASpaces() {
    console.log("Started RFA Space Cleanup Script...");

    const snapshot = await adminDb.collection('rfaDocuments').get();
    const affectedDocs = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.documentNumber && data.documentNumber !== data.documentNumber.trim()) {
            affectedDocs.push({ id: doc.id, data: data });
        }
    });

    console.log(`Found ${affectedDocs.length} documents with trailing/leading spaces.`);

    for (const doc of affectedDocs) {
        const id = doc.id;
        const oldNum = doc.data.documentNumber;
        const cleanNum = oldNum.trim();
        console.log(`\nProcessing DOC ID: ${id}`);
        console.log(`"${oldNum}" -> "${cleanNum}"`);

        const updatePayload: any = {
            documentNumber: cleanNum
        };

        // 1. Process files array
        if (doc.data.files && doc.data.files.length > 0) {
            updatePayload.files = await Promise.all(doc.data.files.map(async (file: any) => {
                return await processFile(file, oldNum, cleanNum);
            }));
        }

        // 2. Process workflow arrays
        if (doc.data.workflow && doc.data.workflow.length > 0) {
            updatePayload.workflow = await Promise.all(doc.data.workflow.map(async (step: any) => {
                if (step.files && step.files.length > 0) {
                    step.files = await Promise.all(step.files.map(async (file: any) => {
                        return await processFile(file, oldNum, cleanNum);
                    }));
                }
                return step;
            }));
        }

        // Update the database
        try {
            await adminDb.collection('rfaDocuments').doc(id).update(updatePayload);
            console.log(`Successfully updated Firestore for ID: ${id}`);
        } catch (dbErr) {
            console.error(`Failed to update DB for ID: ${id}`, dbErr);
        }
    }

    console.log("\nFinished RFA Space Cleanup Script.");
}

async function processFile(file: any, oldNum: string, cleanNum: string) {
    if (!file.filePath) return file;

    // Example filePath: sites/xyz/rfa/DOC-01 /123_file.pdf
    // The old number is definitely part of the path if it followed standard structure

    // Note: we just replace the exact folder segment in the path if it contains the space
    // E.g. /DOC-01 / -> /DOC-01/

    const oldPath = file.filePath;
    const newPath = oldPath.replace(`/${oldNum}/`, `/${cleanNum}/`);

    if (oldPath !== newPath) {
        // We need to move the file in storage
        try {
            const oldFileRef = adminBucket.file(oldPath);
            const [exists] = await oldFileRef.exists();
            if (exists) {
                await oldFileRef.move(newPath);
                console.log(`Moved Storage: ${oldPath} -> ${newPath}`);
            } else {
                // File might not exist or might have already been moved
                const [newExists] = await adminBucket.file(newPath).exists();
                if (newExists) {
                    console.log(`File already exists at target: ${newPath}`);
                } else {
                    console.log(`File not found at source or target: ${oldPath}`);
                }
            }

            // Update file metadata
            const updatedFile = { ...file };
            updatedFile.filePath = newPath;
            updatedFile.fileUrl = updatedFile.fileUrl.replace(encodeURIComponent(oldNum), encodeURIComponent(cleanNum));
            // Cloudflare URL uses regular paths but might have `%20` encoded for the space by the browser
            // Better to replace the raw string if the spaces were encoded in fileUrl
            updatedFile.fileUrl = updatedFile.fileUrl.replace(`/${encodeURIComponent(oldNum)}/`, `/${encodeURIComponent(cleanNum)}/`);
            // Also catch unencoded replace just in case
            updatedFile.fileUrl = updatedFile.fileUrl.replace(`/${oldNum}/`, `/${cleanNum}/`);

            return updatedFile;

        } catch (storageErr) {
            console.error(`Storage Move Failed for ${oldPath}:`, storageErr);
            return file; // If move failed, keep old path data to avoid total disconnect
        }
    }

    return file;
}

fixRFASpaces().catch(console.error);
