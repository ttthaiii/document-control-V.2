// scripts/migrate-tasks.ts (Final Version with Official Abbreviations)
import { config } from "dotenv";
import { resolve } from "path";

// --- 1. โหลด Environment Variables ---
config({ path: resolve(process.cwd(), ".env.local") });

// --- 2. Import โมดูล ---
import admin from "firebase-admin";
import { google } from "googleapis";

// --- การตั้งค่า ---
const SHEET_ID = "18VbBeEheLrTdia0bTZqGMBpG_qxiMD4yjC2m4koiJCs";
const serviceAccountP2 = require("../keys/bim-tracking-firebase-adminsdk-fbsvc-ffc28dd2d6.json");

// --- Initialize App for Project 2 ---
let adminAppP2: admin.app.App;
if (!admin.apps.some((app) => app?.name === "Project2-Migration")) {
  adminAppP2 = admin.initializeApp({
    credential: admin.credential.cert(serviceAccountP2),
  }, "Project2-Migration");
} else {
  adminAppP2 = admin.app("Project2-Migration");
}
const db2 = adminAppP2.firestore();

// --- แผนที่สำหรับแปลงชื่อโครงการเต็มเป็นชื่อย่อ ---
const PROJECT_ABBREVIATIONS: { [key: string]: string } = {
    "ARTALE": "ART",
    "DH2-พรานนก": "DH2",
    "Live Raminta": "LMR",
    "BLOOM MENTAL WELLNESS HOSPITAL": "BMWH",
    "Image 49": "IMAGE",
    "Escent NST": "ESNKR3",
    "Bann Sansiri Bangna": "SSRB",
    "Thyme Bangna ": "Thyme", // Note the trailing space
    "SKV 12": "SKV12",
    "Valles Haus": "Haus5",
    "Hot Work": "Hot Work",
    "Bim room": "BIM",
    "Kromo": "KROMO",
    "Escent Hatyai 2": "ESHYT2",
    "Voco Bangkok Siam": "VBS",
};

/**
 * ฟังก์ชันสำหรับดึงข้อมูลจาก Google Sheet โดยตรง
 */
async function getSheetData(sheetName: string) {
  console.log(`📊 Reading from sheet: ${SHEET_ID}/${sheetName}`);
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: sheetName,
  });

  const rows = response.data.values;
  if (!rows || rows.length === 0) {
    throw new Error(`No data found in sheet: ${sheetName}`);
  }

  const headers = rows.shift() || [];
  return rows.map((row) => {
    const rowData: { [key: string]: any } = {};
    headers.forEach((header, index) => {
      rowData[header] = row[index] || null;
    });
    return rowData;
  });
}

async function migrateAllData() {
  console.log("🚀 Starting migration with official abbreviations...");

  try {
    const overviewRows = await getSheetData("DB_TaskOverview");
    const assignmentRows = await getSheetData("DB_TaskAssignment");
    console.log(`Found ${overviewRows.length} tasks and ${assignmentRows.length} sub-tasks.`);

    // --- Step 1: Projects ---
    const projectMap = new Map<string, { id: string; abbr: string }>();
    for (const fullName in PROJECT_ABBREVIATIONS) {
        const abbr = PROJECT_ABBREVIATIONS[fullName];
        const projectQuery = await db2.collection("projects").where("name", "==", fullName).limit(1).get();
        if (projectQuery.empty) {
            const newProjectRef = await db2.collection("projects").add({
                name: fullName,
                abbr: abbr,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            projectMap.set(fullName, { id: newProjectRef.id, abbr: abbr });
            console.log(`✅ Created project: "${fullName}" with abbreviation "${abbr}"`);
        } else {
            const docRef = projectQuery.docs[0].ref;
            await docRef.set({ abbr: abbr }, { merge: true });
            projectMap.set(fullName, { id: docRef.id, abbr: abbr });
        }
    }
    console.log(`✅ ${projectMap.size} projects are ready.`);

    // --- Step 2: Main Tasks with Auto ID ---
    const taskBatch = db2.batch();
    const taskRunningNumbers = new Map<string, number>();
    const taskNameToGeneratedIdMap = new Map<string, string>();
    let taskCount = 0;

    for (const row of overviewRows) {
      const projectName = row["โครงการ"];
      const taskCategory = row["หมวดงาน"];
      const taskName = row["ชื่องาน"];
      if (!projectName || !taskCategory || !taskName) continue;

      const projectInfo = projectMap.get(projectName);
      if (!projectInfo) {
        console.warn(`Skipping task, unknown project: "${projectName}"`);
        continue;
      }

      const categoryKey = `${projectInfo.abbr}-${taskCategory}`;
      const currentRunningNo = (taskRunningNumbers.get(categoryKey) || 0) + 1;
      taskRunningNumbers.set(categoryKey, currentRunningNo);
      
      const taskNumber = `${categoryKey}-${currentRunningNo.toString().padStart(3, "0")}`;
      taskNameToGeneratedIdMap.set(taskName, taskNumber);

      const taskRef = db2.collection("tasks").doc(taskNumber);
      taskBatch.set(taskRef, {
        taskName: taskName,
        taskAssignee: row["ผู้รับผิดชอบ"] || null,
        taskNumber: taskNumber,
        taskCategory: taskCategory,
        projectId: projectInfo.id,
        planStartDate: row["กำหนดเริ่ม"] || null,
        dueDate: row["กำหนดส่ง"] || null,
        estWorkload: parseFloat(row["รวม WorkLoad ประมาณการ"]) || 0,
        subtaskCount: parseInt(row["จำนวนงานย่อย"]) || 0,
        lastUpdate: row["วันที่อัพเดทล่าสุด"] || null,
        startDate: row["วันเริ่ม"] || null,
        endDate: row["วันจบ"] || null,
        totalMH: parseFloat(row["ชั่วโมงการทำงาน"]) || 0,
        progress: parseFloat(row["ความคืบหน้า"]) || 0,
        link: "",
        documentNumber: "",
        rev: "",
      });
      taskCount++;
    }
    await taskBatch.commit();
    console.log(`✅ Migrated ${taskCount} main tasks.`);

    // --- Step 3: Sub-tasks with Correct Batching ---
    const subtaskCommits = [];
    let subtaskBatch = db2.batch();
    let subtaskCountInBatch = 0;
    let totalSubtaskCount = 0;
    const subtaskRunningNumbers = new Map<string, number>();

    for (const row of assignmentRows) {
      const parentTaskName = row["ชื่องาน"];
      const parentTaskNumber = taskNameToGeneratedIdMap.get(parentTaskName);
      if (!parentTaskNumber) continue;

      const currentRunningNo = (subtaskRunningNumbers.get(parentTaskNumber) || 0) + 1;
      subtaskRunningNumbers.set(parentTaskNumber, currentRunningNo);
      const subTaskNumber = `${parentTaskNumber}-${currentRunningNo.toString().padStart(2, "0")}`;
      const subtaskRef = db2.collection("tasks").doc(parentTaskNumber).collection("subtasks").doc(subTaskNumber);
      
      // --- ส่วนที่แก้ไข ---
      const initialFiles = [];
      const oldLink = row["link ส่งงาน"] || row["link"] || null; // <-- ตรวจสอบทั้งสองชื่อคอลัมน์
      if (oldLink) {
        initialFiles.push({
          fileName: "Imported Link",
          fileUrl: oldLink,
          uploadedAt: new Date().toISOString(), // ใช้วันที่ปัจจุบัน
        });
      }

      subtaskBatch.set(subtaskRef, {
        subTaskNumber: subTaskNumber,
        taskName: parentTaskName,
        subTaskName: row["ส่วนขยาย"] || null,
        internalRev: row["ลำดับแก้ไขภายใน"] || null,
        subTaskScale: row["สเกลงาน"] || null,
        subTaskAssignee: row["ผู้รับผิดชอบ"] || null,
        subTaskProgress: parseFloat(row["ความคืบหน้า"]) || 0,
        lastUpdate: row["วันที่อัพเดตล่าสุด"] || null,
        startDate: row["วันเริ่ม"] || null,
        endDate: row["วันจบ"] || null,
        mhOD: parseFloat(row["ชั่วโมงปกติ"]) || 0,
        mhOT: parseFloat(row["ชั่วโมงโอที"]) || 0,
        subTaskCategory: row["หมวดงานย่อย"] || null,
        remark: row["หมายเหตุ"] || null,
        project: row["โครงการ"] || null,
        subTaskFiles: initialFiles, // <-- ใช้ Field ใหม่ที่เป็น Array
      });
      
      subtaskCountInBatch++;
      totalSubtaskCount++;

      if (subtaskCountInBatch >= 499) {
        subtaskCommits.push(subtaskBatch.commit());
        subtaskBatch = db2.batch();
        subtaskCountInBatch = 0;
      }
    }

    if (subtaskCountInBatch > 0) {
      subtaskCommits.push(subtaskBatch.commit());
    }
    
    await Promise.all(subtaskCommits);
    console.log(`✅ Migrated ${totalSubtaskCount} sub-tasks.`);

  } catch (error) {
    console.error("❌ Migration failed:", error);
  } finally {
    if (adminAppP2) {
      await adminAppP2.delete();
    }
  }
}

migrateAllData();