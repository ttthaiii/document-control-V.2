import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { defineString } from 'firebase-functions/params';
import { getBimTrackingDb } from "./lib/firebase/admin";

// 🔽 **จุดแก้ไข:** ประกาศเฉพาะตัวแปรที่ไม่ใช่ Secret 🔽
defineString("TTSDOC_PROJECT_ID");
defineString("TTSDOC_CLIENT_EMAIL");
defineString("TTSDOC_STORAGE_BUCKET");

defineString("BIM_TRACKING_PROJECT_ID");
defineString("BIM_TRACKING_CLIENT_EMAIL");

const region = "asia-southeast1";

export const onRfaUpdate = onDocumentWritten(
  {
    document: "rfaDocuments/{docId}",
    region: region,
    // บอกให้ฟังก์ชันนี้ใช้ Secret ที่เราสร้างไว้ (เหมือนเดิม)
    secrets: [
        "TTSDOC_PRIVATE_KEY",
        "BIM_TRACKING_PRIVATE_KEY"
    ]
  },
  async (event) => {
    const docId = event.params.docId;
    const newData = event.data?.after.data();

    if (!newData) {
      logger.log(`Document ${docId} was deleted or has no data. No action taken.`);
      return null;
    }
    
    const taskData = newData.taskData;
    if (!taskData || !taskData.taskUid) {
      logger.warn(`Document ${docId} has no taskUid. Cannot sync back.`);
      return null;
    }

    const taskUid: string = taskData.taskUid;

    try {
      const bimTrackingDb = getBimTrackingDb();
      const rfaDocumentUrl = `https://ttsdocumentcontrol.web.app/rfa/${docId}`;
      const taskRef = bimTrackingDb.collection("tasks").doc(taskUid);
      
      await taskRef.update({
        link: rfaDocumentUrl,
        documentNumber: newData.documentNumber, // <-- เพิ่ม documentNumber
        rev: newData.revisionNumber,      // <-- เพิ่ม rev (แปลงเป็น String "R" + เลข)
      });

      logger.log(`✅ Successfully updated link for task ${taskUid}. URL: ${rfaDocumentUrl}`);
      return { success: true, taskId: taskUid };

    } catch (error) {
      logger.error(`❌ Failed to update link for task ${taskUid}:`, error);
      return { success: false, error: (error as Error).message };
    }
  }
);
