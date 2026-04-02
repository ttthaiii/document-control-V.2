// src/app/api/rfa/extract-cad/route.ts
// Background endpoint สำหรับ extract .dwg จาก ZIP/RAR หลังจาก Final Approval
// Frontend เรียกแบบ fire-and-forget (ไม่รอ response) เพื่อไม่ให้ approve ช้า

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { extractCadFiles } from '@/lib/utils/extractCadFiles';
import { RFAFile } from '@/types/rfa';

export const dynamic = 'force-dynamic';
// เพิ่ม timeout สูงสุดเท่าที่ Vercel อนุญาต
export const maxDuration = 60;

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const token = authHeader.split('Bearer ')[1];
        await adminAuth.verifyIdToken(token); // ตรวจสอบ token แต่ไม่ต้องเช็ค role (เปิดไว้สำหรับ internal call)

        const { docId } = await request.json();
        if (!docId) {
            return NextResponse.json({ error: 'docId is required' }, { status: 400 });
        }

        const rfaDocRef = adminDb.collection('rfaDocuments').doc(docId);
        const rfaDoc = await rfaDocRef.get();
        if (!rfaDoc.exists) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        const docData = rfaDoc.data()!;

        // ถ้ามี cadFiles อยู่แล้ว ไม่ต้อง extract ซ้ำ
        if (docData.cadFiles && docData.cadFiles.length > 0) {
            return NextResponse.json({ success: true, message: 'CAD files already extracted', count: docData.cadFiles.length });
        }

        const workflow = docData.workflow || [];

        // หา step ล่าสุดที่:
        //   1. เป็น submission status (PENDING_REVIEW / PENDING_CM_APPROVAL / DRAFT)
        //   2. มีไฟล์ที่เป็น CAD (.dwg / .zip / .rar) อยู่ด้วย
        //
        // เหตุผลที่ต้องเช็ค CAD extension ก่อน:
        //   - BIM flow: PENDING_REVIEW [dwg, pdf] → PENDING_CM_APPROVAL [pdf เท่านั้น → Site Admin forward]
        //     → ถ้าหา "step ล่าสุดที่มีไฟล์" จะเจอ PENDING_CM_APPROVAL ซึ่งไม่มี DWG
        //     → ต้องข้ามไปหา PENDING_REVIEW ที่มี DWG
        //   - Resubmission flow: PENDING_REVIEW [old_dwg] → REVISION_REQUIRED → PENDING_REVIEW [new_dwg]
        //     → ต้องได้ new_dwg ไม่ใช่ old_dwg
        const CAD_EXTENSIONS = ['.dwg', '.zip', '.rar'];
        
        // ค้นหาจากสถานะอนุมัติก่อน (ถ้าผู้อนุมัติแนบ CAD ไฟล์แบบ Stamped มาให้)
        // แต่ถ้าไม่มีไฟล์ใน step อนุมัติ มันจะย้อนไปหาไฟล์จาก PENDING_REVIEW ให้อัตโนมัติ (Fallback)
        // เพื่อป้องกันปัญหาไม่มีไฟล์ CAD ให้หน้างาน และหลีกเลี่ยงการเปิดช่องโหว่ให้แก้ไฟล์แนบหลังอนุมัติ
        const targetStatuses = [
            'APPROVED',
            'APPROVED_WITH_COMMENTS',
            'APPROVED_REVISION_REQUIRED',
            'PENDING_FINAL_APPROVAL',
            'PENDING_REVIEW',
            'PENDING_CM_APPROVAL',
            'DRAFT'
        ];

        const hasCadFile = (files: RFAFile[]) =>
            files.some(f => CAD_EXTENSIONS.some(ext => f.fileName.toLowerCase().endsWith(ext)));

        // Pass 1: หา step ล่าสุดที่มีไฟล์ CAD โดยตรง
        const latestCadStep = [...workflow].reverse().find(
            w => w.files?.length > 0 &&
                 targetStatuses.includes(w.status) &&
                 hasCadFile(w.files)
        );

        // Pass 2: fallback → ถ้าไม่เจอ CAD แต่เจอไฟล์อื่นๆ (เช่น แนบ PDF)
        const latestAnyStep = latestCadStep ?? [...workflow].reverse().find(
            w => w.files?.length > 0 && targetStatuses.includes(w.status)
        );

        const originalFiles: RFAFile[] = latestAnyStep?.files ?? workflow[0]?.files ?? [];

        console.log(`[extract-cad] Processing doc: ${docId}`);
        console.log(`[extract-cad] Using step status: "${latestAnyStep?.status ?? 'none'}" | Found ${originalFiles.length} file(s):`, originalFiles.map(f => f.fileName));

        const cadFiles = await extractCadFiles(originalFiles, docData.siteId, docId);

        console.log(`[extract-cad] Resulting CAD files count: ${cadFiles.length}`);

        if (cadFiles.length > 0) {
            await rfaDocRef.update({ cadFiles });
            console.log(`[extract-cad] Saved ${cadFiles.length} CAD file(s) for doc ${docId} to Firestore.`);
        }

        return NextResponse.json({ success: true, count: cadFiles.length });

    } catch (error) {
        console.error('[extract-cad] Error:', error);
        return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
    }
}
