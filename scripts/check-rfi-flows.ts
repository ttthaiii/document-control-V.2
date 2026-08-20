// scripts/check-rfi-flows.ts
//
// Walks every RFI workflow path through the REAL config and proves that
//   (a) every flow reaches a fully-closed state — no document can get stuck, and
//   (b) the guards refuse what they should.
//
// Worth keeping: this is what caught the PENDING_CM dead end. CM_REPLY deliberately
// leaves `status` alone, so a forwarded question stayed at PENDING_CM with no action
// able to move it. Re-run this after ANY change to RFI_TRANSITIONS.
//
// Run (tsconfig-paths is needed because rfi-workflow.ts imports via the @/ alias):
//   npx ts-node --compiler-options '{"module":"commonjs","target":"es2020","moduleResolution":"node","baseUrl":".","paths":{"@/*":["./src/*"]},"esModuleInterop":true}' -r tsconfig-paths/register scripts/check-rfi-flows.ts
//
// It mirrors evaluateAction() in api/rfi/[id]/route.ts. If you change the gate there,
// change it here too — this is a check, not the source of truth.

import {
  RFI_ACTIONS, RFI_TRANSITIONS, RFI_PARTY_ROLES, RFI_SITE_ROLES,
  RFI_CREATE_ROUTES, RFI_PARTY_LABELS, RFI_DISCIPLINES_BY_ORIGIN,
  getResponsibleParties, getRfiStatusLabel, isFullyClosed, askerParty, hasSiteMiddleman,
  RFIAction, RFIOrigin, RFIStatus,
} from '../src/lib/config/rfi-workflow';
import { Role } from '../src/lib/config/workflow';

type WA = Exclude<RFIAction, 'CREATE'>;
interface Ctx {
  role: Role;
  status: string;
  awaitingCm: boolean;
  origin: RFIOrigin;
  cmSystemType: 'INTERNAL' | 'EXTERNAL';
}

function allowed(action: WA, ctx: Ctx): boolean {
  const t = RFI_TRANSITIONS[action];
  if (!t) return false;

  const party = t.actorIsAsker ? askerParty(ctx.origin) : t.actor;
  let ok = RFI_PARTY_ROLES[party].includes(ctx.role);
  if (
    !ok && action === RFI_ACTIONS.CM_REPLY &&
    ctx.cmSystemType === 'EXTERNAL' && RFI_SITE_ROLES.includes(ctx.role)
  ) ok = true;
  if (!ok) return false;

  if (t.from === null) return action === RFI_ACTIONS.CM_REPLY ? ctx.awaitingCm : true;
  if (!t.from.includes(ctx.status as never)) return false;
  if (t.requiresSiteMiddleman && !hasSiteMiddleman(ctx.origin)) return false;
  return true;
}

function apply(action: WA, st: { status: string; awaitingCm: boolean }) {
  const t = RFI_TRANSITIONS[action];
  const override = t.toStatusWhenFrom?.[st.status as RFIStatus];
  return {
    status: override ?? t.toStatus ?? st.status,
    awaitingCm: t.setAwaitingCm === null ? st.awaitingCm : t.setAwaitingCm,
  };
}

const ROLE_OF: Record<string, Role> = {
  BIM: 'BIM' as Role,
  ME: 'ME' as Role,
  SN: 'SN' as Role,
  SITE: 'Site Admin' as Role,
  CM: 'CM' as Role,
};

function show(st: { status: string; awaitingCm: boolean; origin: RFIOrigin }) {
  const parties = getResponsibleParties(st).map(p => RFI_PARTY_LABELS[p]).join(' + ');
  return `${getRfiStatusLabel(st)}${st.awaitingCm ? ' [awaitingCm]' : ''}`
    + ` -> ${parties}${isFullyClosed(st) ? '  *DONE*' : ''}`;
}

function run(name: string, origin: RFIOrigin, cm: 'INTERNAL' | 'EXTERNAL', steps: [string, WA][]) {
  console.log(`\n=== ${name} (origin ${origin} / CM ${cm}) ===`);
  const route = RFI_CREATE_ROUTES[origin];
  let st = { status: route.status as string, awaitingCm: route.awaitingCm, origin };
  console.log(`  create                    ${show(st)}`);

  for (const [who, action] of steps) {
    const ctx: Ctx = {
      role: ROLE_OF[who], status: st.status, awaitingCm: st.awaitingCm, origin, cmSystemType: cm,
    };
    if (!allowed(action, ctx)) {
      console.log(`  ${who} ${action}  ==> BLOCKED (dead end)`);
      return false;
    }
    st = { ...apply(action, st), origin };
    console.log(`  ${who.padEnd(5)} ${action.padEnd(19)} ${show(st)}`);
  }

  if (!isFullyClosed(st)) {
    console.log('  !! never reached a fully-closed state');
    return false;
  }
  return true;
}

const flows = [
  run('BIM asks, SITE answers', 'BIM', 'INTERNAL',
    [['SITE', 'ANSWER'], ['BIM', 'ACKNOWLEDGE']]),

  // CM's answer hands the document straight back to BIM. There is no SITE relay step:
  // with one document (D-02) the answer is already attached to what BIM is watching.
  run('BIM asks, SITE forwards to CM', 'BIM', 'INTERNAL',
    [['SITE', 'FORWARD_TO_CM'], ['CM', 'CM_REPLY'], ['BIM', 'ACKNOWLEDGE']]),

  run('BIM asks, SITE answers + forwards (two parties at once)', 'BIM', 'INTERNAL',
    [['SITE', 'ANSWER_AND_FORWARD'], ['BIM', 'ACKNOWLEDGE'], ['CM', 'CM_REPLY']]),

  run('BIM asks for more info (loop)', 'BIM', 'INTERNAL',
    [['SITE', 'ANSWER'], ['BIM', 'REQUEST_MORE_INFO'], ['SITE', 'ANSWER'], ['BIM', 'ACKNOWLEDGE']]),

  run('SITE asks CM directly', 'SITE', 'INTERNAL',
    [['CM', 'CM_REPLY'], ['SITE', 'ACKNOWLEDGE']]),

  run('EXTERNAL CM — SITE records the reply', 'SITE', 'EXTERNAL',
    [['SITE', 'CM_REPLY'], ['SITE', 'ACKNOWLEDGE']]),

  // ME and SN go straight to CM — no SITE step at all — and close their own questions.
  run('ME asks CM directly', 'ME', 'INTERNAL',
    [['CM', 'CM_REPLY'], ['ME', 'ACKNOWLEDGE']]),

  run('SN asks CM directly', 'SN', 'INTERNAL',
    [['CM', 'CM_REPLY'], ['SN', 'ACKNOWLEDGE']]),

  run('ME on an EXTERNAL project — SITE records CM, ME closes', 'ME', 'EXTERNAL',
    [['SITE', 'CM_REPLY'], ['ME', 'ACKNOWLEDGE']]),
];

console.log('\n=== guards that must REFUSE ===');
const mustRefuse: [string, WA, Ctx][] = [
  ['CM_REPLY when CM is not pending', 'CM_REPLY',
    { role: ROLE_OF.CM, status: 'PENDING_SITE', awaitingCm: false, origin: 'BIM', cmSystemType: 'INTERNAL' }],
  ['SITE closing a BIM question', 'ACKNOWLEDGE',
    { role: ROLE_OF.SITE, status: 'PENDING_ASKER', awaitingCm: false, origin: 'BIM', cmSystemType: 'INTERNAL' }],
  ['SITE recording the CM reply on an INTERNAL project', 'CM_REPLY',
    { role: ROLE_OF.SITE, status: 'PENDING_CM', awaitingCm: true, origin: 'SITE', cmSystemType: 'INTERNAL' }],
  ['BIM answering its own question', 'ANSWER',
    { role: ROLE_OF.BIM, status: 'PENDING_SITE', awaitingCm: false, origin: 'BIM', cmSystemType: 'INTERNAL' }],

  // The team-crossing guards — this is what the origin split is for.
  ['ME closing a question BIM raised', 'ACKNOWLEDGE',
    { role: ROLE_OF.ME, status: 'PENDING_ASKER', awaitingCm: false, origin: 'BIM', cmSystemType: 'INTERNAL' }],
  ['SN closing a question ME raised', 'ACKNOWLEDGE',
    { role: ROLE_OF.SN, status: 'PENDING_ASKER', awaitingCm: false, origin: 'ME', cmSystemType: 'INTERNAL' }],
  ['BIM closing a question SN raised', 'ACKNOWLEDGE',
    { role: ROLE_OF.BIM, status: 'PENDING_ASKER', awaitingCm: false, origin: 'SN', cmSystemType: 'INTERNAL' }],
  ['asking SITE for more info on a document that never went through SITE', 'REQUEST_MORE_INFO',
    { role: ROLE_OF.ME, status: 'PENDING_ASKER', awaitingCm: false, origin: 'ME', cmSystemType: 'INTERNAL' }],
];

let guardsOk = true;
for (const [label, action, ctx] of mustRefuse) {
  const got = allowed(action, ctx);
  console.log(`  ${got ? 'FAIL  - allowed' : 'ok    - refused'}  ${label}`);
  if (got) guardsOk = false;
}

// --- Discipline ownership: each team only sees its own work, plus the shared two. ---
console.log('\n=== disciplines offered per team ===');
let disciplinesOk = true;
(['BIM', 'ME', 'SN', 'SITE'] as RFIOrigin[]).forEach(origin => {
  console.log(`  ${origin.padEnd(5)} ${RFI_DISCIPLINES_BY_ORIGIN[origin].join(' · ')}`);
});

const mustNotOffer: [RFIOrigin, string][] = [
  ['ME', 'Structural'], ['ME', 'Architectural'],
  ['SN', 'Structural'], ['SN', 'Architectural'],
  ['BIM', 'Mechanical'], ['BIM', 'Sanitary'],
];
for (const [origin, discipline] of mustNotOffer) {
  const offered = RFI_DISCIPLINES_BY_ORIGIN[origin].includes(discipline);
  if (offered) {
    console.log(`  FAIL  - ${origin} is offered ${discipline}`);
    disciplinesOk = false;
  }
}
const mustOffer: [RFIOrigin, string][] = [
  ['BIM', 'Interior'], ['ME', 'Interior'], ['SN', 'Interior'],
  ['BIM', 'Landscape'], ['ME', 'Landscape'], ['SN', 'Landscape'],
];
for (const [origin, discipline] of mustOffer) {
  if (!RFI_DISCIPLINES_BY_ORIGIN[origin].includes(discipline)) {
    console.log(`  FAIL  - ${origin} is missing the shared discipline ${discipline}`);
    disciplinesOk = false;
  }
}
console.log(`  ${disciplinesOk ? 'ok    - ownership correct' : 'FAILURES above'}`);

const pass = flows.every(Boolean) && guardsOk && disciplinesOk;
console.log(`\n${pass ? 'ALL FLOWS PASS' : 'FAILURES PRESENT'}`);
process.exit(pass ? 0 : 1);
