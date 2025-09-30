// src/index.ts (Final Corrected Version)
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { defineString, defineSecret } from 'firebase-functions/params';
import { getBimTrackingDb, getAdminDb } from "./lib/firebase/admin";
import fetch from "node-fetch";

// --- Parameters & Secrets (No changes here) ---
defineString("TTSDOC_PROJECT_ID");
defineString("TTSDOC_CLIENT_EMAIL");
defineString("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET");
defineString("BIM_TRACKING_PROJECT_ID");
defineString("BIM_TRACKING_CLIENT_EMAIL");
defineSecret("TTSDOC_PRIVATE_KEY");
defineSecret("BIM_TRACKING_PRIVATE_KEY");
defineSecret("LINE_CHANNEL_ACCESS_TOKEN");
defineSecret("TTSDOC_APP_URL");

const region = "asia-southeast1";

const STATUS_LABELS: { [key: string]: string } = {
  PENDING_REVIEW: "รอตรวจสอบ",
  PENDING_CM_APPROVAL: "ส่ง CM",
  REVISION_REQUIRED: "แก้ไข",
  APPROVED: "อนุมัติ",
  APPROVED_WITH_COMMENTS: "อนุมัติตามคอมเมนต์ (ไม่แก้ไข)",
  APPROVED_REVISION_REQUIRED: "อนุมัติตามคอมเมนต์ (ต้องแก้ไข)",
  REJECTED: "ไม่อนุมัติ",
};

export const onRfaUpdate = onDocumentWritten(
  {
    document: "rfaDocuments/{docId}",
    region: region,
    secrets: [
        "TTSDOC_PRIVATE_KEY",
        "BIM_TRACKING_PRIVATE_KEY",
        "LINE_CHANNEL_ACCESS_TOKEN",
        "TTSDOC_APP_URL"
    ]
  },
  async (event) => {
    const docId = event.params.docId;

    try {
        const newData = event.data?.after.data();
        if (newData?.taskData?.taskUid) {
            await syncToBimTracking(docId, newData);
        }
    } catch (error) {
        logger.error(`[BIM-Tracking Sync] Error for doc ${docId}:`, error);
    }
    
    try {
        await sendLineNotification(event);
    } catch (error) {
        logger.error(`[LINE Notification] Error for doc ${docId}:`, error);
    }

    return null;
  }
);

async function syncToBimTracking(docId: string, newData: any) {
    const taskUid = newData.taskData.taskUid;
    if (!taskUid) return;
    
    const bimTrackingDb = getBimTrackingDb(); // No change here
    const rfaDocumentUrl = `${process.env.TTSDOC_APP_URL}/rfa/${docId}`;
    const taskRef = bimTrackingDb.collection("tasks").doc(taskUid);
    
    await taskRef.update({
      link: rfaDocumentUrl,
      documentNumber: newData.documentNumber,
      rev: newData.revisionNumber,
      currentStep: newData.currentStep,
    });
    
    logger.log(`✅ [BIM-Tracking Sync] Successfully updated link for task ${taskUid}.`);
}

async function sendLineNotification(event: any) {
    const docId = event.params.docId;
    if (!event.data?.after.exists) return;

    const newData = event.data.after.data();
    const beforeData = event.data.before.data();
    
    const isCreate = !event.data.before.exists;
    const isStatusUpdate = !isCreate && beforeData.status !== newData.status;

    if (!isCreate && !isStatusUpdate) return;

    // ✅ *** KEY CHANGE IS HERE ***
    const adminDb = getAdminDb(); // Calling the function to get the DB instance
    // ✅ *************************

    const siteId = newData.siteId;
    if (!siteId) return;

    const siteDoc = await adminDb.collection("sites").doc(siteId).get();
    if (!siteDoc.exists) return;
    
    const siteData = siteDoc.data();
    const lineGroupId = siteData?.LineGroupID;
    const siteName = siteData?.name || "ไม่ระบุโครงการ";

    if (!lineGroupId) return;

    const statusKey = newData.status || "UNKNOWN";
    const message = `📄 เอกสารโครงการ: ${siteName}
🔢 เลขที่เอกสาร: ${newData.documentNumber || "N/A"}
🔄 rev: ${String(newData.revisionNumber || 0).padStart(2, "0")}
📌 สถานะ: ${STATUS_LABELS[statusKey] || statusKey}
🔗 ดูเอกสาร: ${process.env.TTSDOC_APP_URL}/rfa/${docId}`;

    const response = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({ to: lineGroupId, messages: [{ type: "text", text: message }] }),
    });

    if (!response.ok) {
        const errorBody = await response.json();
        logger.error(`[LINE] Failed to send message to ${lineGroupId}`, errorBody);
    } else {
        logger.log(`✅ [LINE] Successfully sent notification to ${lineGroupId} for doc ${docId}.`);
    }
}