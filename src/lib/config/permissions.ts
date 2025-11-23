// src/lib/config/permissions.ts

import { ROLES, Role } from '@/lib/config/workflow';

export const PERMISSION_KEYS = {
  RFA: {
    VIEW_SHOP: 'view_shop',
    CREATE_SHOP: 'create_shop',
    
    VIEW_GEN: 'view_gen',
    CREATE_GEN: 'create_gen',
    
    VIEW_MAT: 'view_mat',
    CREATE_MAT: 'create_mat',
    
    APPROVE: 'can_approve',
  },
  WORK_REQUEST: {
    VIEW: 'view_wr',
    CREATE: 'create_wr',
    APPROVE: 'approve_wr',
    VERIFY: 'verify_wr',
  }
} as const;

// 1. ปรับกลุ่ม Viewer ทั่วไป (ตัด SE, FM ออก เพื่อให้ไม่เห็นเมนูใน Sidebar)
const COMMON_VIEWERS: Role[] = [
  ROLES.ADMIN, ROLES.PD, ROLES.PM, ROLES.SE, ROLES.FM, // Viewer Roles
  ROLES.BIM, ROLES.SITE_ADMIN, ROLES.CM, ROLES.ME, ROLES.SN, ROLES.OE, ROLES.PE // Active Roles
];

// กลุ่มที่เห็นเมนู Sidebar (ตัด SE/FM ออกตามโจทย์ "เข้าได้แค่หน้า Dashboard")
const SIDEBAR_VIEWERS: Role[] = [
  ROLES.ADMIN, ROLES.PD, ROLES.PM, 
  ROLES.BIM, ROLES.SITE_ADMIN, ROLES.CM, ROLES.ME, ROLES.SN, ROLES.OE, ROLES.PE
];

export const PERMISSION_DEFAULTS: Record<string, Role[]> = {
  // --- RFA: Shop Drawing ---
  // View: ใช้ SIDEBAR_VIEWERS แทน เพื่อซ่อนเมนูจาก SE/FM
  [`RFA.${PERMISSION_KEYS.RFA.VIEW_SHOP}`]: SIDEBAR_VIEWERS,
  // Create: BIM, ME, SN, Site Admin, PM, PE, OE, Admin
  [`RFA.${PERMISSION_KEYS.RFA.CREATE_SHOP}`]: [
    ROLES.BIM, ROLES.ME, ROLES.SN, 
    ROLES.SITE_ADMIN, ROLES.ADMIN, 
    ROLES.PM, ROLES.PE, ROLES.OE
  ],

  // --- RFA: General ---
  [`RFA.${PERMISSION_KEYS.RFA.VIEW_GEN}`]: SIDEBAR_VIEWERS,
  // Create: BIM, ME, SN, Site Admin, PM, PE, OE, Admin
  [`RFA.${PERMISSION_KEYS.RFA.CREATE_GEN}`]: [
    ROLES.BIM, ROLES.ME, ROLES.SN, 
    ROLES.SITE_ADMIN, ROLES.ADMIN, 
    ROLES.PM, ROLES.PE, ROLES.OE
  ],

  // --- RFA: Material ---
  [`RFA.${PERMISSION_KEYS.RFA.VIEW_MAT}`]: SIDEBAR_VIEWERS,
  // Create: Site Admin, PM, PE, OE, Admin (BIM ห้ามสร้าง)
  [`RFA.${PERMISSION_KEYS.RFA.CREATE_MAT}`]: [
    ROLES.SITE_ADMIN, ROLES.ADMIN, 
    ROLES.PM, ROLES.PE, ROLES.OE
  ],

  // --- RFA: Approval ---
  // Approve: CM, Site Admin, PM, PE, OE, Admin
  [`RFA.${PERMISSION_KEYS.RFA.APPROVE}`]: [
    ROLES.CM, ROLES.ADMIN, 
    ROLES.SITE_ADMIN, ROLES.PM, ROLES.PE, ROLES.OE
  ],

  // --- Work Request ---
  [`WR.${PERMISSION_KEYS.WORK_REQUEST.VIEW}`]: SIDEBAR_VIEWERS,
  [`WR.${PERMISSION_KEYS.WORK_REQUEST.CREATE}`]: [ROLES.PE, ROLES.OE, ROLES.ADMIN],
  [`WR.${PERMISSION_KEYS.WORK_REQUEST.APPROVE}`]: [ROLES.PM, ROLES.ADMIN],
  [`WR.${PERMISSION_KEYS.WORK_REQUEST.VERIFY}`]: [ROLES.SITE_ADMIN, ROLES.ADMIN, ROLES.BIM],
};

export const PERMISSION_GROUPS = [
  {
    title: 'RFA - Shop Drawing',
    permissions: [
      { key: `RFA.${PERMISSION_KEYS.RFA.VIEW_SHOP}`, label: 'เข้าดู (View)' },
      { key: `RFA.${PERMISSION_KEYS.RFA.CREATE_SHOP}`, label: 'สร้าง (Create)' },
    ]
  },
  {
    title: 'RFA - General',
    permissions: [
      { key: `RFA.${PERMISSION_KEYS.RFA.VIEW_GEN}`, label: 'เข้าดู (View)' },
      { key: `RFA.${PERMISSION_KEYS.RFA.CREATE_GEN}`, label: 'สร้าง (Create)' },
    ]
  },
  {
    title: 'RFA - Material',
    permissions: [
      { key: `RFA.${PERMISSION_KEYS.RFA.VIEW_MAT}`, label: 'เข้าดู (View)' },
      { key: `RFA.${PERMISSION_KEYS.RFA.CREATE_MAT}`, label: 'สร้าง (Create)' },
    ]
  },
  {
    title: 'RFA - Approval',
    permissions: [
      { key: `RFA.${PERMISSION_KEYS.RFA.APPROVE}`, label: 'อนุมัติเอกสาร (Approve)' },
    ]
  },
  {
    title: 'Work Request',
    permissions: [
      { key: `WR.${PERMISSION_KEYS.WORK_REQUEST.VIEW}`, label: 'เข้าดู (View)' },
      { key: `WR.${PERMISSION_KEYS.WORK_REQUEST.CREATE}`, label: 'สร้างใบคำขอ (Create)' },
      { key: `WR.${PERMISSION_KEYS.WORK_REQUEST.APPROVE}`, label: 'อนุมัติใบคำขอ (PM)' },
      { key: `WR.${PERMISSION_KEYS.WORK_REQUEST.VERIFY}`, label: 'ตรวจรับงาน (Site)' },
    ]
  }
];