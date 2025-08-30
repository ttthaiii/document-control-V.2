// src/app/api/rfa/categories/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { getAuth } from 'firebase-admin/auth'

export async function GET(request: NextRequest) {
  try {
    // Get auth token from header
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid authorization header' },
        { status: 401 }
      )
    }

    const token = authHeader.split('Bearer ')[1]
    
    // Verify Firebase token
    const decodedToken = await getAuth().verifyIdToken(token)
    const userId = decodedToken.uid

    // Get user data from Firestore
    const userDoc = await adminDb.collection('users').doc(userId).get()
    if (!userDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    const userData = userDoc.data()
    const userSites = userData?.sites || []

    if (userSites.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No site access' },
        { status: 403 }
      )
    }

    // Get rfaType from query params
    const { searchParams } = new URL(request.url)
    const rfaType = searchParams.get('rfaType')

    if (!rfaType || !['RFA-SHOP', 'RFA-GEN', 'RFA-MAT'].includes(rfaType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing rfaType parameter' },
        { status: 400 }
      )
    }

    // Get categories from user's sites
    const categories: any[] = []

    for (const siteId of userSites) {
      const categoriesSnapshot = await adminDb
        .collection('sites')
        .doc(siteId)
        .collection('categories')
        .where('active', '==', true)
        .get() // ลบ where rfaTypes ออก

      categoriesSnapshot.forEach(doc => {
        const data = doc.data()
        console.log(`Debug category data for ${doc.id}:`, data) // Debug log
        
        // รองรับทั้งสอง schema
        const matchesRfaType = 
          (data.rfaTypes && Array.isArray(data.rfaTypes) && data.rfaTypes.includes(rfaType)) ||
          (data.documentType === rfaType)
        
        if (matchesRfaType) {
          categories.push({
            id: doc.id,
            siteId: siteId,
            categoryCode: data.categoryCode,
            categoryName: data.categoryName || data.name,
            rfaTypes: data.rfaTypes || [data.documentType],
            sequence: data.sequence || 0
          })
        }
      })
    }

    // Sort by sequence and categoryCode
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