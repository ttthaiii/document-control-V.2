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

// ตัวแปรควบคุมการเขียน (เปลี่ยนเป็น true เมื่อต้องการซ่อมจริง)
const DRY_RUN = true;

async function repairHistory() {
    console.log(`🛠️ เริ่มต้นกระบวนการ ${DRY_RUN ? 'เช็คจำนวนไฟล์ที่จะซ่อม (Dry-run)' : 'ซ่อมแซมและเซฟลงฐานข้อมูลจริง'} ...\n`);

    const snapshot = await db.collection('rfaDocuments').get();
    
    // 1. นำเอกสารทั้งหมดมาจัดกลุ่มตาม runningNumber (เช่น RFA-SHOP-ESNKR3-0080)
    const groups: Record<string, any[]> = {};
    snapshot.forEach(doc => {
        const data = doc.data();
        // Group by base document number OR running number to ensure we catch everything
        const key = data.runningNumber || data.documentNumber.replace(/-REV\d+$/, '');
        if (key) {
            if (!groups[key]) groups[key] = [];
            groups[key].push({ id: doc.id, ...data });
        }
    });

    let fixCount = 0;

    for (const [key, docs] of Object.entries(groups)) {
        // เรียงตามเลข Rev
        docs.sort((a, b) => (a.revisionNumber || 0) - (b.revisionNumber || 0));

        // เก็บประวัติที่สมบูรณ์ของแต่ละ Rev ไว้ใช้ต่อยอด
        const healthyWorkflows = new Map<number, any[]>();

        for (const doc of docs) {
            const currentRev = doc.revisionNumber || 0;
            const currentWorkflow = doc.workflow || [];

            if (currentRev === 0) {
                healthyWorkflows.set(currentRev, currentWorkflow);
                continue;
            }

            // หาประวัติที่สมบูรณ์ที่สุดของ Rev ก่อนหน้า
            let prevWorkflow: any[] = [];
            for (let i = currentRev - 1; i >= 0; i--) {
                if (healthyWorkflows.has(i)) {
                    prevWorkflow = healthyWorkflows.get(i)!;
                    break;
                }
            }

            if (prevWorkflow.length === 0) {
                // ไม่มีประวัติก่อนหน้าให้ต่อยอด ถือว่าเริ่มใหม่
                healthyWorkflows.set(currentRev, currentWorkflow);
                continue;
            }

            // วิธีเช็คที่แม่นยำที่สุด: ดูว่า "บรรทัดแรก" ของ Rev นี้ มันใช่บรรทัดแรกของ Rev ที่แล้วหรือไม่
            // ถ้าไม่ใช่ แปลว่าขาดการ Copy History 100%
            const isBroken = currentWorkflow[0]?.action !== prevWorkflow[0]?.action || 
                             currentWorkflow[0]?.timestamp !== prevWorkflow[0]?.timestamp;

            if (isBroken) {
                console.log(`⚠️ พบประวัติแหว่ง: ${doc.runningNumber} [Rev.${currentRev}]`);
                console.log(`   - บรรทัดแรกของเดิมคือ: ${prevWorkflow[0]?.action || prevWorkflow[0]?.status}`);
                console.log(`   - แต่บรรทัดแรกของใหม่ดันเริ่มด้วย: ${currentWorkflow[0]?.action || currentWorkflow[0]?.status}`);
                
                // ให้ยัดประวัติของเก่าทั้งหมดนำหน้า แล้วต่อด้วยประวัติของมันเอง
                const patchedWorkflow = [...prevWorkflow, ...currentWorkflow];
                
                if (!DRY_RUN) {
                    try {
                        await db.collection('rfaDocuments').doc(doc.id).update({
                            workflow: patchedWorkflow,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                        console.log(`   ✅ กู้คืนประวัติเป็น ${patchedWorkflow.length} รายการ เรียบร้อย!`);
                    } catch(e) {
                        console.log(`   ❌ เกิดข้อผิดพลาดตอนเซฟ: ${e}`);
                    }
                } else {
                    console.log(`   💡 (จำลอง) จะทำการต่อประวัติ เอา ${prevWorkflow.length} บรรทัดเก่า มารวมกับ ${currentWorkflow.length} บรรทัดใหม่ = ${patchedWorkflow.length} บรรทัด`);
                }
                
                healthyWorkflows.set(currentRev, patchedWorkflow);
                fixCount++;
            } else {
                // ประวัติปกติดี มีการสืบทอดมาแล้ว
                healthyWorkflows.set(currentRev, currentWorkflow);
            }
        }
    }

    console.log(`\n🎉 สรุป: พบเอกสารที่ประวัติแหว่งทั้งหมด ${fixCount} ฉบับ`);
    if (DRY_RUN) {
        console.log(`👉 นี่คือโหมดอ่านอย่างเดียว (Dry-run) ฐานข้อมูลยังไม่ได้ถูกแก้ไข`);
        console.log(`👉 หากต้องการซ่อมไฟล์จริงๆ ให้แก้ตัวแปร DRY_RUN = false ในบรรทัดที่ 20 แล้วรันใหม่ครับ`);
    } else {
        console.log(`👉 ซ่อมแซมฐานข้อมูลเสร็จสิ้นครบทุกฉบับ! รีเฟรชดูข้อมูลในระบบได้เลยครับ`);
    }
}

repairHistory().then(() => process.exit(0)).catch(e => {
    console.error('💥 เกิดข้อผิดพลาดหลัก:', e);
    process.exit(1);
});
