import React from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { EXTERNAL_APPROVER_ROLES, Role } from '@/lib/config/workflow';

export interface ExternalChainStepConfig {
  role: Role;
  order: number;
}

interface ExternalChainConfigProps {
  /** Controlled value — the configured chain steps (sorted by order). */
  value: ExternalChainStepConfig[];
  /** Emits the new chain (always sorted, order normalized 1..n). */
  onChange: (steps: ExternalChainStepConfig[]) => void;
  disabled?: boolean;
}

// Thai gloss for each external approver role (display only).
const ROLE_LABELS: Record<string, string> = {
  Designer: 'ผู้ออกแบบ (Designer)',
  Owner: 'เจ้าของโครงการ (Owner)',
};

/**
 * Lets a CM pick which external approver roles (Designer/Owner) review a
 * document and in what order. Pure controlled component — no internal state,
 * no side effects. The parent validates (≥1 role) before submitting.
 */
export default function ExternalChainConfig({
  value,
  onChange,
  disabled = false,
}: ExternalChainConfigProps) {
  // Normalize order to a stable 1..n sequence before emitting.
  const normalize = (steps: ExternalChainStepConfig[]): ExternalChainStepConfig[] =>
    [...steps]
      .sort((a, b) => a.order - b.order)
      .map((s, i) => ({ role: s.role, order: i + 1 }));

  const indexOfRole = (role: Role) => value.findIndex((s) => s.role === role);

  const toggleRole = (role: Role) => {
    if (disabled) return;
    const exists = indexOfRole(role) !== -1;
    if (exists) {
      onChange(normalize(value.filter((s) => s.role !== role)));
    } else {
      const nextOrder = value.length + 1;
      onChange(normalize([...value, { role, order: nextOrder }]));
    }
  };

  const move = (role: Role, dir: -1 | 1) => {
    if (disabled) return;
    const sorted = normalize(value);
    const idx = sorted.findIndex((s) => s.role === role);
    const swap = idx + dir;
    if (idx === -1 || swap < 0 || swap >= sorted.length) return;
    [sorted[idx], sorted[swap]] = [sorted[swap], sorted[idx]];
    // Re-derive `order` from the NEW array positions. Do NOT call normalize() here:
    // it re-sorts by the OLD order values (unchanged by the swap above) and would undo
    // the move, leaving onChange emitting an identical chain — the "arrows do nothing" bug.
    onChange(sorted.map((s, i) => ({ role: s.role, order: i + 1 })));
  };

  // Render rows in ACTUAL order: selected roles sorted by `order` first (so the
  // up/down arrows visibly move a row), then any unselected roles in their natural
  // list order. Without this the rows stayed fixed and only the "ลำดับที่" label
  // swapped, making the arrows look like they did nothing.
  const orderedRoles = [...EXTERNAL_APPROVER_ROLES].sort((a, b) => {
    const ia = indexOfRole(a);
    const ib = indexOfRole(b);
    const oa = ia === -1 ? Infinity : value[ia].order;
    const ob = ib === -1 ? Infinity : value[ib].order;
    if (oa !== ob) return oa - ob;
    return EXTERNAL_APPROVER_ROLES.indexOf(a) - EXTERNAL_APPROVER_ROLES.indexOf(b);
  });

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-text-body">
        เลือกผู้พิจารณาภายนอกและลำดับการพิจารณา
      </p>
      <div className="space-y-2">
        {orderedRoles.map((role) => {
          const idx = indexOfRole(role);
          const checked = idx !== -1;
          const order = checked ? value[idx].order : null;
          return (
            <div
              key={role}
              className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-raised px-3 py-2"
            >
              <input
                type="checkbox"
                id={`ext-role-${role}`}
                checked={checked}
                disabled={disabled}
                onChange={() => toggleRole(role)}
                className="h-4 w-4 rounded border-border-subtle text-brand focus-visible:ring-2 focus-visible:ring-brand"
              />
              <label
                htmlFor={`ext-role-${role}`}
                className="flex-1 text-sm text-text-body cursor-pointer"
              >
                {ROLE_LABELS[role] ?? role}
              </label>
              {checked && (
                <>
                  <span className="text-xs font-semibold text-text-secondary">
                    ลำดับที่ {order}
                  </span>
                  <button
                    type="button"
                    onClick={() => move(role, -1)}
                    disabled={disabled || order === 1}
                    aria-label="เลื่อนขึ้น"
                    className="text-text-secondary hover:text-text-body disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(role, 1)}
                    disabled={disabled || order === value.length}
                    aria-label="เลื่อนลง"
                    className="text-text-secondary hover:text-text-body disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
      {value.length === 0 && (
        <p className="text-xs text-red-500">กรุณาเลือกผู้พิจารณาอย่างน้อย 1 ราย</p>
      )}
    </div>
  );
}
