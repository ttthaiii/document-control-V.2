const fs = require('fs');

try {
    const data = fs.readFileSync('d:/ttsdoc-v2/firestore-dump.json', 'utf8');
    const parsed = JSON.parse(data);
    const rfaDocs = parsed.rfaDocuments || [];

    for (const doc of rfaDocs) {
        const docNum = doc.documentNumber || "";
        if (docNum.includes('039') || docNum.includes('007') || docNum.includes('032')) {
            console.log(`\nDoc ID: ${doc.id}`);
            console.log(`Doc Number: "${docNum}"`);
            if (doc.files && doc.files.length > 0) {
                console.log(`First File URL: ${doc.files[0].fileUrl}`);
                console.log(`First File Path: ${doc.files[0].filePath}`);
            }

            if (doc.workflow && doc.workflow.length > 0) {
                const latestFiles = doc.workflow.slice().reverse().find(step => step.files && step.files.length > 0)?.files;
                if (latestFiles && latestFiles.length > 0) {
                    console.log(`Latest Workflow File URL: ${latestFiles[0].fileUrl}`);
                    console.log(`Latest Workflow File Path: ${latestFiles[0].filePath}`);
                }
            }
        }
    }
} catch (e) {
    console.error("Error:", e);
}
