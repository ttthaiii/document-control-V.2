const admin = require('firebase-admin');

// Initialize Firebase Admin (assuming default credentials or emulator are set)
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function checkDocNumbers() {
    const snapshot = await db.collection('rfaDocuments').get();
    let withSpaces = 0;
    let total = 0;

    console.log(`Total RFA documents: ${snapshot.size}`);

    snapshot.forEach(doc => {
        const data = doc.data();
        const docNum = data.documentNumber;
        if (docNum) {
            total++;
            if (docNum !== docNum.trim()) {
                withSpaces++;
                console.log(`Found: "${docNum}" (ID: ${doc.id})`);
            }
        }
    });

    console.log(`\nFound ${withSpaces} out of ${total} documents with trailing/leading spaces.`);
    process.exit(0);
}

checkDocNumbers().catch(console.error);
