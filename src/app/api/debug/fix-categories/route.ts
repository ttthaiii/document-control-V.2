// src/app/api/debug/fix-categories/route.ts (Final Version)
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from 'firebase-admin/firestore';

function toSlugId(input: string): string {
  if (!input) return '';
  return input.trim().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

export async function GET()  {
  try {
    const siteId = "O4GN2NuHj72uq2Z8WKp4";
    const fixes = [];

    // 1. เรียนรู้รูปแบบที่ถูกต้องจากเอกสาร RFA ทั้งหมด
    const correctNames = new Map<string, string>();
    const rfaSnapshot = await adminDb.collection('rfaDocuments').where('siteId', '==', siteId).get();
    rfaSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.taskData && data.taskData.taskCategory) {
            const categoryCode = data.taskData.taskCategory;
            const categoryId = toSlugId(categoryCode);
            if (!correctNames.has(categoryId)) {
                correctNames.set(categoryId, categoryCode);
            }
        }
    });

    // 2. อัปเดต "สารบัญหมวดงาน" ตามรูปแบบที่เรียนรู้มา
    const categoriesSnapshot = await adminDb
      .collection('sites')
      .doc(siteId)
      .collection('categories')
      .get();

    for (const catDoc of categoriesSnapshot.docs) {
      const data = catDoc.data();
      const updates: any = {};
      let needsUpdate = false;

      const correctName = correctNames.get(catDoc.id);

      if (correctName) {
          if (data.categoryCode !== correctName) {
              updates.categoryCode = correctName;
              needsUpdate = true;
          }
          if (data.categoryName !== correctName) {
              updates.categoryName = correctName;
              needsUpdate = true;
          }
      }

      if (needsUpdate) {
        updates.updatedAt = FieldValue.serverTimestamp();
        await catDoc.ref.update(updates);
        fixes.push({
          id: catDoc.id,
          foundCorrectName: correctName,
          updates
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Corrected ${fixes.length} categories based on RFA documents.`,
      fixes
    });

  } catch (error: any) {
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}