// src/lib/config/rfi-workflow.ts
//
// Single source of truth for the RFI workflow.
// Mirrors the shape of lib/config/workflow.ts (RFA) so both modules read the same way.
//
// Design decisions this file encodes (see the RFI design spec):
//   D-01  The UI never shows "Internal / External". `origin` is used for permissions only.
//   D-02  One question = one document. There is no linked-document pair.
//   D-03  Two numbers: runningNumber (always) + documentNumber (the CM-facing one).
//   D-04  Routing is locked to the creator's role. SITE can never ask BIM.
//
// The status field tracks the BIM <-> SITE track. The `awaitingCm` boolean tracks the
// CM track, which runs in PARALLEL: "answer BIM and forward to CM" leaves the document
// waiting on two parties at once, which a single status field cannot express.

import {
  ROLES,
  Role,
  REVIEWER_ROLES,
  RFA_SHOP_CATEGORIES,
} from '@/lib/config/workflow';
import { MUTED_PALETTE } from '@/lib/config/chartColors';

type ObjectValues<T> = T[keyof T];

// ---------------------------------------------------------------------------
// Statuses (main track: BIM <-> SITE)
// ---------------------------------------------------------------------------

export const RFI_STATUSES = {
  /** BIM asked, SITE has not answered yet. */
  PENDING_SITE: 'PENDING_SITE',
  /** BIM acknowledged but asked for more information. Back to SITE. */
  PENDING_SITE_MORE_INFO: 'PENDING_SITE_MORE_INFO',
  /** Forwarded to CM (or raised by SITE straight to CM) and nothing else is pending. */
  PENDING_CM: 'PENDING_CM',
  /** BIM closed the question. Note: not "finished" unless awaitingCm is false too. */
  CLOSED: 'CLOSED',
} as const;

export type RFIStatus = ObjectValues<typeof RFI_STATUSES>;

export const RFI_STATUS_LABELS: Record<string, string> = {
  [RFI_STATUSES.PENDING_SITE]: 'รอตรวจสอบ',
  [RFI_STATUSES.PENDING_SITE_MORE_INFO]: 'รอข้อมูลเพิ่มเติม',
  [RFI_STATUSES.PENDING_CM]: 'รอคำตอบ',
  [RFI_STATUSES.CLOSED]: 'ตอบกลับแล้ว',
};

// Same muted/earthy theme as RFA's status chart (via MUTED_PALETTE, '@/lib/config/chartColors')
// instead of a separate bright Tailwind palette, so the two modules read as one system.
export const RFI_STATUS_COLORS: Record<string, string> = {
  [RFI_STATUSES.PENDING_SITE]: MUTED_PALETTE.slateGrey,
  [RFI_STATUSES.PENDING_SITE_MORE_INFO]: MUTED_PALETTE.terracotta,
  [RFI_STATUSES.PENDING_CM]: MUTED_PALETTE.deepSlate,
  [RFI_STATUSES.CLOSED]: MUTED_PALETTE.mossGreen,
};

/**
 * Statuses a NEW document can actually reach. Status pickers and count strips that
 * should reflect the live pipeline read from this, not from RFI_STATUSES directly.
 */
export const RFI_ACTIVE_STATUSES: RFIStatus[] = [
  RFI_STATUSES.PENDING_SITE,
  RFI_STATUSES.PENDING_SITE_MORE_INFO,
  RFI_STATUSES.PENDING_CM,
  RFI_STATUSES.CLOSED,
];

/** Colour for the parallel CM track badge, shown alongside the status badge. */
export const RFI_AWAITING_CM_COLOR = '#8B5CF6';
export const RFI_AWAITING_CM_LABEL = 'รอ CM ตอบ';

/**
 * The label to render for a document's current state.
 *
 * Describes the STEP only — who is holding it is a separate concern, shown by the
 * responsible-party badges (getResponsibleParties), not this label.
 */
export function getRfiStatusLabel(doc: {
  status?: string;
  awaitingCm?: boolean;
  origin?: string;
}): string {
  return RFI_STATUS_LABELS[doc.status || ''] || doc.status || '-';
}

/** Companion to getRfiStatusLabel so colour and text never disagree. */
export function getRfiStatusColor(doc: {
  status?: string;
  awaitingCm?: boolean;
  origin?: string;
}): string {
  return RFI_STATUS_COLORS[doc.status || ''] || '#6B7280';
}

// ---------------------------------------------------------------------------
// Responsible party — what the UI shows instead of Internal/External (D-01)
// ---------------------------------------------------------------------------

export const RFI_PARTIES = {
  BIM: 'BIM',
  /** Mechanical + Electrical. Raises questions straight to CM, closes its own. */
  ME: 'ME',
  /** Sanitary + Plumbing. Same shape as ME, kept separate so neither closes the other's. */
  SN: 'SN',
  SITE: 'SITE',
  CM: 'CM',
  DONE: 'DONE',
} as const;

export type RFIParty = ObjectValues<typeof RFI_PARTIES>;

export const RFI_PARTY_LABELS: Record<RFIParty, string> = {
  BIM: 'รอ BIM',
  ME: 'รอ ME',
  SN: 'รอ SN',
  SITE: 'รอ SITE',
  CM: 'รอ CM',
  DONE: 'เสร็จแล้ว',
};

export const RFI_PARTY_COLORS: Record<RFIParty, string> = {
  BIM: '#F59E0B',
  ME: '#0EA5E9',
  SN: '#14B8A6',
  SITE: '#3B82F6',
  CM: '#8B5CF6',
  DONE: '#22C55E',
};

const STATUS_TO_PARTY: Record<string, RFIParty> = {
  [RFI_STATUSES.PENDING_SITE]: RFI_PARTIES.SITE,
  [RFI_STATUSES.PENDING_SITE_MORE_INFO]: RFI_PARTIES.SITE,
  [RFI_STATUSES.PENDING_CM]: RFI_PARTIES.CM,
  [RFI_STATUSES.CLOSED]: RFI_PARTIES.DONE,
};

/**
 * The party that raised the question. Defaults to BIM for documents with no origin.
 * Never returns DONE, so the result can index RFI_PARTY_ROLES directly.
 */
export function askerParty(origin?: string): Exclude<RFIParty, 'DONE'> {
  if (origin === 'ME') return RFI_PARTIES.ME;
  if (origin === 'SN') return RFI_PARTIES.SN;
  if (origin === 'SITE') return RFI_PARTIES.SITE;
  return RFI_PARTIES.BIM;
}

/**
 * Who has to act next. Returns MORE THAN ONE party for the
 * "answer BIM + forward to CM" case, where both are genuinely pending.
 * A document appears under every party it returns when filtering.
 */
export function getResponsibleParties(doc: {
  status?: string;
  awaitingCm?: boolean;
  origin?: string;
}): RFIParty[] {
  const parties: RFIParty[] = [];
  let fromStatus = doc.status ? STATUS_TO_PARTY[doc.status] : undefined;

  // Defensive: PENDING_CM with the CM track settled should not normally exist, because
  // CM_REPLY moves the status off PENDING_CM (toStatusWhenFrom). If a document ever
  // lands in that combination, it belongs to the asker, not to CM — reporting "waiting
  // on CM" after CM has answered would hide it from everyone.
  if (doc.status === RFI_STATUSES.PENDING_CM && doc.awaitingCm !== true) {
    fromStatus = askerParty(doc.origin);
  }

  if (fromStatus && fromStatus !== RFI_PARTIES.DONE) parties.push(fromStatus);
  if (doc.awaitingCm && !parties.includes(RFI_PARTIES.CM)) parties.push(RFI_PARTIES.CM);

  // Only "done" when the main track closed AND nothing is outstanding with CM.
  if (parties.length === 0) parties.push(RFI_PARTIES.DONE);

  return parties;
}

/** A question is only truly finished when both tracks are settled. */
export function isFullyClosed(doc: { status?: string; awaitingCm?: boolean }): boolean {
  return doc.status === RFI_STATUSES.CLOSED && doc.awaitingCm !== true;
}

/**
 * A date field reaches us in four different shapes depending on the path it took:
 *   Date                  — written client-side
 *   Firestore Timestamp   — read through either SDK (has .toDate())
 *   { _seconds } / { seconds } — the same Timestamp after JSON serialisation
 *   ISO string            — form input, or an API response
 *
 * Everything that reads a date goes through here. Doing the conversion inline is what
 * broke isOverdue before: `new Date(timestamp)` yields an Invalid Date, so every
 * document silently looked on-time.
 */
export type RFITimestampLike =
  | Date
  | string
  | number
  | { toDate?: () => Date; seconds?: number; _seconds?: number }
  | null;

export function toRfiDate(value: unknown): Date | null {
  if (!value) return null;

  const valid = (d: Date) => (Number.isNaN(d.getTime()) ? null : d);

  if (value instanceof Date) return valid(value);

  const candidate = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
  if (typeof candidate.toDate === 'function') return valid(candidate.toDate());

  const seconds = candidate._seconds ?? candidate.seconds;
  if (typeof seconds === 'number') return valid(new Date(seconds * 1000));

  if (typeof value === 'string' || typeof value === 'number') return valid(new Date(value));
  return null;
}

/**
 * dueDate is stored as UTC midnight of the calendar date the user picked (native
 * <input type="date"> parsed with `new Date("YYYY-MM-DD")`). "Overdue" has to mean
 * past the END of that day for the team actually using it — Asia/Bangkok, UTC+7 —
 * not past UTC midnight, or every document reads overdue ~17 hours too early.
 */
const BANGKOK_UTC_OFFSET_HOURS = 7;

/** 23:59:59.999 Asia/Bangkok on the stored due-date, expressed as a UTC epoch ms. */
function bangkokEndOfDayMs(due: Date): number {
  return due.getTime() + (24 - BANGKOK_UTC_OFFSET_HOURS) * 60 * 60 * 1000 - 1;
}

/** "Today" in Asia/Bangkok, as a UTC-midnight epoch ms — comparable to dueDate directly. */
function bangkokTodayUTCMidnightMs(): number {
  const bangkokNow = new Date(Date.now() + BANGKOK_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return Date.UTC(bangkokNow.getUTCFullYear(), bangkokNow.getUTCMonth(), bangkokNow.getUTCDate());
}

/** Overdue = past the due date (Bangkok end-of-day) and still waiting on someone. */
export function isOverdue(doc: {
  status?: string;
  awaitingCm?: boolean;
  dueDate?: unknown;
}): boolean {
  if (!doc.dueDate || isFullyClosed(doc)) return false;
  const due = toRfiDate(doc.dueDate);
  if (!due) return false;
  return bangkokEndOfDayMs(due) < Date.now();
}

/**
 * Whole calendar days remaining until the due date, Bangkok-anchored (negative once
 * it's past). null when there's no due date or the document is fully closed — the
 * single source RFIListTable and RFIDetailModal both read instead of each computing
 * their own (browser-local) version, which is what let the two disagree near midnight.
 */
export function getDaysUntilDue(doc: {
  status?: string;
  awaitingCm?: boolean;
  dueDate?: unknown;
}): number | null {
  if (!doc.dueDate || isFullyClosed(doc)) return null;
  const due = toRfiDate(doc.dueDate);
  if (!due) return null;
  const dueMidnight = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  return Math.round((dueMidnight - bangkokTodayUTCMidnightMs()) / (24 * 60 * 60 * 1000));
}

/** Whole days past the due date. 0 when not overdue. */
export function getDaysOverdue(doc: {
  status?: string;
  awaitingCm?: boolean;
  dueDate?: unknown;
}): number {
  if (!isOverdue(doc)) return 0;
  const remaining = getDaysUntilDue(doc);
  return remaining === null ? 0 : Math.max(0, -remaining);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const RFI_ACTIONS = {
  /** Document creation. The resulting status depends on the creator's role (D-04). */
  CREATE: 'CREATE',
  /** SITE answers BIM directly. */
  ANSWER: 'ANSWER',
  /** SITE cannot answer, sends the question on to CM. */
  FORWARD_TO_CM: 'FORWARD_TO_CM',
  /** SITE answers BIM AND forwards to CM in one go. Files can target each separately. */
  ANSWER_AND_FORWARD: 'ANSWER_AND_FORWARD',
  /** CM's reply is recorded. Clears the CM track WITHOUT touching `status`. */
  CM_REPLY: 'CM_REPLY',
  /** BIM accepts the answer and closes the question. */
  ACKNOWLEDGE: 'ACKNOWLEDGE',
  /** BIM accepts but needs more, sending it back to SITE. */
  REQUEST_MORE_INFO: 'REQUEST_MORE_INFO',
} as const;

export type RFIAction = ObjectValues<typeof RFI_ACTIONS>;

export const RFI_ACTION_LABELS: Record<RFIAction, string> = {
  [RFI_ACTIONS.CREATE]: 'สร้าง RFI',
  [RFI_ACTIONS.ANSWER]: 'ตอบกลับ',
  [RFI_ACTIONS.FORWARD_TO_CM]: 'ส่งต่อให้ CM',
  [RFI_ACTIONS.ANSWER_AND_FORWARD]: 'ตอบกลับ + ส่งต่อให้ CM',
  [RFI_ACTIONS.CM_REPLY]: 'บันทึกคำตอบจาก CM',
  [RFI_ACTIONS.ACKNOWLEDGE]: 'รับทราบ / ปิดงาน',
  [RFI_ACTIONS.REQUEST_MORE_INFO]: 'ขอข้อมูลเพิ่ม',
};

export interface RFITransition {
  /** Statuses this action may be performed from. `null` means "not status-gated". */
  from: RFIStatus[] | null;
  /** New status, or `null` to leave `status` untouched (CM_REPLY does this on purpose). */
  toStatus: RFIStatus | null;
  /**
   * Per-current-status override for `toStatus`, applied only when the document is in
   * the listed status. Used by CM_REPLY, which must NOT overwrite `status` in general
   * — the legacy system did, which reopened questions BIM had already closed — but
   * must move a document that is sitting at PENDING_CM with nothing else pending.
   * Without it, CM's answer would leave the document at PENDING_CM forever with no
   * action able to touch it.
   */
  toStatusWhenFrom?: Partial<Record<RFIStatus, RFIStatus>>;
  /** New value for the parallel CM track, or `null` to leave it untouched. */
  setAwaitingCm: boolean | null;
  /** Which party is allowed to perform it. See RFI_PARTY_ROLES for the role lists. */
  actor: Exclude<RFIParty, 'DONE'>;
  /**
   * When true, `actor` is ignored and the allowed party is whoever RAISED the question
   * (the document's `origin`). Closing is the one action that belongs to the asker:
   * a BIM question is closed by BIM, a SITE question by SITE. Without this, a
   * SITE-raised RFI could only be closed by BIM, who was never part of it.
   */
  actorIsAsker?: boolean;
  /**
   * Only valid on documents that have SITE in the middle — i.e. raised by BIM.
   * "Ask for more information" sends the question back to SITE, which is meaningless
   * on an ME / SN / SITE document: those went straight to CM, so there is no SITE
   * step to return to.
   */
  requiresSiteMiddleman?: boolean;
  /** Every action carries evidence except closing the question. */
  requiresFiles: boolean;
  /** The CM-facing document number must exist before the document reaches CM (D-03). */
  requiresCmNumber: boolean;
}

/**
 * The whole state machine in one table. The API route reads this rather than
 * re-implementing the rules in a switch statement.
 *
 * CREATE is absent on purpose: its outcome depends on the creator's role, so it lives
 * in RFI_CREATE_ROUTES below.
 */
export const RFI_TRANSITIONS: Record<Exclude<RFIAction, 'CREATE'>, RFITransition> = {
  [RFI_ACTIONS.ANSWER]: {
    // SITE answering directly now closes the document immediately — there is no more
    // acknowledge step for the asker to press. `REQUEST_MORE_INFO` (below) stays
    // available afterwards so the asker can still re-open this if the answer given
    // was incomplete.
    from: [RFI_STATUSES.PENDING_SITE, RFI_STATUSES.PENDING_SITE_MORE_INFO],
    toStatus: RFI_STATUSES.CLOSED,
    setAwaitingCm: null,
    actor: RFI_PARTIES.SITE,
    requiresFiles: true,
    requiresCmNumber: false,
  },
  [RFI_ACTIONS.FORWARD_TO_CM]: {
    from: [RFI_STATUSES.PENDING_SITE, RFI_STATUSES.PENDING_SITE_MORE_INFO],
    toStatus: RFI_STATUSES.PENDING_CM,
    setAwaitingCm: true,
    actor: RFI_PARTIES.SITE,
    requiresFiles: true,
    requiresCmNumber: true,
  },
  [RFI_ACTIONS.ANSWER_AND_FORWARD]: {
    // Rests at PENDING_CM, same as a plain forward — CM's reply is what closes it
    // (below), not this step. SITE's own answer here is just the note that travels
    // with the forward, not a closing event.
    from: [RFI_STATUSES.PENDING_SITE, RFI_STATUSES.PENDING_SITE_MORE_INFO],
    toStatus: RFI_STATUSES.PENDING_CM,
    setAwaitingCm: true,
    actor: RFI_PARTIES.SITE,
    requiresFiles: true,
    requiresCmNumber: true,
  },
  [RFI_ACTIONS.CM_REPLY]: {
    // Gated on awaitingCm, not on status — see evaluateAction in the API route.
    from: null,
    // Leaves `status` alone by default — see the PENDING_CM case below for the one
    // exception. A document still sitting at PENDING_CM has never had anyone else
    // decide anything yet, so CM's answer IS the closing event: no acknowledge step
    // follows it anymore, and `REQUEST_MORE_INFO` does not apply either (see its
    // block below evaluateAction in the API route) — once CM has answered, that is
    // final.
    toStatus: null,
    toStatusWhenFrom: { [RFI_STATUSES.PENDING_CM]: RFI_STATUSES.CLOSED },
    setAwaitingCm: false,
    actor: RFI_PARTIES.CM,
    requiresFiles: true,
    requiresCmNumber: false,
  },
  [RFI_ACTIONS.ACKNOWLEDGE]: {
    // No longer reachable from any status: ANSWER and CM_REPLY both close directly
    // now, so nothing routes through this action anymore. Kept as a permanently
    // inert entry (rather than deleted) because RFI_TRANSITIONS is typed as
    // Record<Exclude<RFIAction, 'CREATE'>, RFITransition> — every action needs an
    // entry. The action + label stay defined either way, so old workflow history
    // still renders correctly (see RFI_ACTION_LABELS above).
    from: [],
    toStatus: RFI_STATUSES.CLOSED,
    setAwaitingCm: null,
    // `actor` is the fallback for documents with no origin recorded; actorIsAsker is
    // what actually decides. Closing belongs to the team that asked: BIM closes BIM's
    // questions, ME closes ME's, SN closes SN's, SITE closes SITE's. Nobody closes
    // another team's question.
    actor: RFI_PARTIES.BIM,
    actorIsAsker: true,
    requiresFiles: false,
    requiresCmNumber: false,
  },
  [RFI_ACTIONS.REQUEST_MORE_INFO]: {
    // CLOSED is here so the asker can still send an incomplete SITE answer back for
    // more detail after auto-close. This must NOT apply once CM has answered — that
    // extra check (last workflow action === CM_REPLY) lives in evaluateAction in the
    // API route, since it needs the document's workflow history, not just its
    // current status.
    from: [RFI_STATUSES.CLOSED],
    toStatus: RFI_STATUSES.PENDING_SITE_MORE_INFO,
    setAwaitingCm: null,
    actor: RFI_PARTIES.BIM,
    actorIsAsker: true,
    // Sends the question back to SITE, so it only applies where SITE is in the loop.
    requiresSiteMiddleman: true,
    requiresFiles: true,
    requiresCmNumber: false,
  },
};

// ---------------------------------------------------------------------------
// Creation routing (D-04) — the creator's role decides where the document goes.
// There is deliberately no UI choice for this.
// ---------------------------------------------------------------------------

/**
 * Which team raised the question. FOUR values, not two, because ME and SN are neither
 * BIM nor SITE: they ask CM directly like SITE does, but they are their own teams and
 * must not be able to close each other's questions (or BIM's).
 *
 * Never rendered as a label (D-01). It drives routing and permissions only.
 */
export type RFIOrigin = 'BIM' | 'ME' | 'SN' | 'SITE';

export interface RFICreateRoute {
  status: RFIStatus;
  awaitingCm: boolean;
  requiresCmNumber: boolean;
  /** Link the document to a BIM Tracking task (BIM only — see the spec, section 8). */
  linksBimTracking: boolean;
}

/**
 * Only BIM's questions pass through SITE. ME, SN and SITE all go straight to CM, so
 * all three need the CM-facing number up front and none of them links a BIM Tracking
 * task — matching how RFA already treats them (api/rfa/[id]/route.ts:277 sends an
 * ME/SN submission straight to CM approval, skipping SITE review).
 */
export const RFI_CREATE_ROUTES: Record<RFIOrigin, RFICreateRoute> = {
  BIM: {
    status: RFI_STATUSES.PENDING_SITE,
    awaitingCm: false,
    requiresCmNumber: false,
    linksBimTracking: true,
  },
  ME: {
    status: RFI_STATUSES.PENDING_CM,
    awaitingCm: true,
    requiresCmNumber: true,
    linksBimTracking: false,
  },
  SN: {
    status: RFI_STATUSES.PENDING_CM,
    awaitingCm: true,
    requiresCmNumber: true,
    linksBimTracking: false,
  },
  SITE: {
    status: RFI_STATUSES.PENDING_CM,
    awaitingCm: true,
    requiresCmNumber: true,
    linksBimTracking: false,
  },
};

/** True when SITE sits between the asker and CM — only ever for a BIM-raised question. */
export function hasSiteMiddleman(origin?: string): boolean {
  return origin === 'BIM' || !origin;
}

// ---------------------------------------------------------------------------
// Role groups
// ---------------------------------------------------------------------------

/**
 * Each asking team is its OWN group, so closing cannot cross teams.
 *
 * ME and SN used to be lumped in with BIM here, which let an ME user close a question
 * BIM had raised — they are separate disciplines and separate documents, so they are
 * separate groups now. Admin is in every group as the system-wide override.
 */
export const RFI_BIM_ROLES: Role[] = [ROLES.BIM, ROLES.ADMIN];

/** Mechanical + Electrical. */
export const RFI_ME_ROLES: Role[] = [ROLES.ME, ROLES.ADMIN];

/** Sanitary + Plumbing. */
export const RFI_SN_ROLES: Role[] = [ROLES.SN, ROLES.ADMIN];

/**
 * The SITE side. Reuses RFA's REVIEWER_ROLES rather than duplicating the list,
 * so a role change stays in one place.
 */
export const RFI_SITE_ROLES: Role[] = REVIEWER_ROLES;

/** CM answers. On EXTERNAL-CM projects, SITE records the answer on their behalf. */
export const RFI_CM_ROLES: Role[] = [ROLES.CM, ROLES.ADMIN];

export const RFI_PARTY_ROLES: Record<Exclude<RFIParty, 'DONE'>, Role[]> = {
  BIM: RFI_BIM_ROLES,
  ME: RFI_ME_ROLES,
  SN: RFI_SN_ROLES,
  SITE: RFI_SITE_ROLES,
  CM: RFI_CM_ROLES,
};

/**
 * Which origin a creator's role produces. `null` means the role cannot create RFIs.
 *
 * Order matters: ME and SN are checked before SITE. Admin matches the BIM branch first
 * and so behaves like BIM (the most permissive route), and is a member of every group
 * below, so an Admin can still act on anything.
 */
export function getOriginForRole(role: Role | string): RFIOrigin | null {
  if (RFI_BIM_ROLES.includes(role as Role)) return 'BIM';
  if (RFI_ME_ROLES.includes(role as Role)) return 'ME';
  if (RFI_SN_ROLES.includes(role as Role)) return 'SN';
  if (RFI_SITE_ROLES.includes(role as Role)) return 'SITE';
  return null;
}

/**
 * Every role that can create an RFI — exactly the roles getOriginForRole answers for.
 *
 * DERIVED on purpose. This is what the create permission default and the "สร้าง RFI"
 * button read (see permissions.ts), so the UI can never offer a button the API would
 * then reject with 403: both sides come from the same arrays above.
 */
export const RFI_CREATOR_ROLES: Role[] = Array.from(
  new Set<Role>([
    ...RFI_BIM_ROLES,
    ...RFI_ME_ROLES,
    ...RFI_SN_ROLES,
    ...RFI_SITE_ROLES,
  ])
);

// ---------------------------------------------------------------------------
// Discipline categories (D-07)
// ---------------------------------------------------------------------------

/**
 * RFI disciplines are DERIVED from RFA's categories — there is no separate list.
 *
 * RFA's categories already name the disciplines ('Structural Drawings',
 * 'Architectural Drawings', ...). An RFI question belongs to the same disciplines,
 * just without the document-type suffix: 'Structural Drawings' and
 * 'Structural Asbuilt' are both structural work, and an RFI about either is simply
 * 'Structural'.
 *
 * Deriving instead of declaring means adding a discipline to RFA_SHOP_CATEGORIES
 * makes it appear for RFI too, with no second place to update.
 *
 * What BIM Tracking canNOT supply is the discipline of an RFI TASK — every RFI task
 * there is filed under 'Documents' (see ALLOWED_RFI_CATEGORIES). So the user picks the
 * discipline at creation, and the choices offered are RFA's, stripped as below.
 */

/** Suffix words that describe the document type rather than the discipline. */
const DISCIPLINE_NOISE = /\b(drawings?|asbuilt|as-built)\b/gi;

/** 'Structural Asbuilt' -> 'Structural'. Returns '' if nothing is left. */
export function toRfiDiscipline(rfaCategory: string): string {
  if (!rfaCategory) return '';
  return rfaCategory.replace(DISCIPLINE_NOISE, ' ').replace(/\s+/g, ' ').trim();
}

/** Map RFA categories to unique RFI disciplines, sorted. */
export function deriveRfiDisciplines(rfaCategories: string[]): string[] {
  const seen = new Set<string>();
  for (const category of rfaCategories) {
    const discipline = toRfiDiscipline(category);
    if (discipline) seen.add(discipline);
  }
  return Array.from(seen).sort();
}

/**
 * The complete discipline list, offered in full on every project.
 *
 * Deliberately NOT narrowed to the disciplines a project already has RFA work in:
 * a job often starts by asking questions, so RFI can legitimately come BEFORE any RFA
 * exists. Filtering by existing RFA tasks would leave a new project with an empty
 * dropdown and no way to open its first question.
 *
 * This is the same model RFA's manual flow uses (`isManualFlow` in
 * api/bim-tracking/categories/route.ts): a master list rather than a project-derived
 * one. It matters most for SITE-created RFIs, which carry no BIM Tracking task at all
 * (RFI_CREATE_ROUTES.SITE.linksBimTracking === false) and so have nothing to derive from.
 *
 * Being a plain constant, the form imports it directly instead of calling an API —
 * exactly what CreateRFAForm does on its manual path.
 */
/**
 * The disciplines BIM works in — derived from RFA's categories, so adding a category
 * to RFA_SHOP_CATEGORIES makes it appear here with no second list to update (D-07).
 */
export const RFI_BIM_DISCIPLINES = deriveRfiDisciplines(RFA_SHOP_CATEGORIES);

/** Mechanical + Electrical work. Not part of RFA's shop-drawing categories. */
export const RFI_ME_DISCIPLINES = ['Electrical', 'Mechanical'];

/** Sanitary + Plumbing work. */
export const RFI_SN_DISCIPLINES = ['Plumbing', 'Sanitary'];

/**
 * Disciplines BIM shares with ME and SN. Interior and Landscape both involve building
 * services, so all three teams legitimately raise questions about them.
 *
 * Intersected with RFI_BIM_DISCIPLINES rather than listed outright: if 'Interior
 * Drawings' is ever removed from RFA's categories, Interior disappears from BIM's list
 * AND from the shared list together, instead of surviving here as a ghost entry.
 */
const SHARED_WITH_BIM = ['Interior', 'Landscape'];
const sharedDisciplines = () =>
  RFI_BIM_DISCIPLINES.filter(d => SHARED_WITH_BIM.includes(d));

const sortedUnique = (values: string[]) => Array.from(new Set(values)).sort();

/**
 * Which disciplines a team may choose when raising a question.
 *
 * This is the second gate on top of `origin`. Origin already stops a team from CLOSING
 * another team's question; this stops them from OPENING one in a discipline that is not
 * theirs — an ME user cannot file a Structural question in the first place.
 *
 * SITE gets everything: SITE asks CM about whatever the site needs, and is not tied to
 * one discipline.
 */
export const RFI_DISCIPLINES_BY_ORIGIN: Record<RFIOrigin, string[]> = {
  BIM: sortedUnique(RFI_BIM_DISCIPLINES),
  ME: sortedUnique([...RFI_ME_DISCIPLINES, ...sharedDisciplines()]),
  SN: sortedUnique([...RFI_SN_DISCIPLINES, ...sharedDisciplines()]),
  SITE: sortedUnique([
    ...RFI_BIM_DISCIPLINES,
    ...RFI_ME_DISCIPLINES,
    ...RFI_SN_DISCIPLINES,
  ]),
};

/**
 * Every discipline in the system. Used for FILTERING a list, where a viewer must be
 * able to see all of them. Never use this to fill a create form — that needs
 * RFI_DISCIPLINES_BY_ORIGIN, or the form will offer a choice the API rejects.
 */
export const RFI_DISCIPLINES = RFI_DISCIPLINES_BY_ORIGIN.SITE;

/** Is this a real discipline for this team? Omit `origin` to check the whole system. */
export function isValidRfiDiscipline(discipline: string, origin?: RFIOrigin): boolean {
  const allowed = origin ? RFI_DISCIPLINES_BY_ORIGIN[origin] : RFI_DISCIPLINES;
  return allowed.includes(discipline);
}

// ---------------------------------------------------------------------------
// Running number (D-03, revised)
// ---------------------------------------------------------------------------

/**
 * ONE counter per project, shared by BIM and SITE.
 *
 * The origin is deliberately NOT part of the counter id. Both BIM and SITE can work
 * across several projects, so `RFI-BIM-0001` would repeat in every project and read as
 * the same document — the project code is what makes a number identifiable, not the
 * team that opened it. A shared counter also means the project has one continuous
 * sequence: BIM opens RFI-DBD-0001, SITE opens RFI-DBD-0002.
 *
 * Concurrency: two people creating at the same moment is safe as long as this counter
 * is read INSIDE a Firestore transaction. Firestore locks the counter document for the
 * duration, so the second writer waits, then reads the already-incremented value.
 * Reading it outside a transaction is what produces duplicate numbers.
 */
export const rfiCounterId = (siteId: string) => `${siteId}_RFI`;

/** Digits in the sequence part. 4 matches RFA (`RFA-SHOP-DBD-0001`). */
export const RFI_NUMBER_PAD = 4;

/**
 * `RFI-<project code>-<sequence>` — e.g. RFI-DBD-0001.
 * `siteShortName` is the site's `shortName` field, the same one RFA uses.
 */
export function buildRfiRunningNumber(siteShortName: string, sequence: number): string {
  return `RFI-${siteShortName}-${String(sequence).padStart(RFI_NUMBER_PAD, '0')}`;
}

// ---------------------------------------------------------------------------
// BIM Tracking (spec section 8)
// ---------------------------------------------------------------------------

/**
 * RFI work is logged under this task category in BIM Tracking.
 * RFA has eight drawing categories; RFI has one.
 *
 * The create form auto-selects when only one category comes back, so adding a second
 * entry here is all it takes to restore the dropdown — no component change needed.
 */
export const ALLOWED_RFI_CATEGORIES = ['Documents'];

/** One BIM Tracking task carries exactly one RFI, so creation checks for duplicates. */
export const RFI_ONE_PER_TASK = true;

// ---------------------------------------------------------------------------
// Files (spec section 7)
// ---------------------------------------------------------------------------

/**
 * Who a file is written for. Needed because ANSWER_AND_FORWARD uploads two sets in a
 * single action, so the flag lives on each file rather than on the workflow entry.
 * `null` for files with a single obvious recipient.
 */
export type RFIFileAudience = 'BIM' | 'CM' | null;

/** Upload slots in the detail modal. Extends RFA's 'action' | 'revision' pattern. */
export const RFI_UPLOAD_TARGETS = ['action', 'bim', 'cm'] as const;
export type RFIUploadTarget = (typeof RFI_UPLOAD_TARGETS)[number];

export const RFI_TARGET_TO_AUDIENCE: Record<RFIUploadTarget, RFIFileAudience> = {
  action: null,
  bim: 'BIM',
  cm: 'CM',
};
