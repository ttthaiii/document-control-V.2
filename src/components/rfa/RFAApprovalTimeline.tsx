import React, { useMemo } from 'react';
import { MapPin, Check, X, Plus, Trash2, Lock, CheckCircle2, XCircle, MessageSquare, Circle } from 'lucide-react';
import {
  ROLES,
  STATUSES,
  EXTERNAL_STEP_STATUSES,
  Role,
  ExternalChain,
  OverrideStepInput,
} from '@/lib/config/workflow';

// RFA-only replacement for the old vertical LineOverrideStepper list (T-019). RFI keeps using
// LineOverrideStepper unchanged — this component is intentionally NOT shared, so redesigning it
// can never touch RFI's rendering.

const CHAIN_ROLE_LABELS: Record<string, string> = {
  CM: 'CM',
  Designer: 'ผู้ออกแบบ (Designer)',
  Owner: 'เจ้าของโครงการ (Owner)',
};

// Roles that view the chain from OUTSIDE the contractor's own organization — for them, BIM's
// drafting + Site's internal review collapse into one "Contractor" node (T-019). Everyone else
// (BIM/Site/PM/etc., the contractor's own staff) sees the BIM/Site split, since that is their own
// internal process.
const EXTERNAL_VIEWER_ROLES: string[] = [ROLES.CM, ROLES.DESIGNER, ROLES.OWNER];

const TERMINAL_APPROVED_STATUSES: string[] = [
  STATUSES.APPROVED,
  STATUSES.APPROVED_WITH_COMMENTS,
  STATUSES.APPROVED_REVISION_REQUIRED,
];

const STEP_META: Record<string, { label: string; className: string; Icon: React.ComponentType<{ className?: string }> }> = {
  [EXTERNAL_STEP_STATUSES.APPROVED]: { label: 'อนุมัติแล้ว', className: 'text-green-600', Icon: CheckCircle2 },
  [EXTERNAL_STEP_STATUSES.APPROVED_WITH_COMMENTS]: { label: 'อนุมัติ (มีหมายเหตุ)', className: 'text-green-600', Icon: CheckCircle2 },
  [EXTERNAL_STEP_STATUSES.REJECTED]: { label: 'ไม่อนุมัติ', className: 'text-red-500', Icon: XCircle },
  [EXTERNAL_STEP_STATUSES.ANSWERED]: { label: 'ตอบกลับแล้ว', className: 'text-blue-600', Icon: MessageSquare },
  [EXTERNAL_STEP_STATUSES.PENDING]: { label: 'รอดำเนินการ', className: 'text-text-secondary', Icon: Circle },
};

type NodeState = 'done' | 'active' | 'upcoming' | 'rejected';

interface TimelineNode {
  key: string;
  label: string;
  state: NodeState;
  caption?: { label: string; className: string; Icon: React.ComponentType<{ className?: string }> };
}

interface RFAApprovalTimelineProps {
  chain: ExternalChain | undefined;
  /** document.status — needed because the chain is pre-seeded at creation time, so
   *  chain.currentStepIndex alone can't tell "hasn't reached the chain yet" from "at step 0". */
  documentStatus: string;
  viewerRole?: string;
  /** True only when the viewer holds the active step AND the chain is not overrideLocked. */
  canEdit: boolean;
  future: OverrideStepInput[];
  onChangeFuture: (steps: OverrideStepInput[]) => void;
}

export default function RFAApprovalTimeline({
  chain,
  documentStatus,
  viewerRole,
  canEdit,
  future,
  onChangeFuture,
}: RFAApprovalTimelineProps) {
  const isExternalViewer = !!viewerRole && EXTERNAL_VIEWER_ROLES.includes(viewerRole);
  const inChain = documentStatus === STATUSES.PENDING_EXTERNAL_APPROVAL;
  const isApproved = TERMINAL_APPROVED_STATUSES.includes(documentStatus);
  const isRejected = documentStatus === STATUSES.REJECTED;
  // Doc hasn't reached the chain yet (still with BIM/Site) — the chain is seeded from the
  // moment the document is created, so currentStepIndex being 0 does NOT mean CM's turn has
  // started. Without this check the stepper wrongly points at CM the whole time the doc sits
  // at PENDING_REVIEW/REVISION_REQUIRED.
  const preChain = !inChain && !isApproved && !isRejected;

  const active = chain?.currentStepIndex ?? 0;
  const frozen = useMemo(() => (chain ? chain.steps.slice(0, active + 1) : []), [chain, active]);
  const frozenRoles = useMemo(() => new Set(frozen.map((s) => s.role)), [frozen]);
  const addableRoles = (Object.values(ROLES) as Role[]).filter((r) => !frozenRoles.has(r));
  const futureRoles = new Set(future.map((s) => s.role));
  const locked = !!chain?.overrideLocked;

  const preChainNodes: TimelineNode[] = useMemo(() => {
    if (isExternalViewer) {
      return [{ key: 'contractor', label: 'ผู้รับเหมา (Contractor)', state: preChain ? 'active' : 'done' }];
    }
    const activeKey = documentStatus === STATUSES.REVISION_REQUIRED ? 'bim' : 'site';
    return [
      { key: 'bim', label: 'BIM (ผู้จัดทำ)', state: !preChain ? 'done' : activeKey === 'bim' ? 'active' : 'upcoming' },
      { key: 'site', label: 'Site (ผู้ตรวจสอบ)', state: !preChain ? 'done' : activeKey === 'site' ? 'active' : 'upcoming' },
    ];
  }, [isExternalViewer, preChain, documentStatus]);

  // Only the FROZEN head (past + active step) is rendered here — steps beyond `active` are
  // represented by the separate, editable `future` list below, so a not-yet-reached stage is
  // never shown twice (once as a plain chain step, once as a future-tail pill).
  const chainNodes: TimelineNode[] = useMemo(() => {
    if (!chain) return [];
    return frozen.map((s, i) => {
      let state: NodeState = 'upcoming';
      let caption: TimelineNode['caption'];
      if (preChain) {
        state = 'upcoming'; // chain hasn't started moving yet, regardless of currentStepIndex
      } else if (isApproved) {
        state = 'done';
        caption = STEP_META[s.status];
      } else if (isRejected) {
        if (s.status === EXTERNAL_STEP_STATUSES.REJECTED) { state = 'rejected'; caption = STEP_META[s.status]; }
        else if (i < active) { state = 'done'; caption = STEP_META[s.status]; }
        else state = 'upcoming';
      } else if (inChain) {
        if (i < active) { state = 'done'; caption = STEP_META[s.status]; }
        else if (i === active) state = 'active';
        else state = 'upcoming';
      }
      return { key: `chain-${i}`, label: CHAIN_ROLE_LABELS[s.role] ?? s.role, state, caption };
    });
  }, [chain, frozen, preChain, isApproved, isRejected, inChain, active]);

  const removeFuture = (role: Role) => {
    if (!canEdit) return;
    const step = future.find((s) => s.role === role);
    if (step?.mandatory) return; // mandatory steps are non-removable
    onChangeFuture(future.filter((s) => s.role !== role));
  };

  const addFuture = (role: Role) => {
    if (!canEdit || futureRoles.has(role) || frozenRoles.has(role)) return;
    onChangeFuture([...future, { role, mandatory: false }]);
  };

  if (!chain || chain.steps.length === 0) {
    return <p className="text-sm text-text-secondary">ยังไม่มีสายอนุมัติภายนอกสำหรับเอกสารนี้</p>;
  }

  const allNodes = [...preChainNodes, ...chainNodes];

  const pillClass = (state: NodeState) =>
    state === 'active'
      ? 'border-brand bg-brand/10 text-brand font-semibold'
      : state === 'done'
        ? 'border-green-200 bg-green-50 text-green-700'
        : state === 'rejected'
          ? 'border-red-200 bg-red-50 text-red-600'
          : 'border-border-subtle bg-surface-sunken text-text-secondary';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text-body">เส้นทางการอนุมัติ (Approval Line)</p>
        {locked && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" /> ล็อกแล้ว (มีการส่งกลับ)
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-y-6">
        {allNodes.map((node, i) => (
          <React.Fragment key={node.key}>
            {i > 0 && <div className="mt-4 h-px w-6 shrink-0 self-start bg-border-subtle sm:w-10" aria-hidden="true" />}
            <div className="flex flex-col items-center gap-1">
              <span className="flex h-5 w-5 items-center justify-center" aria-hidden="true">
                {node.state === 'active' && <MapPin className="h-5 w-5 text-red-500" />}
              </span>
              <span className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${pillClass(node.state)}`}>
                {node.label}
              </span>
              {node.caption && (
                <span className={`inline-flex items-center gap-1 text-[11px] ${node.caption.className}`}>
                  <node.caption.Icon className="h-3 w-3" aria-hidden="true" />
                  {node.caption.label}
                </span>
              )}
            </div>
          </React.Fragment>
        ))}

        {/* Future tail — editable by the current chain holder only */}
        {future.map((step) => (
          <React.Fragment key={`future-${step.role}`}>
            <div className="mt-4 h-px w-6 shrink-0 self-start bg-border-subtle sm:w-10" aria-hidden="true" />
            <div className="flex flex-col items-center gap-1">
              <span className="h-5 w-5" aria-hidden="true" />
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-border-subtle bg-surface-raised px-3 py-1 text-xs text-text-secondary">
                {CHAIN_ROLE_LABELS[step.role] ?? step.role}
                {step.mandatory && <span className="text-[10px]">(บังคับ)</span>}
                {canEdit && !step.mandatory && (
                  <button
                    type="button"
                    onClick={() => removeFuture(step.role)}
                    aria-label="ลบขั้นตอนนี้"
                    className="text-text-secondary hover:text-red-500"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  </button>
                )}
              </span>
              <span className="text-[11px] text-text-secondary">รอถึงคิว</span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {canEdit && addableRoles.some((r) => !futureRoles.has(r)) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
          <span className="self-center text-xs text-text-secondary">เพิ่มขั้นตอนถัดไป:</span>
          {addableRoles
            .filter((r) => !futureRoles.has(r))
            .map((role) => (
              <button
                key={`add-${role}`}
                type="button"
                onClick={() => addFuture(role)}
                className="inline-flex items-center gap-1 rounded-lg border border-border-subtle bg-surface-raised px-3 py-1.5 text-xs text-text-body hover:border-brand hover:text-brand"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {CHAIN_ROLE_LABELS[role] ?? role}
              </button>
            ))}
        </div>
      )}

      {!canEdit && !locked && (
        <p className="text-xs text-text-secondary">
          <X className="mr-1 inline h-3 w-3" aria-hidden="true" />
          เฉพาะผู้ที่ถือขั้นปัจจุบันเท่านั้นที่ปรับเส้นทางได้
        </p>
      )}
      {canEdit && (
        <p className="text-xs text-text-secondary">
          <Check className="mr-1 inline h-3 w-3 text-green-600" aria-hidden="true" />
          ปรับได้เฉพาะขั้นในอนาคต — ขั้นที่ผ่านแล้วและขั้นปัจจุบันจะไม่ถูกแตะ
        </p>
      )}
    </div>
  );
}
