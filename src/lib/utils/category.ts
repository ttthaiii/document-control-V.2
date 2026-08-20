// src/lib/utils/category.ts
//
// Shared category helpers for document modules (RFA, RFI, ...).
//
// Extracted so RFI does not need its own copy. `api/rfa/create/route.ts` still has an
// inline version of these two functions — switching it to import from here is part of
// roadmap task T-001 (single source of truth). Behaviour here is identical to that copy.

import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

/** Turn a human category name into a stable document id: "Shop Drawings" -> "SHOP_DRAWINGS". */
export function toSlugId(input: string): string {
  if (!input) return '';
  return input
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

export interface EnsureCategoryDefaults {
  name?: string;
  description?: string;
  createdBy?: string;
  /** Which document type first used this category, e.g. 'RFA-SHOP' or 'RFI'. */
  docType?: string;
}

/**
 * Make sure `sites/{siteId}/categories/{SLUG}` exists, creating it if not.
 * Without this the category filter on the dashboard cannot list the category.
 * Returns the slug id to store on the document.
 */
export async function ensureCategory(
  siteId: string,
  categoryIdOrName: string,
  defaults?: EnsureCategoryDefaults
): Promise<{ id: string; created: boolean }> {
  const docId = toSlugId(categoryIdOrName);
  const ref = adminDb.doc(`sites/${siteId}/categories/${docId}`);
  const snap = await ref.get();

  if (snap.exists) {
    // Record the new doc type on an existing category so filters know it applies here too.
    if (defaults?.docType) {
      const existing: string[] = snap.data()?.rfaTypes || [];
      if (!existing.includes(defaults.docType)) {
        await ref.update({ rfaTypes: FieldValue.arrayUnion(defaults.docType) });
      }
    }
    return { id: docId, created: false };
  }

  await ref.set({
    name: defaults?.name ?? categoryIdOrName,
    categoryCode: categoryIdOrName,
    categoryName: defaults?.name ?? categoryIdOrName,
    description: defaults?.description ?? '',
    rfaTypes: defaults?.docType ? [defaults.docType] : [],
    active: true,
    // Required: without siteId the dashboard category filter cannot see this document.
    siteId: siteId,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: defaults?.createdBy ?? 'SYSTEM',
  });

  return { id: docId, created: true };
}
