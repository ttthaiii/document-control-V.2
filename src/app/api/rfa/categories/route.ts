// src/app/api/rfa/categories/route.ts (แก้ไขแล้ว)
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { getAuth } from 'firebase-admin/auth'

export async function GET(request: NextRequest) {
  try {
    // (ส่วนการยืนยันตัวตนและดึงข้อมูล User ยังคงเดิม)
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid authorization header' },
        { status: 401 }
      )
    }
    const token = authHeader.split('Bearer ')[1]
    const decodedToken = await getAuth().verifyIdToken(token)
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

    // --- ✅ 1. แก้ไข Validation ---
    // อนุญาตให้ rfaType เป็น 'ALL' ได้
    if (!rfaType) {
      return NextResponse.json(
        { success: false, error: 'Missing rfaType parameter' },
        { status: 400 }
      )
    }

    const categories: any[] = []

    for (const siteId of userSites) {
      // สร้าง Query เริ่มต้น
      let categoriesQuery: any = adminDb
        .collection('sites')
        .doc(siteId)
        .collection('categories')
        .where('active', '==', true)

      // --- ✅ 2. เพิ่มเงื่อนไขการกรอง ---
      // จะกรองด้วย rfaType ก็ต่อเมื่อไม่ใช่ 'ALL'
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
    
    // (ส่วนการ Sort และ Response ยังคงเดิม)
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