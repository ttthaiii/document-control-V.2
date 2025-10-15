// src/index.ts (Final Corrected Version with Update Sync)
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { defineString, defineSecret } from 'firebase-functions/params';
import { getBimTrackingDb, getAdminDb } from "./lib/firebase/admin";
import fetch from "node-fetch";
import * as admin from "firebase-admin";

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
    
    const bimTrackingDb = getBimTrackingDb();
    const rfaDocumentUrl = `${process.env.TTSDOC_APP_URL}/rfa/${docId}`;
    const taskRef = bimTrackingDb.collection("tasks").doc(taskUid);
    
    await taskRef.update({
      link: rfaDocumentUrl,
      documentNumber: newData.documentNumber,
      rev: newData.revisionNumber,
      currentStep: newData.status, // Use status for RFA
    });
    
    logger.log(`✅ [BIM-Tracking Sync] Successfully updated link and status for task ${taskUid}.`);
}

async function sendLineNotification(event: any) {
    const docId = event.params.docId;
    if (!event.data?.after.exists) return;

    const newData = event.data.after.data();
    const beforeData = event.data.before.data();
    
    const isCreate = !event.data.before.exists;
    const isStatusUpdate = !isCreate && beforeData.status !== newData.status;

    if (!isCreate && !isStatusUpdate) return;

    const adminDb = getAdminDb(); 

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
📝 หัวข้อ: ${newData.title || "ไม่มีหัวข้อ"}
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

// --- 👇 [แก้ไข] Logic การทำงานของ onWorkRequestWrite ทั้งหมด ---
export const onWorkRequestWrite = onDocumentWritten(
  {
    document: "workRequests/{docId}",
    region: "asia-southeast1",
    secrets: ["TTSDOC_PRIVATE_KEY", "BIM_TRACKING_PRIVATE_KEY", "TTSDOC_APP_URL"],
  },
  async (event) => {
    const docId = event.params.docId;
    const dataAfter = event.data?.after.data();
    const dataBefore = event.data?.before.data();

    const isCreate = !dataBefore && dataAfter;
    const isUpdate = dataBefore && dataAfter;
    const isDelete = !dataAfter;

    if (isDelete) {
        logger.log(`[WR Sync/${docId}] Document deleted. No action.`);
        return null;
    }

    // --- Action 1: Handle Document Creation ---
    if (isCreate && !dataAfter.taskData) {
        logger.log(`[WR Sync/${docId}] New Work Request detected. Starting sync to BIM Tracking...`);
        try {
            await createBimTrackingTask(event);
        } catch (error) {
            logger.error(`[WR Sync/${docId}] Failed to CREATE task in BIM Tracking:`, error);
            await event.data?.after.ref.update({ syncError: (error as Error).message });
        }
    }

    // --- Action 2: Handle Status Update ---
    if (isUpdate && dataBefore.status !== dataAfter.status) {
        logger.log(`[WR Sync/${docId}] Status update detected from ${dataBefore.status} to ${dataAfter.status}.`);
        if (dataAfter.taskData?.taskUid) {
            try {
                const bimTrackingDb = getBimTrackingDb();
                const taskRef = bimTrackingDb.collection("tasks").doc(dataAfter.taskData.taskUid);
                await taskRef.update({
                    currentStep: dataAfter.status,
                    lastUpdate: admin.firestore.Timestamp.now(),
                });
                logger.log(`✅ [WR Sync/${docId}] Successfully updated status for task ${dataAfter.taskData.taskUid}.`);
            } catch (error) {
                logger.error(`[WR Sync/${docId}] Failed to UPDATE task status in BIM Tracking:`, error);
                await event.data?.after.ref.update({ syncError: `Update failed: ${(error as Error).message}` });
            }
        } else {
            logger.warn(`[WR Sync/${docId}] Status updated, but no taskUid found to sync.`);
        }
    }
    
    return null;
  }
);


// --- Helper function for creating a new task ---
async function createBimTrackingTask(event: any) {
    const docId = event.params.docId;
    const dataAfter = event.data?.after.data();

    if (!dataAfter) throw new Error("Document data is missing.");

    const adminDb = getAdminDb();
    const bimTrackingDb = getBimTrackingDb();

    const siteDoc = await adminDb.collection("sites").doc(dataAfter.siteId).get();
    if (!siteDoc.exists) throw new Error(`Site with ID ${dataAfter.siteId} not found.`);
    const siteData = siteDoc.data()!;
    const projectAbbr = siteData.shortName;
    const siteName = siteData.name;
    if (!projectAbbr) throw new Error(`'shortName' is not configured for site ID: ${dataAfter.siteId}`);

    const projectsQuery = bimTrackingDb.collection("projects").where("name", "==", siteName).limit(1);
    const projectsSnapshot = await projectsQuery.get();
    if (projectsSnapshot.empty) throw new Error(`Project '${siteName}' not found in BIM Tracking.`);
    const projectId = projectsSnapshot.docs[0].id;

    const activityDocId = "work-request-(งานด่วนภายในโครงการ)";
    const activityDoc = await bimTrackingDb.collection("relateWorks").doc(activityDocId).get();
    if (!activityDoc.exists || activityDoc.data()?.order === undefined) {
        throw new Error(`Field 'order' not found or is undefined in relateWorks/${activityDocId}`);
    }
    const activityOrderValue = activityDoc.data()?.order;
    const activityOrder = String(activityOrderValue).padStart(3, '0');

    const counterRef = bimTrackingDb.collection("projects").doc(projectId);
    const runningNo = await bimTrackingDb.runTransaction(async (transaction) => {
        const projectDoc = await transaction.get(counterRef);
        if (!projectDoc.exists) throw new Error("Project counter document not found!");
        const currentCounter = projectDoc.data()?.taskCounter || 0;
        const nextCounter = currentCounter + 1;
        transaction.update(counterRef, { taskCounter: nextCounter });
        return String(nextCounter).padStart(3, '0');
    });
    
    const generatedTaskNumber = `TTS-BIM-${projectAbbr}-${activityOrder}-${runningNo}`;
    logger.log(`[WR Sync/${docId}] Generated special taskNumber: ${generatedTaskNumber}`);

    const newTaskPayload = {
      taskName: dataAfter.taskName,
      taskCategory: "Work Request",
      projectId: projectId,
      planStartDate: null,
      startDate: null,
      dueDate: dataAfter.dueDate || null,
      progress: 0,
      rev: "00",
      estWorkload: 0,
      subTaskCount: 0,
      taskAssignee: "",
      taskNumber: generatedTaskNumber,
      totalWH: 0,
      lastUpdate: admin.firestore.Timestamp.now(),
      link: `${process.env.TTSDOC_APP_URL}/dashboard/work-request?docId=${docId}`,
      currentStep: dataAfter.status,
    };

    const newTaskRef = bimTrackingDb.collection("tasks").doc(generatedTaskNumber);
    await newTaskRef.set(newTaskPayload);
    logger.log(`[WR Sync/${docId}] Created task ${generatedTaskNumber} in BIM Tracking.`);

    const taskDataToUpdate = {
      taskUid: newTaskRef.id,
      taskName: dataAfter.taskName,
      taskCategory: "Work Request",
      projectName: siteName,
    };

    await event.data?.after.ref.update({ taskData: taskDataToUpdate });
    logger.log(`[WR Sync/${docId}] Successfully linked task back to ttsdoc.`);
}