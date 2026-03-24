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
        // หา step ล่าสุดที่เป็นการส่งเอกสาร (เพื่อดึงไฟล์แนบล่าสุดในกรณี Rev.1, Rev.2...)
        const submissionStatuses = ['PENDING_REVIEW', 'PENDING_CM_APPROVAL', 'DRAFT'];
        const latestSubmissionStep = [...workflow].reverse().find(
            w => w.files && w.files.length > 0 && submissionStatuses.includes(w.status)
        );
        
        const originalFiles: RFAFile[] = latestSubmissionStep?.files || workflow[0]?.files || [];
        
        console.log(`[extract-cad] Processing doc: ${docId}`);
        console.log(`[extract-cad] Found ${originalFiles.length} original files to scan. Names:`, originalFiles.map(f => f.fileName));

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
