// src/types/rfa.ts
export interface RFAFile {
  fileName: string
  fileUrl: string
  filePath: string
  size: number
  contentType: string
  uploadedAt: string
  uploadedBy: string
}

export interface RFAWorkflowStep {
  step: string
  status: string
  userId: string
  userRole: string
  timestamp: string
  comments?: string
  action?: string // <-- ✅ 3. เพิ่ม 'action' (เป็น optional)
}

export interface RFAPermissions {
  canView: boolean
  canEdit: boolean
  canApprove: boolean
  canReject: boolean
  canForward: boolean // อันนี้อาจจะไม่ได้ใช้แล้ว แต่เก็บไว้ก่อนได้
  canAddFiles: boolean
  canDownloadFiles: boolean
  // --- ✅ 1. เพิ่ม Permissions สำหรับ Workflow ใหม่ ---
  canSendToCm?: boolean 
  canRequestRevision?: boolean
  canSubmitRevision?: boolean
  canApproveWithComments?: boolean
  canApproveRevisionRequired?: boolean
}

export interface RFACurrentUser {
  id: string
  role: string
  isCreator: boolean
  isAssigned: boolean
}

export interface RFASite {
  id: string
  name: string
}

export interface RFACategory {
  id: string
  categoryCode: string
  categoryName: string
}

export interface RFAUserInfo {
  email: string
  role: string
  profile?: {
    name?: string
    avatar?: string
  }
}

export interface RFADocument {
  id: string
  documentNumber: string
  rfaType: 'RFA-SHOP' | 'RFA-GEN' | 'RFA-MAT'
  title: string
  description: string
  status: string
  currentStep: string
  revisionNumber?: string
  createdAt: any // ใช้ any เพื่อความยืดหยุ่นกับ Timestamp ของ Firebase
  updatedAt: any // ใช้ any เพื่อความยืดหยุ่นกับ Timestamp ของ Firebase
  createdBy: string
  assignedTo?: string
  filesCount: number
  totalFileSize: number
  files: RFAFile[]
  site: RFASite
  category: RFACategory
  createdByInfo: RFAUserInfo
  assignedUserInfo?: RFAUserInfo
  workflow: RFAWorkflowStep[]
  permissions: RFAPermissions
  currentUser: RFACurrentUser
  metadata?: {
    [key: string]: any
  }
  usersInfo: Record<string, RFAUserInfo> // <-- ✅ 4. เพิ่ม usersInfo
}

// (ส่วนที่เหลือของไฟล์ไม่ต้องแก้ไข)
export interface RFAFilters {
  rfaType: 'ALL' | 'RFA-SHOP' | 'RFA-GEN' | 'RFA-MAT'
  status: 'ALL' | 'DRAFT' | 'PENDING_SITE_ADMIN' | 'PENDING_CM' | 'APPROVED' | 'REJECTED'
  assignedToMe: boolean
  createdByMe: boolean
  siteId: string | 'ALL'
}

export interface RFAStats {
  total: number
  pending: number
  approved: number
  draft: number
  assignedToMe: number
  byType: {
    'RFA-SHOP': number
    'RFA-GEN': number
    'RFA-MAT': number
  }
  byStatus: {
    DRAFT: number
    PENDING_SITE_ADMIN: number
    PENDING_CM: number
    APPROVED: number
    REJECTED: number
  }
}

export interface CreateRFAUser {
  id: string
  email: string
  role: 'BIM' | 'Site Admin' | 'CM' | 'Admin'
  sites: string[]
}