import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from 'firebase-admin/firestore';

interface MigrationReportEntry {
  id: string;
  status: 'UPDATED' | 'SKIPPED';
}

/**
 * API Route to migrate existing RFA documents to support the revision system.
 * This should be run once to update all legacy documents.
 * It adds `revisionNumber: 0` and `isLatest: true` to documents that don't have these fields.
 */
export async function GET() {
  try {
    console.log('🚀 Starting RFA documents migration via API (Corrected Logic)...');

    const rfaCollection = adminDb.collection('rfaDocuments');
    let updatedCount = 0;
    const migrationReport: MigrationReportEntry[] = [];

    // ✅ KEY CHANGE: Fetch all documents and filter in the code,
    // because Firestore query `where('revisionNumber', '==', null)` does not find missing fields.
    const snapshot = await rfaCollection.get();

    if (snapshot.empty) {
      return NextResponse.json({
        success: true,
        message: 'No documents found in the rfaDocuments collection.',
      });
    }

    console.log(`🔍 Found ${snapshot.size} total documents. Checking for migration status...`);

    const batch = adminDb.batch();
    let documentsToMigrate = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      // Check if 'revisionNumber' field is missing (undefined)
      if (data.revisionNumber === undefined) {
        const docRef = rfaCollection.doc(doc.id);
        console.log(`  - Staging update for doc: ${doc.id}`);
        
        batch.update(docRef, {
          revisionNumber: 0,
          isLatest: true,
          updatedAt: FieldValue.serverTimestamp()
        });

        migrationReport.push({ id: doc.id, status: 'UPDATED' });
        documentsToMigrate++;
      } else {
        migrationReport.push({ id: doc.id, status: 'SKIPPED' });
      }
    });

    if (documentsToMigrate === 0) {
        return NextResponse.json({
            success: true,
            message: '✅ All documents are already up-to-date. No migration needed.',
            report: migrationReport
        });
    }
    
    await batch.commit();
    updatedCount = documentsToMigrate;

    const successMessage = `🎉 Migration successful! Updated ${updatedCount} documents.`;
    console.log(successMessage);

    return NextResponse.json({
      success: true,
      message: successMessage,
      report: migrationReport
    });

  } catch (error: any) {
    console.error('❌ Migration API failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: "Migration failed.",
      details: error.message 
    }, { status: 500 });
  }
}

