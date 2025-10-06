// src/app/api/rfa/categories/route.ts (แก้ไขแล้ว)
import { NextRequest, NextResponse } from 'next/server'
// 🔽 1. เปลี่ยน import: นำเข้า adminDb และ adminAuth
import { adminDb, adminAuth } from '@/lib/firebase/admin' 

// 🗑️ 2. ลบ import ของ getAuth ที่ไม่ได้ใช้แล้ว
// import { getAuth } from 'firebase-admin/auth'

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid authorization header' },
        { status: 401 }
      )
    }
    const token = authHeader.split('Bearer ')[1]
    
    // 🔽 3. เปลี่ยนจาก getAuth() มาใช้ adminAuth ที่ import เข้ามา
    const decodedToken = await adminAuth.verifyIdToken(token)
    
    const userId = decodedToken.uid
    const userDoc = await adminDb.collection('users').doc(userId).get()
    if (!userDoc.exists) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }
    const userData = userDoc.data()
    const userSites = userData?.sites || []
    if (userSites.length === 0) {
      return NextResponse.json({ success: false, error: 'No site access' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const rfaType = searchParams.get('rfaType')

    if (!rfaType) {
      return NextResponse.json(
        { success: false, error: 'Missing rfaType parameter' },
        { status: 400 }
      )
    }

    const categories: any[] = []

    for (const siteId of userSites) {
      let categoriesQuery: any = adminDb
        .collection('sites')
        .doc(siteId)
        .collection('categories')
        .where('active', '==', true)

      if (rfaType !== 'ALL') {
        categoriesQuery = categoriesQuery.where('rfaTypes', 'array-contains', rfaType);
      }

      const categoriesSnapshot = await categoriesQuery.get();

      categoriesSnapshot.forEach((doc: any) => {
        const data = doc.data()
        categories.push({
          id: doc.id,
          siteId: siteId,
          categoryCode: data.categoryCode || 'UNKNOWN',
          categoryName: data.categoryName || 'Unknown Category',
          rfaTypes: data.rfaTypes,
          sequence: data.sequence || 0
        })
      })
    }
    
    categories.sort((a, b) => {
      if (a.sequence !== b.sequence) {
        return a.sequence - b.sequence
      }
      return a.categoryCode.localeCompare(b.categoryCode)
    })

    return NextResponse.json({
      success: true,
      categories: categories,
      count: categories.length
    })

  } catch (error) {
    console.error('Error fetching RFA categories:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}