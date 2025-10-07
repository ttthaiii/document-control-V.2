// src/app/api/rfa/check-duplicate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { siteId, documentNumber } = await request.json();

    if (!siteId || !documentNumber) {
      return NextResponse.json(
        { error: 'Site ID and Document Number are required.' },
        { status: 400 }
      );
    }

    const query = adminDb.collection('rfaDocuments')
      .where('siteId', '==', siteId)
      .where('documentNumber', '==', documentNumber.trim())
      .limit(1);

    const snapshot = await query.get();

    return NextResponse.json({ isDuplicate: !snapshot.empty });

  } catch (error) {
    console.error('Check duplicate error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}