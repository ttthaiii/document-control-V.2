// src/app/api/debug/dump/route.ts
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

interface CategoryData {
  id: string;
  categoryCode?: string;
  categoryName?: string;
  name?: string;
  rfaTypes?: string | string[];
  active?: boolean;
  createdAt?: any;
  createdBy?: string;
  description?: string;
  sequence?: number;
}

interface SiteResult {
  siteId: string;
  siteName: string;
  categories: CategoryData[];
}

export async function GET() {
  try {
    console.log('🔍 Starting data dump...');
    
    // ดึงข้อมูล sites และ categories ทั้งหมด
    const sitesSnapshot = await adminDb.collection('sites').get();
    const result: SiteResult[] = [];

    for (const siteDoc of sitesSnapshot.docs) {
      const siteData = siteDoc.data();
      console.log(`Processing site: ${siteDoc.id} (${siteData.name})`);
      
      const categoriesSnapshot = await adminDb
        .collection('sites')
        .doc(siteDoc.id)
        .collection('categories')
        .get();

      const categories: CategoryData[] = [];
      categoriesSnapshot.forEach(catDoc => {
        const catData = catDoc.data();
        console.log(`  Category ${catDoc.id}:`, catData);
        
        categories.push({
          id: catDoc.id,
          categoryCode: catData.categoryCode,
          categoryName: catData.categoryName,
          name: catData.name,
          rfaTypes: catData.rfaTypes,
          active: catData.active,
          createdAt: catData.createdAt,
          createdBy: catData.createdBy,
          description: catData.description,
          sequence: catData.sequence
        });
      });

      result.push({
        siteId: siteDoc.id,
        siteName: siteData.name || 'Unknown Site',
        categories
      });
    }

    // ดึงข้อมูล users, counters, documents เพิ่มเติม
    const usersSnapshot = await adminDb.collection('users').get();
    const users = usersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const countersSnapshot = await adminDb.collection('counters').get();
    const counters = countersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const rfaSnapshot = await adminDb.collection('rfaDocuments').get();
    const rfaDocuments = rfaSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({
      success: true,
      data: {
        sites: result,
        users,
        counters,
        rfaDocuments,
        summary: {
          totalSites: result.length,
          totalUsers: users.length,
          totalCounters: counters.length,
          totalRfaDocuments: rfaDocuments.length,
          categoriesPerSite: result.map(site => ({
            siteName: site.siteName,
            categoryCount: site.categories.length
          }))
        }
      }
    });

  } catch (error: any) {
    console.error('Dump Error:', error);
    return NextResponse.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
}