import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// โหลด Environment Variables จาก .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.TTSDOC_PROJECT_ID,
            clientEmail: process.env.TTSDOC_CLIENT_EMAIL,
            privateKey: process.env.TTSDOC_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        })
    });
}

const db = admin.firestore();

async function diagnoseMissingHistory() {
    console.log('🔍 กำลังตรวจสอบฐานข้อมูลเพื่อหาเอกสารที่มีปัญหา "ประวัติสูญหาย"...\n');

    // ดึงเอกสารทั้งหมดที่เป็น Revision (Rev > 0)
    const snapshot = await db.collection('rfaDocuments')
        .where('revisionNumber', '>', 0)
        .get();

    let problemCount = 0;
    const problematicDocs: any[] = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        const workflowLength = (data.workflow || []).length;
        
        // ถ้าเป็น Rev > 0 แต่มีประวัติแค่ 1 อัน แปลว่ามันลืมก๊อปปี้ประวัติของ Rev ก่อนหน้ามาแน่ๆ!
        if (workflowLength === 1) {
            problemCount++;
            problematicDocs.push({
                id: doc.id,
                runningNumber: data.runningNumber,
                documentNumber: data.documentNumber,
                revisionNumber: data.revisionNumber,
                siteId: data.siteId,
                rfaType: data.rfaType,
                taskUid: data.taskData?.taskUid || 'ไม่มี'
            });
        }
    });

    if (problemCount === 0) {
        console.log('✅ ยอดเยี่ยม! ไม่พบเอกสารใดในระบบที่มีปัญหาประวัติสูญหายเลย');
    } else {
        console.log(`❌ พบเอกสารที่มีปัญหาจำนวน ${problemCount} รายการ ดังนี้:\n`);
        problematicDocs.forEach((doc, index) => {
            console.log(`[${index + 1}] ${doc.runningNumber} | Rev.${doc.revisionNumber}`);
            console.log(`    docId: ${doc.id}`);
            console.log(`    Doc Number: ${doc.documentNumber}`);
            console.log(`    Task UID: ${doc.taskUid}`);
            console.log(`----------------------------------------`);
        });
        
        console.log(`\n💡 ข้อแนะนำ: นี่คือหลุมดำทางข้อมูล (Data Corruption) เอกสารเหล่านี้มีประวัติแค่ 1 บรรทัดเพราะถูกสร้างด้วยโค้ดเวอร์ชันเก่า`);
        console.log(`   เราสามารถเขียน Script เพื่อยัดประวัติของเก่ากลับลงไปเฉพาะ ${problemCount} รายการนี้ได้ครับ`);
    }
}

diagnoseMissingHistory().then(() => process.exit(0)).catch(e => {
    console.error('💥 เกิดข้อผิดพลาด:', e);
    process.exit(1);
});
