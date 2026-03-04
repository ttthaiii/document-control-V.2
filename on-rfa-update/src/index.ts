// src/index.ts (แก้ไขแล้วสำหรับ Workflow ใหม่)
import { onDocumentWritten } from "firebase-functions/v2/firestore";

import { logger } from "firebase-functions";
import { defineString, defineSecret } from 'firebase-functions/params';
import { getBimTrackingDb, getAdminDb } from "./lib/firebase/admin";
import fetch from "node-fetch";
import * as admin from "firebase-admin";
import { FieldValue } from 'firebase-admin/firestore';

const WR_STATUSES: { [key: string]: string } = {
  DRAFT: "DRAFT",
  REJECTED_BY_PM: "REJECTED_BY_PM",
  PENDING_BIM: "PENDING_BIM",
  IN_PROGRESS: "IN_PROGRESS",
  PENDING_ACCEPTANCE: "PENDING_ACCEPTANCE",
  REVISION_REQUESTED: "REVISION_REQUESTED",
  COMPLETED: "COMPLETED",
};

// --- Parameters & Secrets (เหมือนเดิม) ---
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

// --- STATUS_LABELS for RFA (เหมือนเดิม) ---
const RFA_STATUS_LABELS: { [key: string]: string } = {
  PENDING_REVIEW: "รอตรวจสอบ",
  PENDING_CM_APPROVAL: "ส่ง CM",
  REVISION_REQUIRED: "แก้ไข",
  APPROVED: "อนุมัติ",
  APPROVED_WITH_COMMENTS: "อนุมัติตามคอมเมนต์ (ไม่แก้ไข)",
  APPROVED_REVISION_REQUIRED: "อนุมัติตามคอมเมนต์ (ต้องแก้ไข)",
  REJECTED: "ไม่อนุมัติ",
};

// --- onRfaUpdate (เหมือนเดิม) ---
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
        // แก้ชื่อฟังก์ชันเพื่อไม่ให้ซ้ำกับ WR
        await syncRfaToBimTracking(docId, newData);
      }
    } catch (error) {
      logger.error(`[RFA Sync/${docId}] Error syncing to BIM Tracking:`, error);
    }

    try {
      // แก้ชื่อฟังก์ชันเพื่อไม่ให้ซ้ำกับ WR
      await sendRfaLineNotification(event);
    } catch (error) {
      logger.error(`[RFA LINE/${docId}] Error sending notification:`, error);
    }

    return null;
  }
);

// แก้ชื่อฟังก์ชัน syncToBimTracking เป็น syncRfaToBimTracking
async function syncRfaToBimTracking(docId: string, newData: any) {
  const taskUid = newData.taskData.taskUid;
  if (!taskUid) return;

  const bimTrackingDb = getBimTrackingDb();
  const rfaDocumentUrl = `${process.env.TTSDOC_APP_URL}/rfa/${docId}`;
  const taskRef = bimTrackingDb.collection("tasks").doc(taskUid);

  // Make sure rev is a string, padded if necessary
  const revString = String(newData.revisionNumber || 0).padStart(2, '0');

  // --- Prepare Timestamp Payload ---
  const timestampUpdates: { [key: string]: any } = {};
  let latestTimestamp: any = admin.firestore.Timestamp.now(); // Default to now

  if (Array.isArray(newData.workflow) && newData.workflow.length > 0) {
    // Iterate through workflow to find timestamps for each status
    newData.workflow.forEach((step: any) => {
      if (step.status && step.timestamp) {
        // Determine Field Name: e.g., date_PENDING_REVIEW
        const fieldName = `date_${step.status}`;

        // Convert string timestamp to Firestore Timestamp if needed
        // Assuming step.timestamp is ISO string from frontend
        let firestoreTime;
        try {
          firestoreTime = admin.firestore.Timestamp.fromDate(new Date(step.timestamp));
        } catch (e) {
          firestoreTime = admin.firestore.Timestamp.now();
        }

        timestampUpdates[fieldName] = firestoreTime;

        // Keep track of the latest one for 'lastUpdate'
        latestTimestamp = firestoreTime;
      }
    });
  }

  // Combine standard fields with dynamic timestamp fields
  const updatePayload = {
    link: rfaDocumentUrl,
    documentNumber: newData.documentNumber,
    rev: revString,
    currentStep: newData.status,
    lastUpdate: latestTimestamp, // Use the latest found confirmation time
    ...timestampUpdates // Spread the dynamic date fields
  };

  await taskRef.update(updatePayload);

  logger.log(`✅ [RFA Sync/${docId}] Successfully updated task ${taskUid} with timestamps:`, Object.keys(timestampUpdates));
}

// แก้ชื่อฟังก์ชัน sendLineNotification เป็น sendRfaLineNotification
async function sendRfaLineNotification(event: any) {
  const docId = event.params.docId;
  if (!event.data?.after.exists) return; // Function triggered on delete

  const newData = event.data.after.data();
  const beforeData = event.data.before.data();

  if (newData?.isMigration === true) {
    logger.log(`🔇 [RFA LINE/${docId}] Skipped notification because 'isMigration' is true.`);
    return;
  }

  // Determine if it's a create or status update event
  const isCreate = !event.data.before.exists;
  const isStatusUpdate = !isCreate && beforeData?.status !== newData?.status;

  // Only proceed if it's a create event or a status update event
  if (!isCreate && !isStatusUpdate) {
    logger.log(`[RFA LINE/${docId}] No notification needed (not create or status update).`);
    return;
  }

  const adminDb = getAdminDb();

  const siteId = newData.siteId;
  if (!siteId) {
    logger.warn(`[RFA LINE/${docId}] Site ID missing, cannot send notification.`);
    return;
  }

  const siteDoc = await adminDb.collection("sites").doc(siteId).get();
  if (!siteDoc.exists) {
    logger.warn(`[RFA LINE/${docId}] Site document ${siteId} not found.`);
    return;
  }

  const siteData = siteDoc.data();
  const lineGroupId = siteData?.LineGroupID;
  const siteName = siteData?.name || "ไม่ระบุโครงการ";

  if (!lineGroupId) {
    logger.log(`[RFA LINE/${docId}] No Line Group ID configured for site ${siteId}.`);
    return;
  }

  // Prepare message content
  const statusKey = newData.status || "UNKNOWN";
  const message = `📄 เอกสาร RFA โครงการ: ${siteName}
📝 หัวข้อ: ${newData.title || "ไม่มีหัวข้อ"}
🔢 เลขที่เอกสาร: ${newData.documentNumber || "N/A"}
🔄 rev: ${String(newData.revisionNumber || 0).padStart(2, "0")}
📌 สถานะใหม่: ${RFA_STATUS_LABELS[statusKey] || statusKey} ${isCreate ? '(สร้างใหม่)' : ''}
🔗 ดูเอกสาร: ${process.env.TTSDOC_APP_URL}/rfa/${docId}`;

  // Send the message via Line Messaging API
  try {
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
      logger.error(`[RFA LINE/${docId}] Failed to send message to ${lineGroupId}`, errorBody);
    } else {
      logger.log(`✅ [RFA LINE/${docId}] Successfully sent notification to ${lineGroupId}.`);
    }
  } catch (error) {
    logger.error(`[RFA LINE/${docId}] Error fetching Line API:`, error);
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

    // --- ตรวจสอบ Event Type ---
    const isCreate = !dataBefore && dataAfter;
    const isUpdate = dataBefore && dataAfter;
    const isDelete = !dataAfter;

    if (isDelete) {
      logger.log(`[WR Sync/${docId}] Document deleted. No action.`);
      return null;
    }

    // --- Action 1: Handle Task Creation on Status Change (DRAFT -> PENDING_BIM) ---
    // ทำงานเมื่อเป็นการ Update, สถานะเปลี่ยนจาก DRAFT เป็น PENDING_BIM
    if (isUpdate && dataBefore.status === WR_STATUSES.DRAFT && dataAfter.status === WR_STATUSES.PENDING_BIM) {
      // ตรวจสอบว่ายังไม่มี Task เชื่อมโยงอยู่
      if (!dataAfter.taskData) {
        logger.log(`[WR Sync/${docId}] Status changed DRAFT -> PENDING_BIM. Triggering task creation...`);
        try {
          // ใช้ข้อมูล `dataAfter` ในการสร้าง Task
          await createBimTrackingTask(docId, dataAfter); // ส่ง docId และ dataAfter ไป
        } catch (error) {
          logger.error(`[WR Sync/${docId}] Failed to CREATE task in BIM Tracking after DRAFT approval:`, error);
          await event.data?.after.ref.update({ syncError: `Task creation failed: ${(error as Error).message}` });
        }
      } else {
        logger.warn(`[WR Sync/${docId}] Status changed DRAFT -> PENDING_BIM, but task already linked (${dataAfter.taskData.taskUid}). Skipping creation.`);
        // ถ้ามี Task อยู่แล้ว ให้ Sync Status แทน
        try {
          await syncWorkRequestStatusToBimTracking(docId, dataAfter);
        } catch (error) {
          logger.error(`[WR Sync/${docId}] Failed to UPDATE task status after DRAFT approval (Task existed):`, error);
          await event.data?.after.ref.update({ syncError: `Update status failed: ${(error as Error).message}` });
        }
      }
    }

    // --- Action 2: Handle Status Update (Sync currentStep) ---
    // ทำงานเมื่อเป็นการ Update, สถานะมีการเปลี่ยนแปลง, *และ* มี Task เชื่อมโยงอยู่แล้ว
    else if (isUpdate && dataBefore.status !== dataAfter.status && dataAfter.taskData?.taskUid) {
      logger.log(`[WR Sync/${docId}] Status update detected (${dataBefore.status} -> ${dataAfter.status}) with linked task ${dataAfter.taskData.taskUid}. Syncing status...`);
      try {
        await syncWorkRequestStatusToBimTracking(docId, dataAfter);
      } catch (error) {
        logger.error(`[WR Sync/${docId}] Failed to UPDATE task status in BIM Tracking:`, error);
        await event.data?.after.ref.update({ syncError: `Update status failed: ${(error as Error).message}` });
      }
    }

    // --- Action 3: Handle Initial Document Creation (Status: DRAFT) ---
    else if (isCreate && dataAfter.status === WR_STATUSES.DRAFT) {
      logger.log(`[WR Sync/${docId}] New Work Request created in DRAFT status. No BIM Tracking task created yet.`);
      // ไม่ต้องทำอะไร รอ PD/PM Approve
    }

    // --- Action 4: Handle WR Revision Creation (มี taskData ตั้งแต่แรก) ---
    // ทำงานเมื่อเป็นการ Create *และ* มี taskData มาตั้งแต่ต้น (ซึ่งมาจาก API create_revision)
    else if (isCreate && dataAfter.taskData?.taskUid) {
      logger.log(`[WR Sync/${docId}] New WR Revision detected with existing taskUid: ${dataAfter.taskData.taskUid}. Syncing link and status...`);
      try {
        const bimTrackingDb = getBimTrackingDb();
        const taskRef = bimTrackingDb.collection("tasks").doc(dataAfter.taskData.taskUid);

        // ตรวจสอบว่า Task มีอยู่จริงหรือไม่
        const taskDoc = await taskRef.get();
        if (!taskDoc.exists) {
          throw new Error(`Task ${dataAfter.taskData.taskUid} not found in BIM Tracking.`);
        }

        // อัปเดตสถานะ (currentStep) และ ลิ้งค์ (link) ไปยัง Task ใน BIM Tracking
        await taskRef.update({
          currentStep: dataAfter.status, // สถานะของ Revision ใหม่ (น่าจะเป็น PENDING_ACCEPTANCE)
          link: `${process.env.TTSDOC_APP_URL}/dashboard/work-request?docId=${docId}`, // ลิ้งค์ไปยังเอกสาร WR Revision ใหม่
          lastUpdate: admin.firestore.Timestamp.now(),
          // อาจจะอัปเดต documentNumber ด้วยก็ได้ ถ้าต้องการ
          // documentNumber: dataAfter.documentNumber
        });
        logger.log(`✅ [WR Sync/${docId}] Successfully synced new revision info to task ${dataAfter.taskData.taskUid}.`);
        // ลบ syncError ถ้า Sync สำเร็จ
        await event.data?.after.ref.update({ syncError: FieldValue.delete() });
      } catch (error) {
        logger.error(`[WR Sync/${docId}] Failed to sync new WR revision to BIM Tracking:`, error);
        await event.data?.after.ref.update({ syncError: `Revision sync failed: ${(error as Error).message}` });
      }
    }

    // --- อื่นๆ ---
    else {
      // Log เหตุการณ์ที่ไม่เข้าเงื่อนไขไหนเลย เพื่อ Debug
      const reason = isCreate ? 'create' : isUpdate ? 'update' : 'unknown';
      logger.log(`[WR Sync/${docId}] Event (${reason}) triggered but no specific action matched (Status Before: ${dataBefore?.status}, Status After: ${dataAfter?.status}, Task Linked: ${!!dataAfter?.taskData?.taskUid})`);
    }

    return null;
  }
);


// --- Helper function สำหรับสร้าง Task ใหม่ใน BIM Tracking ---
// (โค้ดส่วนนี้จากที่คุณส่งมาล่าสุด ถูกต้องแล้ว ไม่ต้องแก้ไข)
async function createBimTrackingTask(docId: string, dataAfter: any) {
  if (!dataAfter) throw new Error("Document data is missing for task creation.");

  const adminDb = getAdminDb();
  const bimTrackingDb = getBimTrackingDb();
  const workRequestDocRef = adminDb.collection('workRequests').doc(docId);

  // --- Logic การสร้าง taskNumber (เหมือนเดิม) ---
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

  // --- Logic การสร้าง Running Number และ Retry (เหมือนเดิม) ---
  const counterRef = bimTrackingDb.collection("projects").doc(projectId);
  let generatedTaskNumber: string = '';
  let attemptCount = 0;
  const maxAttempts = 10;

  while (attemptCount < maxAttempts) {
    const runningNo = await bimTrackingDb.runTransaction(async (transaction) => {
      const projectDoc = await transaction.get(counterRef);
      // เพิ่มการตรวจสอบ projectDoc.data() ก่อนเข้าถึง taskCounter
      const currentCounter = projectDoc.exists && projectDoc.data()?.taskCounter ? projectDoc.data()!.taskCounter : 0;
      const nextCounter = currentCounter + 1;
      logger.log(`[WR Sync/${docId}] Attempt ${attemptCount + 1}: Current taskCounter: ${currentCounter}, Next: ${nextCounter}`);
      transaction.update(counterRef, { taskCounter: nextCounter });
      return String(nextCounter).padStart(3, '0');
    });

    generatedTaskNumber = `TTS-BIM-${projectAbbr}-${activityOrder}-${runningNo}`;

    const existingTaskRef = bimTrackingDb.collection("tasks").doc(generatedTaskNumber);
    const existingTask = await existingTaskRef.get();

    if (!existingTask.exists) {
      logger.log(`[WR Sync/${docId}] ✅ Generated unique taskNumber: ${generatedTaskNumber}`);
      break;
    }

    logger.warn(`[WR Sync/${docId}] ⚠️ Task ${generatedTaskNumber} already exists. Retrying... (Attempt ${attemptCount + 1}/${maxAttempts})`);
    attemptCount++;
  }

  if (attemptCount >= maxAttempts) {
    throw new Error(`Failed to generate unique task number after ${maxAttempts} attempts. Last attempted: ${generatedTaskNumber}`);
  }
  // --- สิ้นสุด Logic Retry ---


  // --- เตรียมข้อมูลสำหรับสร้าง Task ใหม่ (เหมือนเดิม) ---
  const newTaskPayload = {
    taskName: dataAfter.taskName,
    taskCategory: "Work Request",
    projectId: projectId,
    planStartDate: null,
    startDate: null,
    // แปลง Timestamp เป็น Date ถ้ามี, ถ้าไม่มีใช้ null
    dueDate: dataAfter.dueDate?.toDate ? dataAfter.dueDate.toDate() : null,
    progress: 0,
    rev: "00",
    documentNumber: dataAfter.documentNumber, // เพิ่ม documentNumber
    estWorkload: 0,
    subTaskCount: 0,
    taskAssignee: "",
    taskNumber: generatedTaskNumber,
    totalWH: 0,
    lastUpdate: admin.firestore.Timestamp.now(),
    link: `${process.env.TTSDOC_APP_URL}/dashboard/work-request?docId=${docId}`,
    currentStep: dataAfter.status, // สถานะตอนนี้คือ PENDING_BIM
  };

  // --- สร้าง Task และอัปเดตข้อมูลกลับ (เหมือนเดิม) ---
  const newTaskRef = bimTrackingDb.collection("tasks").doc(generatedTaskNumber);
  try {
    await newTaskRef.create(newTaskPayload); // ใช้ create แทน set
    logger.log(`[WR Sync/${docId}] ✅ Successfully created task ${generatedTaskNumber} in BIM Tracking.`);
  } catch (error: any) {
    logger.error(`[WR Sync/${docId}] ❌ Failed to create task ${generatedTaskNumber}:`, error);
    // ลองตรวจสอบว่า Task ถูกสร้างไปแล้วหรือยัง (เผื่อกรณี Retry แล้วสำเร็จ แต่เกิด Error อื่น)
    const checkAgain = await newTaskRef.get();
    if (checkAgain.exists) {
      logger.warn(`[WR Sync/${docId}] Task ${generatedTaskNumber} was found after create failed. Proceeding to link.`);
    } else {
      throw new Error(`Task creation failed definitively: ${error.message}`);
    }
  }


  const taskDataToUpdate = {
    taskUid: newTaskRef.id,
    taskName: dataAfter.taskName,
    taskCategory: "Work Request",
    projectName: siteName,
  };

  await workRequestDocRef.update({
    taskData: taskDataToUpdate,
    syncError: FieldValue.delete() // ลบ Error เก่าเมื่อสำเร็จ
  });
  logger.log(`[WR Sync/${docId}] Successfully linked task ${generatedTaskNumber} back to ttsdoc.`);
}

// --- Helper function สำหรับ Sync Status ไป BIM Tracking ---
async function syncWorkRequestStatusToBimTracking(docId: string, dataAfter: any) {
  const taskUid = dataAfter.taskData?.taskUid;
  // --- 👇 [แก้ไข] ใช้ getAdminDb() ---
  const adminDb = getAdminDb();
  // --- 👆 สิ้นสุดการแก้ไข ---



  if (!taskUid) {
    logger.warn(`[WR Sync/${docId}] Cannot sync status, taskUid missing.`);
    // --- 👇 [แก้ไข] ใช้ adminDb ที่ประกาศไว้ ---
    await adminDb.collection('workRequests').doc(docId).update({ syncError: `Cannot sync status: Missing taskUid.` });
    // --- 👆 สิ้นสุดการแก้ไข ---
    return;
  }

  const bimTrackingDb = getBimTrackingDb();
  const taskRef = bimTrackingDb.collection("tasks").doc(taskUid);
  const taskSnap = await taskRef.get();

  if (!taskSnap.exists) {
    logger.error(`[WR Sync/${docId}] Task ${taskUid} not found. Cannot update status.`);
    // --- 👇 [แก้ไข] ใช้ adminDb ที่ประกาศไว้ ---
    await adminDb.collection('workRequests').doc(docId).update({ syncError: `Task ${taskUid} not found for status sync.` });
    // --- 👆 สิ้นสุดการแก้ไข ---
    return;
  }

  await taskRef.update({
    currentStep: dataAfter.status,
    link: `${process.env.TTSDOC_APP_URL}/dashboard/work-request?docId=${docId}`, // Sync Link ด้วย
    lastUpdate: admin.firestore.Timestamp.now(),
  });
  logger.log(`✅ [WR Sync/${docId}] Synced status (${dataAfter.status}) and link to task ${taskUid}.`);
  // --- 👇 [แก้ไข] ใช้ adminDb ที่ประกาศไว้ ---
  await adminDb.collection('workRequests').doc(docId).update({ syncError: FieldValue.delete() });
  // --- 👆 สิ้นสุดการแก้ไข ---
}

// --- 👆 สิ้นสุดการแก้ไข ---


