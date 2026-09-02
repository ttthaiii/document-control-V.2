import type { RFAWorkflowStep } from '@/types/rfa';

// Access/audit log grouping for the RFA history modal (T-027).
//
// Groups access events (view / download / edit-markup) under the workflow milestone that was
// ACTIVE when each event happened, so the UI can show "after X submitted, these people opened it".

export interface AccessLogEntry {
  id: string;
  userName: string;
  userRole: string;
  action: string;
  description?: string;
  resourceName?: string;
  createdAt: string | null; // ISO string (from the /api/rfa/[id]/activity endpoint)
  metadata?: Record<string, any>;
}

export interface MilestoneBucket {
  milestone: RFAWorkflowStep;
  index: number;
  events: AccessLogEntry[];
}

// Actions surfaced in the nested per-milestone access log. Milestone-type actions
// (CREATE/SUBMIT/APPROVE/REJECT/…) also live in activityLogs but belong to the workflow
// history itself, not the access log, so they are excluded here.
// VIEW_DETAIL (opening the detail modal) is intentionally EXCLUDED: every RFA doc carries an
// attached file, so "did they actually see the document" is measured by file-open (PREVIEW_FILE),
// not by opening the modal. VIEW_DETAIL is still logged for the admin activity dashboard.
export const ACCESS_ACTIONS: ReadonlySet<string> = new Set([
  'PREVIEW_FILE',
  'DOWNLOAD_FILE',
  'EDIT_MARKUP',
]);

const toMs = (iso: string | null | undefined): number => {
  if (!iso) return NaN;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? NaN : t;
};

/**
 * Groups access events under the workflow milestone that was ACTIVE when each event happened.
 *
 * Primary rule = TIME: an event belongs to the latest milestone whose timestamp <= the event
 * time. This is correct even when a status repeats across revision rounds (e.g. PENDING_REVIEW
 * appears twice) — matching by status string alone would wrongly attach the event to both.
 * metadata.documentStatus is kept only as a label on the event, never as the bucketing key.
 *
 * Events with no parseable time, or earlier than the first milestone, fall into the earliest
 * milestone bucket so nothing is silently dropped.
 */
export function groupAccessByMilestone(
  workflow: RFAWorkflowStep[],
  accessLogs: AccessLogEntry[]
): MilestoneBucket[] {
  const buckets: MilestoneBucket[] = (workflow || []).map((milestone, index) => ({
    milestone,
    index,
    events: [],
  }));
  if (buckets.length === 0) return buckets;

  // Milestone start times in chronological order, paired with their bucket index.
  const marks = buckets
    .map((b) => ({ index: b.index, ms: toMs(b.milestone.timestamp) }))
    .filter((m) => !Number.isNaN(m.ms))
    .sort((a, b) => a.ms - b.ms);

  const events = (accessLogs || []).filter((e) => ACCESS_ACTIONS.has(e.action));

  for (const event of events) {
    const evMs = toMs(event.createdAt);
    let target = 0; // default: first bucket (unparseable time)
    if (marks.length > 0) {
      if (Number.isNaN(evMs)) {
        target = marks[0].index;
      } else {
        // latest milestone whose start <= event time; else the earliest milestone
        let found = -1;
        for (const m of marks) {
          if (m.ms <= evMs) found = m.index;
          else break;
        }
        target = found === -1 ? marks[0].index : found;
      }
    }
    buckets[target].events.push(event);
  }

  // Newest-first within each bucket (latest access shows at the top under each milestone).
  for (const b of buckets) {
    b.events.sort((a, b2) => {
      const am = toMs(a.createdAt);
      const bm = toMs(b2.createdAt);
      if (Number.isNaN(am)) return 1; // unparseable times sink to the bottom
      if (Number.isNaN(bm)) return -1;
      return bm - am;
    });
  }
  return buckets;
}
