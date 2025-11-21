// src/lib/auth/permission-check.ts
import { adminDb } from "@/lib/firebase/admin";
import { Role, ROLES } from "@/lib/config/workflow";

// Define Default Permissions
const DEFAULT_PERMISSIONS = {
  RFA: {
    create_shop: [ROLES.BIM, ROLES.ME, ROLES.SN, ROLES.ADMIN],
    create_gen: [ROLES.BIM, ROLES.SITE_ADMIN, ROLES.ADMIN, ROLES.ME, ROLES.SN],
    create_mat: [ROLES.SITE_ADMIN, ROLES.ADMIN, ROLES.OE, ROLES.PE],
    review: [ROLES.SITE_ADMIN, ROLES.ADMIN_SITE_2, ROLES.OE, ROLES.PE, ROLES.ADMIN],
    approve: [ROLES.CM, ROLES.PD, ROLES.ADMIN]
  },
  WORK_REQUEST: {
    create: [ROLES.PE, ROLES.OE, ROLES.ADMIN],
    approve_draft: [ROLES.PD, ROLES.PM, ROLES.ADMIN],
    execute: [ROLES.BIM],
    inspect: [ROLES.SITE_ADMIN, ROLES.ADMIN_SITE_2, ROLES.OE, ROLES.PE, ROLES.ADMIN]
  }
};

type Module = 'RFA' | 'WORK_REQUEST';

export async function checkPermission(
  siteId: string, 
  userRole: Role, 
  module: Module, 
  action: string,
  userId?: string // 👈 รับ userId เพิ่มเข้ามา (Optional)
): Promise<boolean> {
  try {
    if (userRole === 'Admin') return true;

    // 1. ดึง Config ของ Site
    const siteDoc = await adminDb.collection('sites').doc(siteId).get();
    if (!siteDoc.exists) return false; // ถ้าไม่เจอ Site ให้ปฏิเสธเลย
    
    const siteData = siteDoc.data();
    const roleSettings = siteData?.roleSettings;
    const overrides = siteData?.userOverrides; // ดึงค่า Overrides

    // 📌 2. เช็คสิทธิ์รายบุคคล (User Override) ก่อนเสมอ
    if (userId && overrides && overrides[userId]) {
      const userModule = overrides[userId][module];
      // ถ้ามีการกำหนดค่าไว้ (true/false) ให้ใช้ค่านั้นเลย ไม่สน Role
      if (userModule && typeof userModule[action] === 'boolean') {
        return userModule[action]; 
      }
    }

    // 📌 3. ถ้าไม่มี Override ให้เช็คสิทธิ์ตาม Role (จาก DB Config)
    if (roleSettings && roleSettings[module]) {
        const moduleActions = roleSettings[module];
        if (moduleActions && Array.isArray(moduleActions[action])) {
             return moduleActions[action].includes(userRole);
        }
    }

    // 📌 4. Default Fallback (ถ้าไม่มีใน DB เลย)
    // @ts-ignore
    const defaultAllowed = DEFAULT_PERMISSIONS[module]?.[action] || [];
    return defaultAllowed.includes(userRole);

  } catch (error) {
    console.error(`Permission check error [${module}:${action}]:`, error);
    return false;
  }
}