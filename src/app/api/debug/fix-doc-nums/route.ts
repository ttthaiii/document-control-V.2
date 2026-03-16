import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const siteId = '2u5Sn5xKysew0sC8yxbw'; // VLH
        const snapshot = await adminDb.collection('rfaDocuments')
            .where('siteId', '==', siteId)
            .get();

        const results: any[] = [];
        const updates: any[] = [];

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const docNum = data.documentNumber;
            let needsUpdate = false;
            let newDocNum = docNum;
            const updatePayload: any = {};
            
            // Check if document number has space or tab
            if (docNum && (docNum.includes(' ') || docNum.includes('\t'))) {
                newDocNum = docNum.trim().replace(/\s+/g, '-');
                updatePayload.documentNumber = newDocNum;
                needsUpdate = true;
            }

            // Also check the files array to fix any bad URLs
            let filesFixed = false;
            const fixedFiles = (data.files || []).map((file: any) => {
                 let updatedFile = { ...file };
                 // Fix filePath and fileUrl
                 if (updatedFile.filePath && (updatedFile.filePath.includes(' ') || updatedFile.filePath.includes('\t'))) {
                     const parts = updatedFile.filePath.split('/');
                     // The document number is usually the 3rd index (0: sites, 1: siteId, 2: rfa, 3: docNum)
                     const newParts = parts.map((p: string) => p.replace(/\s+/g, '-'));
                     updatedFile.filePath = newParts.join('/');
                     filesFixed = true;
                 }
                 if (updatedFile.fileUrl && (updatedFile.fileUrl.includes(' ') || updatedFile.fileUrl.includes('\t') || updatedFile.fileUrl.includes('%09') || updatedFile.fileUrl.includes('%20'))) {
                     // We need to decode it first, replace spaces/tabs with dashes, then ideally re-encode or just trust the new getFileUrl logic.
                     // Since the actual folder in storage likely has the space/dash issue, we need to match it!
                     // WAIT: In storage, what is the folder name? Is it with spaces or dashes?
                     // If the storage folder has spaces, we MUST keep the storage spaces and just URIEncode it in the frontend.
                     // We already URIEncoded the getFileUrl function.
                     // But the user said "มันคนละ path เลยหากันไม่เจอ", implying Storage has `%09` (a tab encoded) AND the db has a space.
                     // Actually let's just make the DB paths match the intended dash format.
                     const decodedStr = decodeURIComponent(updatedFile.fileUrl);
                     const parts = decodedStr.split('/');
                     const newParts = parts.map((p: string) => p.replace(/\s+/g, '-'));
                     updatedFile.fileUrl = newParts.map((p:string) => encodeURIComponent(p)).join('/');
                     filesFixed = true;
                 }
                 return updatedFile;
            });

            if (filesFixed) {
                updatePayload.files = fixedFiles;
                needsUpdate = true;
            }

            // Also fix workflow files if present
            let workflowFixed = false;
            const fixedWorkflow = (data.workflow || []).map((step: any) => {
                 let updatedStep = { ...step };
                 if (updatedStep.files && updatedStep.files.length > 0) {
                     updatedStep.files = updatedStep.files.map((file: any) => {
                         let updatedFile = { ...file };
                         if (updatedFile.filePath && (updatedFile.filePath.includes(' ') || updatedFile.filePath.includes('\t'))) {
                             const parts = updatedFile.filePath.split('/');
                             const newParts = parts.map((p: string) => p.replace(/\s+/g, '-'));
                             updatedFile.filePath = newParts.join('/');
                             workflowFixed = true;
                         }
                         if (updatedFile.fileUrl && (updatedFile.fileUrl.includes(' ') || updatedFile.fileUrl.includes('\t') || updatedFile.fileUrl.includes('%09') || updatedFile.fileUrl.includes('%20'))) {
                             const decodedStr = decodeURIComponent(updatedFile.fileUrl);
                             const parts = decodedStr.split('/');
                             const newParts = parts.map((p: string) => p.replace(/\s+/g, '-'));
                             updatedFile.fileUrl = newParts.map((p:string) => encodeURIComponent(p)).join('/');
                             workflowFixed = true;
                         }
                         return updatedFile;
                     });
                 }
                 return updatedStep;
            });

            if (workflowFixed) {
                updatePayload.workflow = fixedWorkflow;
                needsUpdate = true;
            }

            if (needsUpdate) {
                results.push({
                    id: doc.id,
                    oldDocNum: docNum,
                    newDocNum: newDocNum,
                    filesFixed,
                    workflowFixed
                });
                updates.push(adminDb.collection('rfaDocuments').doc(doc.id).update(updatePayload));
            }
        }
        
        await Promise.all(updates);

        return NextResponse.json({ 
            success: true, 
            message: `Found and fixed ${results.length} documents including their file arrays.`,
            results 
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
