import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from 'firebase-admin/firestore';

export async function GET()  {
  try {
    const siteId = "O4GN2NuHj72uq2Z8WKp4";
    const fixes = [];
    
    // ดึง categories ทั้งหมด
    const categoriesSnapshot = await adminDb
      .collection('sites')
      .doc(siteId)
      .collection('categories')
      .get();

    for (const catDoc of categoriesSnapshot.docs) {
      const data = catDoc.data();
      const updates: any = {};
      let needsUpdate = false;

      // แก้ไข rfaTypes เป็น array
      if (typeof data.rfaTypes === 'string') {
        updates.rfaTypes = [data.rfaTypes];
        needsUpdate = true;
      }

      // เพิ่ม categoryCode ถ้าไม่มี (ใช้ name หรือ id)
      if (!data.categoryCode && data.name) {
        updates.categoryCode = data.name;
        needsUpdate = true;
      }

      // เพิ่ม categoryName ถ้าไม่มี (ใช้ name หรือ categoryCode)
      if (!data.categoryName) {
        updates.categoryName = data.name || data.categoryCode || catDoc.id;
        needsUpdate = true;
      }

      // เพิ่ม sequence ถ้าไม่มี
      if (data.sequence === undefined) {
        updates.sequence = 0;
        needsUpdate = true;
      }

      if (needsUpdate) {
        updates.updatedAt = FieldValue.serverTimestamp();
        await catDoc.ref.update(updates);
        fixes.push({
          id: catDoc.id,
          original: data,
          updates
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Fixed ${fixes.length} categories`,
      fixes
    });

  } catch (error: any) {
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}