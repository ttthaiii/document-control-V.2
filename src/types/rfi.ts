// src/types/rfi.ts
//
// Types for the RFI module. Deliberately parallel to types/rfa.ts so the two modules
// read the same way — but with four differences worth knowing up front:
//
//   1. `awaitingCm` is a second, PARALLEL track. See rfi-workflow.ts for why.
//   2. Files carry an `audience` ('BIM' | 'CM') because one action can upload two sets.
//   3. `dueDate` exists. RFA has no due date; RFI does.
//   4. No revision / supersede fields. An RFI is a question, not a published document.

import { Role } from '@/lib/config/workflow';
import {
  RFIStatus,
  RFIAction,
  RFIOrigin,
  RFIParty,
  RFIFileAudience,
  RFITimestampLike,
} from '@/lib/config/rfi-workflow';

export interface RFISite {
  id: string;
  name: string;
  /** INTERNAL = CM uses this system. EXTERNAL = SITE records CM's answers for them. */
  cmSystemType?: 'INTERNAL' | 'EXTERNAL';
}

/**
 * A discipline from RFI_DISCIPLINES. `categoryCode` is the name as shown ('Structural');
 * `id` is its slug in sites/{siteId}/categories ('STRUCTURAL'), written by ensureCategory.
 */
export interface RFICategory {
  id: string;
  categoryCode: string;
  categoryName?: string;
}

export interface RFIUserInfo {
  email: string;
  role: string;
  profile?: {
    name?: string;
    avatar?: string;
  };
}

export interface RFIFile {
  fileName: string;
  fileUrl: string;
  filePath: string;
  size: number;
  fileSize: number;
  contentType: string;
  uploadedAt: string;
  uploadedBy: string;
  /**
   * Who this file is written for. Set when a single action produces files for
   * different recipients (SITE answering BIM while also asking CM).
   * Filter on this before showing a "latest files" list, or BIM sees CM's copy.
   */
  audience?: RFIFileAudience;
}

/** One entry per action. This array is the document's history and feeds the timeline. */
export interface RFIWorkflowStep {
  action: RFIAction | string;
  status: RFIStatus | string;
  userId: string;
  userName: string;
  role: Role | string;
  timestamp: string;
  comments?: string;
  files?: RFIFile[];
  /** Snapshot of awaitingCm after this step, so the timeline can show the CM track. */
  awaitingCm?: boolean;
}

/** Link back to a BIM Tracking task. Null when SITE created the RFI. */
export interface RFITaskData {
  taskCategory: string;
  taskName: string;
  projectName: string;
  taskUid?: string;
}

/** Computed server-side per request. The UI renders buttons from these, never from roles. */
export interface RFIPermissions {
  canView: boolean;
  canDownloadFiles: boolean;
  /** SITE: answer BIM directly. */
  canAnswer: boolean;
  /** SITE: pass the question to CM. Requires a CM document number. */
  canForwardToCm: boolean;
  /** SITE: both at once, with separate file sets. */
  canAnswerAndForward: boolean;
  /** CM (or SITE on EXTERNAL-CM projects): record the reply. */
  canRecordCmReply: boolean;
  /** BIM: accept and close. */
  canAcknowledge: boolean;
  /** BIM: accept but send back for more. */
  canRequestMoreInfo: boolean;
}

export interface RFICurrentUser {
  id: string;
  role: Role;
  isCreator: boolean;
}

export interface RFIDocument {
  id: string;

  // --- Identity (D-03: two numbers, see the spec section 6) ---
  /** Always present. Generated in a Firestore transaction at creation. */
  runningNumber: string;
  /** The number CM references. Optional until the document is sent to CM. */
  documentNumber?: string;
  title: string;
  description: string;

  // --- Origin (D-01: never rendered as a label; drives permissions only) ---
  origin: RFIOrigin;

  // --- Two-track state (see rfi-workflow.ts) ---
  status: RFIStatus;
  /** Kept in sync with `status`, matching the RFA document shape. */
  currentStep: string;
  /** The parallel CM track. True while an answer from CM is still outstanding. */
  awaitingCm: boolean;
  /** Sticky once true: has this document ever reached CM? Drives the CM dashboard
   * filter (roadmap T-007) — awaitingCm alone can't tell "never involved CM" apart
   * from "CM already answered", since CM_REPLY clears it back to false. */
  cmInvolved?: boolean;

  // --- Dates ---
  // Timestamp on read, Date on write, ISO string over an API boundary — read every one
  // of these through toRfiDate() rather than `new Date(...)`, which silently produces
  // an Invalid Date for a Timestamp.
  createdAt: RFITimestampLike;
  updatedAt: RFITimestampLike;
  dueDate?: RFITimestampLike;
  answeredAt?: RFITimestampLike;
  closedAt?: RFITimestampLike;

  // --- People ---
  createdBy: string;
  updatedBy?: string;
  createdByInfo?: RFIUserInfo;
  usersInfo?: Record<string, RFIUserInfo>;

  // --- Relations ---
  site: RFISite;
  category: RFICategory;
  /** Null when SITE created the RFI — SITE questions are not BIM Tracking work. */
  taskData?: RFITaskData | null;

  // --- Content ---
  /**
   * Every file attached so far, oldest first. APPENDED on each action, not replaced:
   * an RFI is a conversation, so BIM's question, SITE's answer and CM's reply all stay
   * available. Each file carries an `audience` saying which side it is for.
   * (RFA replaces instead, because a new revision supersedes the old drawing.)
   * `workflow[].files` holds the subset added by one specific action.
   */
  files: RFIFile[];
  filesCount?: number;
  totalFileSize?: number;
  workflow: RFIWorkflowStep[];

  // --- Per-request ---
  permissions: RFIPermissions;
  currentUser?: RFICurrentUser;

  metadata?: Record<string, unknown>;
}

/** Shape written to Firestore on create, before server-side fields are added. */
export interface CreateRFIPayload {
  siteId: string;
  /**
   * A discipline NAME from RFI_DISCIPLINES ('Structural' | 'Architectural' | ...),
   * not a BIM Tracking category. BIM Tracking files every RFI under 'Documents', so
   * the discipline comes from RFA's category list with the document-type words
   * stripped. The API rejects anything outside that set (D-07).
   */
  categoryId: string;
  title: string;
  description?: string;
  /** Optional. BIM may supply it; otherwise SITE fills it in when forwarding. */
  documentNumber?: string;
  dueDate?: string | null;
  taskData?: RFITaskData | null;
  uploadedFiles: RFIFile[];
}

/** Shape sent to PUT /api/rfi/[id]. */
export interface RFIActionPayload {
  action: RFIAction;
  comments?: string;
  /** Files for this action. `audience` decides which recipient each one belongs to. */
  newFiles?: RFIFile[];
  /** Required for the actions that push the document to CM. */
  documentNumber?: string;
}

export interface RFIFilters {
  status: RFIStatus | 'ALL';
  /** What the UI shows in place of Internal/External (D-01). */
  responsibleParty: RFIParty | 'ALL';
  siteId: string | 'ALL';
  categoryId: string | 'ALL';
  overdueOnly: boolean;
}

export interface RFIStats {
  total: number;
  overdue: number;
  byParty: Record<RFIParty, number>;
  byStatus: Record<string, number>;
}

export interface CreateRFIUser {
  id: string;
  email: string;
  role: Role;
  sites: string[];
}
