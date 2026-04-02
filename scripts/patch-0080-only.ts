import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// โหลดข้อมูล Auth จาก .env.local
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

// 💡 แก้ค่านี้เป็น false หากต้องการให้บันทึกลง Database จริงๆ
const DRY_RUN = true;

async function manualPatch0080() {
    console.log(`🛠️ [${DRY_RUN ? 'DRY RUN' : 'LIVE PATCH'}] เริ่มผ่าตัดซ่อมแซม RFA-SHOP-ESNKR3-0080 ...\n`);

    const REV2_DOC_ID = 'MYyh6QrV8519qZ4jbaVs';
    const REV3_DOC_ID = 'VAtIYSORc7TaAagfCPum';

    // 1. ดึงข้อมูล Rev.2 (ตั๋วต้นทางที่มี 9 ประวัติ)
    const rev2Ref = db.collection('rfaDocuments').doc(REV2_DOC_ID);
    const rev2Snap = await rev2Ref.get();
    
    // 2. ดึงข้อมูล Rev.3 (ตั๋วปลายทางที่ประวัติขาด)
    const rev3Ref = db.collection('rfaDocuments').doc(REV3_DOC_ID);
    const rev3Snap = await rev3Ref.get();

    if (!rev2Snap.exists || !rev3Snap.exists) {
        console.error('❌ ไม่พบเอกสารในฐานข้อมูล ตรวจสอบ ID อีกครั้ง!');
        process.exit(1);
    }

    const rev2Data = rev2Snap.data();
    const rev3Data = rev3Snap.data();

    const oldHistory = rev2Data?.workflow || [];
    const newHistory = rev3Data?.workflow || [];

    console.log(`🟢 พบเอกสารต้นทาง (Rev.2): มีประวัติ ${oldHistory.length} ขั้นตอน`);
    console.log(`🔴 พบเอกสารปลายทาง (Rev.3): มีประวัติ ${newHistory.length} ขั้นตอน\n`);

    // 3. ผสมรวมประวัติ (ยึดเอาของเก่าที่สมบูรณ์มานำหน้า แล้วนำ Action ของ Rev.3 ต่อท้าย)
    const mergedWorkflow = [...oldHistory, ...newHistory];

    console.log(`✨ ประวัติที่รวมกันได้ทั้งหมด: ${mergedWorkflow.length} ขั้นตอน`);

    if (DRY_RUN) {
        console.log(`\n👉 นี่คือโหมดจำลอง หากต้องการทับข้อมูลจริงให้เปลี่ยนบรรทัด DRY_RUN = false ในสคริปต์ครับ`);
    } else {
        await rev3Ref.update({
            workflow: mergedWorkflow,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`\n🎉 ซ่อมแซมเรียบร้อย! ลองกดเปิด History Modal ในระบบหน้าเว็บดูได้เลยครับ`);
    }
}

manualPatch0080().then(() => process.exit(0)).catch(e => {
    console.error('💥 Error:', e);
    process.exit(1);
});
