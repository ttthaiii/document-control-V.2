// src/app/api/sites/[siteId]/categories/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { siteId: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    await adminAuth.verifyIdToken(token);

    const { siteId } = params;
    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400 });
    }

    const categoriesSnapshot = await adminDb
      .collection('sites')
      .doc(siteId)
      .collection('categories')
      .orderBy('categoryCode', 'asc')
      .get();

    if (categoriesSnapshot.empty) {
      return NextResponse.json({ success: true, categories: [] });
    }

    const categories = categoriesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({ success: true, categories });

  } catch (error: any) {
    console.error(`Error fetching categories for site ${params.siteId}:`, error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}