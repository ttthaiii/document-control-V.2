// src/app/api/debug/fix-categories/route.ts (Final Super Sync)
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';

function toSlugId(input: string): string {
  if (!input) return '';
  // แปลงเป็นตัวใหญ่ทั้งหมด และแทนที่เว้นวรรคด้วย _
  return input.trim().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

export async function GET() {
  try {
    const log: string[] = [];
    log.push("🚀 Starting Super Sync (Standardize & Fix Visibility)...");

    // 1. รวบรวมข้อมูลจริงจากเอกสาร (Ground Truth)
    const rfaSnapshot = await adminDb.collection('rfaDocuments').get();
    
    // Map<SiteId, Map<SlugID, { code: string, types: Set<string> }>>
    const siteData = new Map<string, Map<string, { displayCode: string, types: Set<string> }>>();
    let docUpdateCount = 0;
    const batch = adminDb.batch();
    let batchCounter = 0;

    // Loop 1: วิเคราะห์เอกสารและเตรียมอัปเดตเอกสารให้เป็น ID ตัวใหญ่
    for (const doc of rfaSnapshot.docs) {
        const data = doc.data();
        const siteId = data.siteId;
        
        // รับค่าเดิมมา (จะเป็นตัวเล็กหรือใหญ่ก็ได้)
        const rawCategory = data.taskData?.taskCategory || data.categoryId;
        const rfaType = data.rfaType;

        if (siteId && rawCategory) {
            // แปลงเป็น ID มาตรฐาน (ตัวใหญ่)
            const standardizedId = toSlugId(rawCategory);

            // เก็บข้อมูลไว้สร้าง Master Data
            if (!siteData.has(siteId)) {
                siteData.set(siteId, new Map());
            }
            const categories = siteData.get(siteId)!;
            
            if (!categories.has(standardizedId)) {
                categories.set(standardizedId, { 
                    displayCode: standardizedId, // ใช้ตัวใหญ่เป็นชื่อแสดงผลด้วย
                    types: new Set() 
                });
            }
            if (rfaType) {
                categories.get(standardizedId)?.types.add(rfaType);
            }

            // ถ้าในเอกสารยังเก็บเป็นค่าเก่า (เช่น "Structural Drawings") ให้อัปเดตเป็น "STRUCTURAL_DRAWINGS"
            if (data.categoryId !== standardizedId) {
                batch.update(doc.ref, { categoryId: standardizedId });
                docUpdateCount++;
                batchCounter++;
            }
        }

        // Firestore Batch Limit
        if (batchCounter >= 400) {
            await batch.commit();
            batchCounter = 0;
        }
    }

    if (batchCounter > 0) {
        await batch.commit();
    }
    
    log.push(`📝 Updated ${docUpdateCount} documents to use Uppercase IDs.`);

    // 2. สร้าง/ซ่อม Master Data (Categories Collection)
    let catUpdateCount = 0;

    for (const [siteId, categories] of siteData) {
        const categoriesRef = adminDb.collection('sites').doc(siteId).collection('categories');

        for (const [catId, info] of categories) {
            const catDocRef = categoriesRef.doc(catId);
            const rfaTypesArray = Array.from(info.types);

            // ใช้ set({ ... }, { merge: true }) เพื่อสร้างถ้าไม่มี หรืออัปเดตถ้ามี
            await catDocRef.set({
                categoryCode: info.displayCode, // ชื่อแสดงผล (ตัวใหญ่)
                categoryName: info.displayCode, // ชื่อแสดงผล (ตัวใหญ่)
                name: info.displayCode,
                active: true,
                siteId: siteId, // ✅ บังคับใส่ siteId
                rfaTypes: FieldValue.arrayUnion(...rfaTypesArray), // ✅ บังคับใส่ rfaTypes ครบตามจริง
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });

            catUpdateCount++;
        }
    }

    log.push(`✨ Synced ${catUpdateCount} categories in Master Data.`);
    
    return NextResponse.json({
      success: true,
      logs: log
    });

  } catch (error: any) {
    console.error("Super Sync Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}