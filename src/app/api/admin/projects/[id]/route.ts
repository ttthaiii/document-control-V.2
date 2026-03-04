import { NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { ROLES } from '@/lib/config/workflow'

export const dynamic = 'force-dynamic'

async function verifyAdminAuth(req: Request) {
    const authHeader = req.headers.get("authorization") || ""
    const match = authHeader.match(/^Bearer (.+)$/i)
    if (!match) return { isAuthorized: false, uid: null }

    try {
        const decoded = await adminAuth.verifyIdToken(match[1])
        const uid = decoded.uid

        // Check if user is Admin
        const userDoc = await adminDb.collection('users').doc(uid).get()
        if (!userDoc.exists || userDoc.data()?.role !== ROLES.ADMIN) {
            return { isAuthorized: false, uid }
        }

        return { isAuthorized: true, uid }
    } catch {
        return { isAuthorized: false, uid: null }
    }
}

// PUT to update project
export async function PUT(req: Request, { params }: { params: { id: string } }) {
    const { isAuthorized, uid } = await verifyAdminAuth(req)
    if (!isAuthorized) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { id } = params
        const body = await req.json()
        const { name, shortName, cmSystemType, LineGroupID, status } = body

        if (!name || !shortName) {
            return NextResponse.json({ success: false, error: "Name and shortName are required" }, { status: 400 })
        }

        const docRef = adminDb.collection('sites').doc(id)
        const existingDoc = await docRef.get()

        if (!existingDoc.exists) {
            return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 })
        }

        // Prepare update object. Fall back to root level. 
        const updateData: any = {
            name,
            shortName,
            cmSystemType: cmSystemType || 'INTERNAL',
            LineGroupID: LineGroupID || '',
            status: status || 'ACTIVE',
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: uid
        }

        await docRef.update(updateData)

        return NextResponse.json({ success: true, id, updatedData: updateData })
    } catch (error: any) {
        console.error('Error updating project:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}

// DELETE to remove project
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
    const { isAuthorized } = await verifyAdminAuth(req)
    if (!isAuthorized) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { id } = params

        const docRef = adminDb.collection('sites').doc(id)
        const existingDoc = await docRef.get()

        if (!existingDoc.exists) {
            return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 })
        }

        await docRef.delete()

        return NextResponse.json({ success: true, id })
    } catch (error: any) {
        console.error('Error deleting project:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
