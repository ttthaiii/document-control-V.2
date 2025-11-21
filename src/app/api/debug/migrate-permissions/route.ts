// src/app/api/debug/migrate-permissions/route.ts
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { ROLES } from '@/lib/config/workflow';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sitesSnapshot = await adminDb.collection('sites').get();
    let updatedCount = 0;
    const report: string[] = [];

    // ✅ กำหนดค่า Default Permission (แก้ไขให้ถูกต้องตามที่คุยกัน)
    const defaultRoleSettings = {
      RFA: {
        // ใครสร้าง RFA ประเภทไหนได้บ้าง
        create_shop: [ROLES.BIM, ROLES.ME, ROLES.SN, ROLES.ADMIN],
        create_gen: [ROLES.BIM, ROLES.SITE_ADMIN, ROLES.ADMIN, ROLES.ME, ROLES.SN],
        create_mat: [ROLES.SITE_ADMIN, ROLES.ADMIN, ROLES.OE, ROLES.PE],
        
        // ใครตรวจสอบได้ (Reviewer)
        review: [ROLES.SITE_ADMIN, ROLES.ADMIN_SITE_2, ROLES.OE, ROLES.PE, ROLES.ADMIN],
        
        // ใครอนุมัติได้ (Approver)
        approve: [ROLES.CM, ROLES.PD, ROLES.ADMIN]
      },
      WORK_REQUEST: {
        // ✅ จุดสำคัญ: แก้ให้ PE, OE สร้างได้แล้ว
        create: [ROLES.PE, ROLES.OE, ROLES.ADMIN], 
        
        // ใครอนุมัติ Draft (PD, PM)
        approve_draft: [ROLES.PD, ROLES.PM, ROLES.ADMIN],
        
        // ใครรับงาน (BIM)
        execute: [ROLES.BIM]
      }
    };

    const batch = adminDb.batch();

    for (const doc of sitesSnapshot.docs) {
      const siteData = doc.data();
      
      // ถ้ายังไม่มี roleSettings หรืออยากจะ Force Update ให้เอาเงื่อนไข if ออก
      if (!siteData.roleSettings) {
        batch.update(doc.ref, {
          roleSettings: defaultRoleSettings
        });
        updatedCount++;
        report.push(`✅ Staged update for site: ${siteData.name} (${doc.id})`);
      } else {
        report.push(`Pv Skipped site: ${siteData.name} (${doc.id}) - Already has settings`);
      }
    }

    if (updatedCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      message: `Migration completed. Updated ${updatedCount} sites.`,
      details: report,
      appliedSettings: defaultRoleSettings
    });

  } catch (error: any) {
    console.error("Migration failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}