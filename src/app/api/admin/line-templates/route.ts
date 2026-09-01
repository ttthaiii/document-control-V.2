import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import {
  ROLES,
  Role,
  STATUSES,
  ExternalChain,
  impactCheckChain,
} from '@/lib/config/workflow';
import type { LineTemplate, LineStageTemplate, LineModule } from '@/lib/config/lineTemplate';
import { SYSTEM_DEFAULT_LINE_STAGES } from '@/lib/config/lineTemplate';
import { templateDocId } from '@/lib/utils/lineTemplateResolver';

export const dynamic = 'force-dynamic';

// T-016 (A3) — admin CRUD for per-module approval-line templates (optionally site-scoped).
// One template per (module[, siteId]); the doc id is deterministic so an edit is an upsert
// (create-or-update), and `version` bumps on every save so impact-check ("Approach C") can key
// off it. On save we run impactCheckChain over the in-flight docs of that module: past + active
// steps are FROZEN, only the not-yet-reached (future) tail is rebuilt — never a blanket rewrite.

const TEMPLATES = 'lineTemplates';
const VALID_ROLES: Role[] = Object.values(ROLES) as Role[];
// A doc still carries a live external chain only in these statuses.
const IN_FLIGHT = [STATUSES.PENDING_EXTERNAL_APPROVAL, STATUSES.PENDING_CM_FINAL];

async function requireAdmin(request: NextRequest): Promise<{ ok: true; uid: string } | { ok: false; res: NextResponse }> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const token = authHeader.split('Bearer ')[1];
  const decoded = await adminAuth.verifyIdToken(token);
  const userDoc = await adminDb.collection('users').doc(decoded.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== ROLES.ADMIN) {
    return { ok: false, res: NextResponse.json({ error: 'Permission denied' }, { status: 403 }) };
  }
  return { ok: true, uid: decoded.uid };
}

// templateDocId + getTemplateForDoc now live in @/lib/utils/lineTemplateResolver — a Next.js
// route module may only export HTTP handlers (TS2344), so the shared helpers moved out.

// Validate + normalize an incoming stages[] payload into LineStageTemplate[].
// Throws a plain Error (message surfaced to the client) on any structural problem.
function normalizeStages(raw: any): LineStageTemplate[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('A template needs at least one stage.');
  const stages: LineStageTemplate[] = raw.map((s: any, i: number) => {
    if (!s || typeof s !== 'object') throw new Error(`Stage ${i} is malformed.`);
    if (!VALID_ROLES.includes(s.role)) throw new Error(`Stage ${i} has an unknown role: ${s.role}.`);
    return {
      order: typeof s.order === 'number' ? s.order : i,
      role: s.role as Role,
      mandatory: !!s.mandatory,
      ...(s.subLineMode ? { subLineMode: s.subLineMode } : {}),
    };
  });
  // Re-index 0-based by the given order so downstream (seed/impact) sees a clean sequence.
  stages.sort((a, b) => a.order - b.order).forEach((s, i) => { s.order = i; });
  // T-016: any valid role (including CM) is allowed at any stage, repeats included — the
  // non-empty + per-stage VALID_ROLES checks above already guarantee >=1 stage of a valid role.
  return stages;
}

// Create-if-absent seed for a module's system-default (siteId-less) template doc. Idempotent:
// `.create()` fails with ALREADY_EXISTS on a doc that's already there (including a concurrent
// racer), which we swallow — that outcome (the doc now exists) is exactly what we want. Never
// clobbers an existing/admin-edited default.
async function ensureSystemDefault(module: LineModule): Promise<void> {
  const id = templateDocId(module);
  const ref = adminDb.collection(TEMPLATES).doc(id);
  const snap = await ref.get();
  if (snap.exists) return;
  const template: LineTemplate = { id, module, version: 0, stages: SYSTEM_DEFAULT_LINE_STAGES };
  try {
    await ref.create(template);
  } catch (e: any) {
    if (e?.code !== 6 && e?.code !== 'already-exists') throw e;
  }
}

async function ensureSystemDefaults(): Promise<void> {
  await Promise.all((['RFA', 'RFI'] as LineModule[]).map(ensureSystemDefault));
}

// ── GET: list all templates ─────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.res;
    // T-016 (S3): opening the admin page guarantees each module's system-default doc exists,
    // create-if-absent — never clobbers an existing/admin-edited default.
    await ensureSystemDefaults();
    const snap = await adminDb.collection(TEMPLATES).get();
    let templates = snap.docs.map(d => d.data() as LineTemplate);
    // Optional scope filter (T-016 A2): param absent → all (back-compat);
    // `?siteId=` (empty) → system-wide defaults only; `?siteId=SITE_X` → that project only.
    const siteIdParam = request.nextUrl.searchParams.get('siteId');
    if (siteIdParam !== null) templates = templates.filter(t => (t.siteId || '') === siteIdParam);
    // Sort by module then siteId (default, siteId-less, sorts first within its module).
    templates.sort((a, b) => (a.module + '__' + (a.siteId || '')).localeCompare(b.module + '__' + (b.siteId || '')));
    return NextResponse.json({ success: true, templates });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ── PUT: upsert a template (create or edit) + run impact-check over in-flight docs ─
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.res;

    const body = await request.json();
    const module: LineModule = body?.module;
    // T-016 (A2): optional project scope. Non-empty string = project template; absent/empty = default.
    const siteId: string | undefined = typeof body?.siteId === 'string' && body.siteId ? body.siteId : undefined;
    if (module !== 'RFA' && module !== 'RFI') return NextResponse.json({ success: false, error: 'module must be RFA or RFI.' }, { status: 400 });

    let stages: LineStageTemplate[];
    try { stages = normalizeStages(body?.stages); }
    catch (e: any) { return NextResponse.json({ success: false, error: e.message }, { status: 400 }); }

    const id = templateDocId(module, siteId);
    const ref = adminDb.collection(TEMPLATES).doc(id);
    const existing = await ref.get();
    const prevVersion = existing.exists ? (existing.data() as LineTemplate).version ?? 0 : 0;

    const template: LineTemplate = { id, module, version: prevVersion + 1, stages, ...(siteId ? { siteId } : {}) };
    await ref.set(template);

    // Impact-check batch: only the module's in-flight docs whose chain came from THIS template.
    const collectionName = module === 'RFA' ? 'rfaDocuments' : 'rfiDocuments';
    const docsSnap = await adminDb.collection(collectionName).where('status', 'in', IN_FLIGHT).get();

    let scanned = 0, updated = 0;
    for (const d of docsSnap.docs) {
      const chain = (d.data() as any)?.externalChain as ExternalChain | undefined;
      if (!chain || chain.templateId !== id) continue;
      scanned++;
      const result = impactCheckChain(chain, template);
      if (result.classification === 'affected-future') {
        // Sanitize: strip any `undefined` so the Firestore admin SDK never rejects the write.
        const safeChain = JSON.parse(JSON.stringify(result.chain));
        await adminDb.collection(collectionName).doc(d.id).update({ externalChain: safeChain });
        updated++;
      }
    }

    return NextResponse.json({ success: true, template, impact: { scanned, updated } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ── DELETE: remove a project-scoped template ────────────────────────────────────
// The system-default (siteId-less) doc for a module must always exist (ensureSystemDefault
// backstops it on every GET) so an INTERNAL document never resolves to 'none' — deleting it
// is refused. Only a project-scoped doc (id contains the `__siteId` segment) may be deleted.
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.res;

    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'id is required.' }, { status: 400 });

    if (!id.includes('__')) {
      return NextResponse.json({ success: false, error: 'The system-default template cannot be deleted.' }, { status: 400 });
    }

    await adminDb.collection(TEMPLATES).doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
