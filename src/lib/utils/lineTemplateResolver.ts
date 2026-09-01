// ── T-016: server-side line-template resolver ───────────────────────────────────
// The IO layer for the configurable approval-line feature. Keeps workflow.ts pure: the
// Firestore reads live here, the CHOICE lives in the pure `selectTemplate` (workflow.ts).
//
// Doc-id scheme (deterministic, upsert-friendly, write-key only — never parsed back):
//   default (system-wide) = `${module}`             (T-016: no category segment)
//   project-scoped        = `${module}__${siteId}`  (double underscore = site segment)
//
// Resolve order gates cmSystemType FIRST — EXTERNAL projects have no external flow, so they
// short-circuit to 'none' BEFORE any read (no line, no pre-fill, no seed). INTERNAL: a project
// template overrides the default doc, the default doc is the next fallback, and the built-in
// SYSTEM_DEFAULT_LINE_STAGES constant is the final floor — so an INTERNAL document ALWAYS
// resolves to a real line, never 'none'.

import { adminDb } from '@/lib/firebase/admin';
import { selectTemplate } from '@/lib/config/workflow';
import type { LineTemplate, LineModule } from '@/lib/config/lineTemplate';
import { SYSTEM_DEFAULT_LINE_STAGES } from '@/lib/config/lineTemplate';

export const TEMPLATES_COLLECTION = 'lineTemplates';

/** Deterministic template doc id. `siteId` present = project scope; absent = system-wide default. */
export function templateDocId(module: LineModule, siteId?: string): string {
  return siteId ? `${module}__${siteId}` : `${module}`;
}

/** The built-in fallback template for a module — seeded purely from SYSTEM_DEFAULT_LINE_STAGES. */
function builtInDefaultTemplate(module: LineModule): LineTemplate {
  return {
    id: templateDocId(module),
    module,
    version: 0,
    stages: SYSTEM_DEFAULT_LINE_STAGES,
  };
}

/**
 * Resolve the approval-line template that applies to one document. Fetches the project-scoped
 * and default candidates, delegates the choice to the pure `selectTemplate`, then falls back
 * to the built-in default for an INTERNAL project when neither doc exists.
 * EXTERNAL projects short-circuit before any Firestore read.
 */
export async function getTemplateForDoc(
  module: LineModule,
  site: { siteId: string; cmSystemType: 'INTERNAL' | 'EXTERNAL' },
): Promise<{ template: LineTemplate | null; source: 'project' | 'default' | 'none' }> {
  if (site.cmSystemType === 'EXTERNAL') return { template: null, source: 'none' };
  const [projSnap, defSnap] = await Promise.all([
    adminDb.collection(TEMPLATES_COLLECTION).doc(templateDocId(module, site.siteId)).get(),
    adminDb.collection(TEMPLATES_COLLECTION).doc(templateDocId(module)).get(),
  ]);
  const projectTemplate = projSnap.exists ? (projSnap.data() as LineTemplate) : null;
  const defaultTemplate = defSnap.exists ? (defSnap.data() as LineTemplate) : null;
  const chosen = selectTemplate(site.cmSystemType, projectTemplate, defaultTemplate);
  // INTERNAL always has a line: fall to the built-in floor when no doc exists yet.
  if (chosen.source === 'none') {
    return { template: builtInDefaultTemplate(module), source: 'default' };
  }
  return chosen;
}
