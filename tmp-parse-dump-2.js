const fs = require('fs');

const dump = JSON.parse(fs.readFileSync('./firestore-dump.json', 'utf8'));

Object.values(dump.rfaDocuments).forEach(doc => {
    if (doc.documentNumber && doc.documentNumber.includes('VLH-TTS-DPM-SHOP-AR-090')) {
        console.log(`FOUND: ${doc.documentNumber}`);
        console.log(`Files:`, JSON.stringify(doc.files, null, 2));
    }
});
