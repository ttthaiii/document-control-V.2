import { NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { ROLES, Role } from '@/lib/config/workflow'

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

// Helper to sanitize project ID
function toSlugId(input: string): string {
    if (!input) return '';
    return input.trim().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

// GET all projects (categories)
export async function GET(req: Request) {
    const { isAuthorized } = await verifyAdminAuth(req)
    if (!isAuthorized) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    try {
        // 💡 Fetching from the root 'sites' collection
        const snapshot = await adminDb.collection('sites').orderBy('createdAt', 'desc').get()

        const projects = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }))

        return NextResponse.json({ success: true, projects })
    } catch (error: any) {
        console.error('Error fetching projects:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}

// POST create new project
export async function POST(req: Request) {
    const { isAuthorized, uid } = await verifyAdminAuth(req)
    if (!isAuthorized) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const { name, shortName, cmSystemType, LineGroupID, status } = body

        if (!name || !shortName) {
            return NextResponse.json({ success: false, error: "Name and shortName are required" }, { status: 400 })
        }

        const docId = toSlugId(shortName)

        // Check if project already exists at root
        const siteRef = adminDb.collection('sites').doc(docId)
        const siteDoc = await siteRef.get()

        if (siteDoc.exists) {
            return NextResponse.json({ success: false, error: `Project with shortName ${shortName} already exists` }, { status: 409 })
        }

        const newProjectData = {
            name, // Name usually remains at root for UI clarity or fallback
            shortName,
            cmSystemType: cmSystemType || 'INTERNAL',
            status: status || 'ACTIVE',
            LineGroupID: LineGroupID || '',
            createdAt: FieldValue.serverTimestamp(),
            createdBy: uid,
            members: [] // for compatibility
        }

        // Create the project at the root level collection `sites`
        await siteRef.set(newProjectData)

        return NextResponse.json({ success: true, id: docId, project: newProjectData }, { status: 201 })
    } catch (error: any) {
        console.error('Error creating project:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
