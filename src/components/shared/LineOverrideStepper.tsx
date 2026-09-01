import React, { useMemo } from 'react';
import { Check, X, Lock, Plus, Trash2, Circle, CheckCircle2, XCircle, MessageSquare } from 'lucide-react';
import {
  ROLES,
  EXTERNAL_STEP_STATUSES,
  Role,
  ExternalChain,
  OverrideStepInput,
} from '@/lib/config/workflow';

// Thai gloss for each external approver role (display only) — matches ExternalChainConfig.
const ROLE_LABELS: Record<string, string> = {
  CM: 'CM',
  Designer: 'ผู้ออกแบบ (Designer)',
  Owner: 'เจ้าของโครงการ (Owner)',
};

const STATUS_META: Record<string, { label: string; className: string; Icon: React.ComponentType<{ className?: string }> }> = {
  [EXTERNAL_STEP_STATUSES.APPROVED]: { label: 'อนุมัติแล้ว', className: 'text-green-600', Icon: CheckCircle2 },
  [EXTERNAL_STEP_STATUSES.APPROVED_WITH_COMMENTS]: { label: 'อนุมัติ (มีหมายเหตุ)', className: 'text-green-600', Icon: CheckCircle2 },
  [EXTERNAL_STEP_STATUSES.REJECTED]: { label: 'ไม่อนุมัติ', className: 'text-red-500', Icon: XCircle },
  [EXTERNAL_STEP_STATUSES.ANSWERED]: { label: 'ตอบกลับแล้ว', className: 'text-blue-600', Icon: MessageSquare },
  [EXTERNAL_STEP_STATUSES.PENDING]: { label: 'รอดำเนินการ', className: 'text-text-secondary', Icon: Circle },
};

interface LineOverrideStepperProps {
  chain: ExternalChain | undefined;
  /** True only when the viewer holds the active step AND the chain is not overrideLocked.
   *  Parent computes this via canEditLineOverride(chain, role). */
  canEdit: boolean;
  /** The edited future tail. Emitted on every add/remove; parent sends it as
   *  `overrideFutureSteps` when confirming the EXT_OVERRIDE_LINE action. */
  future: OverrideStepInput[];
  onChangeFuture: (steps: OverrideStepInput[]) => void;
}

/**
 * Infographic stepper for a document's external approval line (T-016 A3). Shows the whole
 * chain — past + active steps FROZEN (read-only), future steps editable when `canEdit`. The
 * viewer holding the active step can add/remove NOT-YET-REACHED steps; a MANDATORY future step
 * cannot be removed, and everything is read-only once the chain is overrideLocked (set by the
 * first send-back). Mirrors the engine's applyLineOverride invariants so the UI can never
 * propose an edit the server would reject.
 */
export default function LineOverrideStepper({ chain, canEdit, future, onChangeFuture }: LineOverrideStepperProps) {
  const active = chain?.currentStepIndex ?? 0;
  const frozen = useMemo(() => (chain ? chain.steps.slice(0, active + 1) : []), [chain, active]);
  const locked = !!chain?.overrideLocked;

  // Roles already used in the frozen head can't appear again (per-doc override keeps role
  // uniqueness — a Phase-A limitation; the MAIN admin line already supports repeats).
  const frozenRoles = useMemo(() => new Set(frozen.map((s) => s.role)), [frozen]);
  // Roles that MAY be added to the future — ANY role (T-016), minus those already frozen.
  const addableRoles = (Object.values(ROLES) as Role[]).filter((r) => !frozenRoles.has(r));
  const futureRoles = new Set(future.map((s) => s.role));

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

      <ol className="space-y-2">
        {/* Frozen head: past + active — read-only */}
        {frozen.map((step, i) => {
          const meta = STATUS_META[step.status] ?? STATUS_META[EXTERNAL_STEP_STATUSES.PENDING];
          const isActive = i === active;
          const Icon = meta.Icon;
          return (
            <li
              key={`frozen-${i}`}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                isActive ? 'border-brand bg-brand/5' : 'border-border-subtle bg-surface-raised'
              }`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-xs font-semibold text-text-secondary">
                {i + 1}
              </span>
              <span className="flex-1 text-sm text-text-body">
                {ROLE_LABELS[step.role] ?? step.role}
                {step.mandatory && <span className="ml-2 text-xs text-text-secondary">(บังคับ)</span>}
                {isActive && <span className="ml-2 text-xs font-semibold text-brand">← ขั้นปัจจุบัน</span>}
              </span>
              <span className={`inline-flex items-center gap-1 text-xs ${meta.className}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
                {meta.label}
              </span>
            </li>
          );
        })}

        {/* Future tail: editable when canEdit */}
        {future.map((step, i) => (
          <li
            key={`future-${step.role}`}
            className="flex items-center gap-3 rounded-lg border border-dashed border-border-subtle bg-surface-raised px-3 py-2"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-xs font-semibold text-text-secondary">
              {frozen.length + i + 1}
            </span>
            <span className="flex-1 text-sm text-text-body">
              {ROLE_LABELS[step.role] ?? step.role}
              {step.mandatory && <span className="ml-2 text-xs text-text-secondary">(บังคับ)</span>}
              <span className="ml-2 text-xs text-text-secondary">รอถึงคิว</span>
            </span>
            {canEdit && !step.mandatory && (
              <button
                type="button"
                onClick={() => removeFuture(step.role)}
                aria-label="ลบขั้นตอนนี้"
                className="text-text-secondary hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ol>

      {/* Add controls — only for the holder of the active step on an unlocked chain */}
      {canEdit && addableRoles.some((r) => !futureRoles.has(r)) && (
        <div className="flex flex-wrap gap-2">
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
                เพิ่ม {ROLE_LABELS[role] ?? role}
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
