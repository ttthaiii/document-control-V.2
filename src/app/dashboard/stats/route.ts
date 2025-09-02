// src/app/api/dashboard/stats/route.ts
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { adminAuth, adminDb } from '@/lib/firebase/admin'

export async function GET() {
  try {
    const headersList = headers()
    const authorization = headersList.get('authorization')

    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'No authorization token' },
        { status: 401 }
      )
    }

    // Verify Firebase token
    const token = authorization.split('Bearer ')[1]
    const decodedToken = await adminAuth.verifyIdToken(token)
    const userId = decodedToken.uid

    // Get user data
    const userDoc = await adminDb.collection('users').doc(userId).get()
    if (!userDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    const userData = userDoc.data()
    const userRole = userData?.role
    const userSites = userData?.sites || []

    if (!userSites.length) {
      return NextResponse.json({
        success: true,
        stats: {
          pendingRFA: 0,
          totalRFI: 0,
          totalConstructionInfo: 0,
          myDocuments: 0,
          assignedToMe: 0
        }
      })
    }

    // Build queries based on user permissions
    let rfaQuery = adminDb.collection('rfaDocuments')
      .where('siteId', 'in', userSites)

    // Execute RFA statistics query
    const rfaSnapshot = await rfaQuery.get()
    const rfaDocuments = rfaSnapshot.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        status: data.status,
        createdBy: data.createdBy,
        assignedTo: data.assignedTo,
        rfaType: data.rfaType,
        updatedAt: data.updatedAt,
        ...data
      }
    })

    // Calculate statistics
    const stats = {
      // RFA Statistics
      pendingRFA: rfaDocuments.filter(doc => 
        ['PENDING_SITE_ADMIN', 'PENDING_CM'].includes(doc.status)
      ).length,
      
      totalRFA: rfaDocuments.length,
      
      draftRFA: rfaDocuments.filter(doc => doc.status === 'DRAFT').length,
      
      approvedRFA: rfaDocuments.filter(doc => doc.status === 'APPROVED').length,
      
      rejectedRFA: rfaDocuments.filter(doc => doc.status === 'REJECTED').length,

      // User-specific statistics
      myDocuments: rfaDocuments.filter(doc => doc.createdBy === userId).length,
      
      assignedToMe: rfaDocuments.filter(doc => doc.assignedTo === userId).length,

      // TODO: Add when RFI and Construction Info are implemented
      totalRFI: 0,
      pendingRFI: 0,
      totalConstructionInfo: 0,

      // By RFA Type
      rfaShop: rfaDocuments.filter(doc => doc.rfaType === 'RFA-SHOP').length,
      rfaGen: rfaDocuments.filter(doc => doc.rfaType === 'RFA-GEN').length,
      rfaMat: rfaDocuments.filter(doc => doc.rfaType === 'RFA-MAT').length,

      // Recent activity (last 7 days)
      recentActivity: rfaDocuments.filter(doc => {
        const updatedAt = new Date(doc.updatedAt)
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
        return updatedAt >= sevenDaysAgo
      }).length
    }

    return NextResponse.json({
      success: true,
      stats,
      lastUpdated: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}