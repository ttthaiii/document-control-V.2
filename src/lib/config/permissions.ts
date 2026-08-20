// src/lib/config/permissions.ts

import { ROLES, Role } from '@/lib/config/workflow';
import { RFI_CREATOR_ROLES } from '@/lib/config/rfi-workflow';

export const PERMISSION_KEYS = {
  RFA: {
    VIEW_SHOP: 'view_shop',
    CREATE_SHOP: 'create_shop',

    VIEW_GEN: 'view_gen',
    CREATE_GEN: 'create_gen',

    VIEW_MAT: 'view_mat',
    CREATE_MAT: 'create_mat',

    APPROVE: 'can_approve',

    // --- สิทธิ์พิเศษแบบ Override รายบุคคล ---
    CAN_SEND_TO_CM: 'can_send_to_cm',           // ให้ส่งเอกสาร (PENDING_REVIEW → CM) ได้
    CAN_REQUEST_REVISION: 'can_request_revision', // ให้ขอแก้ไขจาก PENDING_REVIEW ได้
    CAN_REQUEST_SUPERSEDE: 'can_request_supersede', // ให้ขอแก้ไขเอกสารที่อนุมัติแล้วได้
  },
  RFI: {
    VIEW: 'view_rfi',
    CREATE: 'create_rfi',
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

  // --- RFA: Override พิเศษ (Default: ไม่มีใครได้ ต้องตั้ง Override เอง) ---
  [`RFA.${PERMISSION_KEYS.RFA.CAN_SEND_TO_CM}`]: [],
  [`RFA.${PERMISSION_KEYS.RFA.CAN_REQUEST_REVISION}`]: [],
  [`RFA.${PERMISSION_KEYS.RFA.CAN_REQUEST_SUPERSEDE}`]: [],

  // --- RFI ---
  [`RFI.${PERMISSION_KEYS.RFI.VIEW}`]: SIDEBAR_VIEWERS,
  // Create: NOT a hand-written list. RFI_CREATOR_ROLES is derived from the same arrays
  // getOriginForRole uses, so the button and the API always agree — add a role there
  // (rfi-workflow.ts) and it appears here too. A list typed out again would drift.
  [`RFI.${PERMISSION_KEYS.RFI.CREATE}`]: RFI_CREATOR_ROLES,

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
    title: 'RFA - สิทธิ์พิเศษ (Override)',
    permissions: [
      { key: `RFA.${PERMISSION_KEYS.RFA.CAN_SEND_TO_CM}`, label: 'ส่งเอกสารให้ CM ได้ (Send to CM)' },
      { key: `RFA.${PERMISSION_KEYS.RFA.CAN_REQUEST_REVISION}`, label: 'ขอแก้ไขเอกสาร (Request Revision)' },
      { key: `RFA.${PERMISSION_KEYS.RFA.CAN_REQUEST_SUPERSEDE}`, label: 'ขอแก้ไขเอกสารที่อนุมัติแล้ว (Request Supersede)' },
    ]
  },
  {
    title: 'RFI - ขอข้อมูลเพิ่มเติม',
    permissions: [
      { key: `RFI.${PERMISSION_KEYS.RFI.VIEW}`, label: 'เข้าดู (View)' },
      { key: `RFI.${PERMISSION_KEYS.RFI.CREATE}`, label: 'สร้าง (Create)' },
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