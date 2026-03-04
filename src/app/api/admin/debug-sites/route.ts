import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export async function GET() {
    try {
        let result = '=== USERS ===\n';
        const usersSnap = await adminDb.collection('users').get();
        usersSnap.forEach(doc => {
            const data = doc.data();
            result += `User: ${data.email || 'NoEmail'} (${doc.id})\nSites: ${JSON.stringify(data.sites)}\n\n`;
        });

        result += '\n=== SITES ===\n';
        const sitesSnap = await adminDb.collection('sites').get();
        sitesSnap.forEach(doc => {
            const data = doc.data();
            result += `Site: "${doc.id}" - ${data.name}\n`;
        });

        return new NextResponse(result, { headers: { 'Content-Type': 'text/plain' } });
    } catch (e) {
        return new NextResponse(String(e), { status: 500 });
    }
}
