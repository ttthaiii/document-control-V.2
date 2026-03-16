const fs = require('fs');

try {
    const data = fs.readFileSync('d:/ttsdoc-v2/firestore-dump.json', 'utf8');
    const parsed = JSON.parse(data);

    const rfaDocs = parsed.rfaDocuments || [];
    let countWithSpaces = 0;
    let total = 0;
    let examples = [];

    for (const doc of rfaDocs) {
        const docNum = doc.documentNumber;
        if (docNum) {
            total++;
            if (docNum !== docNum.trim()) {
                countWithSpaces++;
                examples.push(`"${docNum}" (ID: ${doc.id})`);
            }
        }
    }

    console.log(`\n================================`);
    console.log(`Total checked from dump: ${total}`);
    console.log(`Documents with trailing/leading spaces: ${countWithSpaces}`);
    if (examples.length > 0) {
        console.log(`\nExamples of bad document numbers:\n${examples.slice(0, 20).join('\n')}`);
    }
    console.log(`================================\n`);
} catch (e) {
    console.error("Error reading or parsing dump:", e);
}
