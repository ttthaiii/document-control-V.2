import * as fs from 'fs';
import * as path from 'path';

function extractDetails() {
    const dumpPath = path.resolve(__dirname, '../firestore-dump.json');
    const data = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
    const rfaDocs = data.rfaDocuments || {};

    let result = '| ลำดับ | เลขที่เอกสาร | วันที่ (อัปเดตล่าสุด) | สถานะ | ไฟล์แนบ |\n';
    result += '|---|---|---|---|---|\n';

    let count = 1;
    for (const [docId, docData] of Object.entries(rfaDocs)) {
        if ((docData as any).createdBy === 'iDfR6WhteDV0O14sNAVwO70vYIz2') {
            const docNum = (docData as any).documentNumber;
            const status = (docData as any).status;

            let updatedAtStr = 'N/A';
            if ((docData as any).updatedAt && (docData as any).updatedAt._seconds) {
                const date = new Date((docData as any).updatedAt._seconds * 1000);
                updatedAtStr = date.toLocaleString('th-TH');
            }

            let filesStr = 'ไม่มีไฟล์';
            if ((docData as any).files && Array.isArray((docData as any).files) && (docData as any).files.length > 0) {
                const fileNames = (docData as any).files.map((f: any) => f.name || 'Unnamed File');
                filesStr = fileNames.join(', ');
            }

            result += `| ${count} | ${docNum} | ${updatedAtStr} | ${status} | ${filesStr} |\n`;
            count++;
        }
    }

    fs.writeFileSync(path.resolve(__dirname, 'dump-details.md'), result);
    console.log('Successfully extracted details to dump-details.md');
}

extractDetails();
