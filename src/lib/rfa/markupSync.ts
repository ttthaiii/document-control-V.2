// Collaborative PDF markup sync (T-025).
// One Fabric object = one Firestore doc in the top-level `markup` collection.
// Doc id = the Fabric object's own `id`. Queried by `filePath` (globally unique
// storage path) so no documentId prop is needed. Pure module — no React, no UI;
// callers wrap errors. See .sessions/mece_plan.md S1.

import { db } from '@/lib/firebase/client';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';

export type MarkupDoc = {
  id: string;
  filePath: string;
  pageNumber: number;
  author: string;
  authorUid: string;
  kind: string;
  obj: any; // serialized Fabric object (toObject with custom props)
  updatedAt?: any;
};

export type MarkupChange = {
  type: 'added' | 'modified' | 'removed';
  doc: MarkupDoc;
};

/** Create or update one markup object's doc (merge so partial updates are safe). */
export function upsertMarkupObject(d: Omit<MarkupDoc, 'updatedAt'>): Promise<void> {
  // Firestore REJECTS nested arrays (an array whose elements are themselves arrays). A Fabric freehand
  // Path serializes its geometry as `path: [['M',x,y],['Q',...],...]` — exactly that shape — so writing
  // the raw object map makes setDoc throw (and the caller's best-effort catch swallows it → the stroke
  // silently never syncs, while shapes with only scalar fields write fine). Store the whole serialized
  // object as ONE JSON string (parsed back in subscribeMarkup) to stay Firestore-safe for every object
  // type. Callers still hand in / receive `obj` as a plain map — the string form never leaves this module.
  const { obj, ...rest } = d;
  return setDoc(
    doc(db, 'markup', d.id),
    { ...rest, obj: JSON.stringify(obj), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** Delete one markup object's doc. */
export function removeMarkupObject(id: string): Promise<void> {
  return deleteDoc(doc(db, 'markup', id));
}

/**
 * Subscribe to all markup on one file. `cb` receives only the changed docs per
 * snapshot (added/modified/removed). Returns the unsubscribe function — the
 * caller MUST call it on close to avoid a listener leak.
 */
export function subscribeMarkup(
  filePath: string,
  cb: (changes: MarkupChange[]) => void,
): () => void {
  const q = query(collection(db, 'markup'), where('filePath', '==', filePath));
  return onSnapshot(q, (snap) => {
    cb(
      snap.docChanges().map((c) => {
        const data = c.doc.data() as any;
        // `obj` is stored as a JSON string (see upsertMarkupObject); parse it back to a map. Docs written
        // before this change (or by other tools) may still hold a raw map — accept both.
        const obj =
          typeof data.obj === 'string' ? safeParse(data.obj) : data.obj;
        return {
          type: c.type,
          doc: { ...data, id: c.doc.id, obj } as MarkupDoc,
        };
      }),
    );
  });
}

/** Parse a JSON string, returning null on failure so one corrupt doc never breaks the whole snapshot. */
function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
