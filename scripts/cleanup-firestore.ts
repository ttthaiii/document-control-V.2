// scripts/cleanup-firestore.ts
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { adminDb } from '../src/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

async function cleanupFirestore() {
  console.log('🧹 Starting Firestore cleanup...\n');

  try {
    // เก็บ site หลัก (O4GN2NuHj72uq2Z8WKp4) ลบอันอื่น
    const mainSiteId = 'O4GN2NuHj72uq2Z8WKp4';
    const sitesToDelete = ['dQ9j9oLhfFybJROOb9Yn', 'r7gRO1yb21YFS0r7OyaR'];

    console.log('🏗️ Step 1: Cleaning up duplicate sites...');
    
    for (const siteId of sitesToDelete) {
      console.log(`   Deleting site: ${siteId}`);
      await adminDb.collection('sites').doc(siteId).delete();
      console.log(`   ✅ Deleted site: ${siteId}`);
    }

    console.log('👥 Step 2: Cleaning up duplicate users...');
    
    // เก็บแค่ user หลัก 2 คน
    const usersToKeep = {
      'q82uGlLOYcRaadwhlhST5omSoMp2': { // BIM user
        email: 'ttthaiii30@gmail.com',
        role: 'BIM',
        sites: [mainSiteId]
      },
      'ZKuORdwvoKJej1R2Ia1J': { // Admin user ใหม่สุด  
        email: 'admin@bannsansiri.com',
        role: 'Admin',
        sites: [mainSiteId]
      }
    };

    // ลบ duplicate admin users
    const usersToDelete = ['bPmWllxOkgA7BjMm7Hsj', 'vUffX1OTzL5PSijDcydy'];
    
    for (const userId of usersToDelete) {
      console.log(`   Deleting duplicate user: ${userId}`);
      await adminDb.collection('users').doc(userId).delete();
      console.log(`   ✅ Deleted user: ${userId}`);
    }

    // อัปเดต users ที่เหลือ
    for (const [userId, userData] of Object.entries(usersToKeep)) {
      console.log(`   Updating user: ${userData.email}`);
      await adminDb.collection('users').doc(userId).update({
        email: userData.email,
        role: userData.role,
        sites: userData.sites,
        status: 'ACTIVE',
        updatedAt: FieldValue.serverTimestamp()
      });
      console.log(`   ✅ Updated: ${userData.email}`);
    }

    console.log('🏗️ Step 3: Updating main site configuration...');
    
    // อัปเดต site หลัก
    await adminDb.collection('sites').doc(mainSiteId).update({
      name: 'Bannsansiri Project', // ชื่อใหม่ที่จะตรงกับ Google Sheets
      description: 'Main construction project for Bannsansiri development',
      members: ['q82uGlLOYcRaadwhlhST5omSoMp2', 'ZKuORdwvoKJej1R2Ia1J'],
      settings: {
        enabledSystems: ['RFA', 'RFI', 'CONSTRUCTION_INFO', 'WORK_REQUESTS'],
        googleSheetsConfig: {
          spreadsheetId: 'YOUR_GOOGLE_SHEET_ID_HERE', // ใส่ Google Sheet ID จริง
          sheetName: 'DB_TaskOverview'
        }
      },
      status: 'ACTIVE',
      updatedAt: FieldValue.serverTimestamp()
    });
    console.log('   ✅ Updated main site configuration');

    console.log('🔢 Step 4: Cleaning up orphaned counters...');
    
    // ลบ counters ของ sites ที่ถูกลบ
    const countersSnapshot = await adminDb.collection('counters').get();
    
    for (const doc of countersSnapshot.docs) {
      const data = doc.data();
      if (sitesToDelete.includes(data.siteId)) {
        console.log(`   Deleting orphaned counter: ${doc.id}`);
        await adminDb.collection('counters').doc(doc.id).delete();
        console.log(`   ✅ Deleted counter: ${doc.id}`);
      }
    }

    // ตรวจสอบว่ามี counters สำหรับ main site ครบไหม
    const requiredCounters = [
      { type: 'RFA-SHOP', prefix: 'RFS' },
      { type: 'RFA-GEN', prefix: 'RFG' },
      { type: 'RFA-MAT', prefix: 'RFM' },
      { type: 'RFI-INTERNAL', prefix: 'RFI' }
    ];

    for (const counter of requiredCounters) {
      const counterId = `${mainSiteId}_${counter.type}`;
      const counterDoc = await adminDb.collection('counters').doc(counterId).get();
      
      if (!counterDoc.exists) {
        console.log(`   Creating missing counter: ${counter.type}`);
        await adminDb.collection('counters').doc(counterId).set({
          siteId: mainSiteId,
          documentType: counter.type,
          prefix: counter.prefix,
          currentNumber: 0,
          createdAt: FieldValue.serverTimestamp()
        });
        console.log(`   ✅ Created counter: ${counter.type}`);
      }
    }

    console.log('📂 Step 5: Verifying categories...');
    
    // ตรวจสอบ categories ของ main site
    const categoriesSnapshot = await adminDb
      .collection('sites')
      .doc(mainSiteId)
      .collection('categories')
      .get();

    console.log(`   Main site has ${categoriesSnapshot.docs.length} categories`);
    
    if (categoriesSnapshot.docs.length === 0) {
      console.log('   Creating default categories...');
      const defaultCategories = [
        { code: 'SHOP_01', name: 'Shop Drawing - Structural', rfaTypes: ['RFA-SHOP'] },
        { code: 'SHOP_02', name: 'Shop Drawing - MEP', rfaTypes: ['RFA-SHOP'] },
        { code: 'GEN_01', name: 'General Submission', rfaTypes: ['RFA-GEN'] },
        { code: 'MAT_01', name: 'Material Approval', rfaTypes: ['RFA-MAT'] }
      ];

      for (const cat of defaultCategories) {
        await adminDb.collection('sites').doc(mainSiteId)
          .collection('categories').add({
          categoryCode: cat.code,
          categoryName: cat.name,
          rfaTypes: cat.rfaTypes,
          active: true,
          createdAt: FieldValue.serverTimestamp()
        });
        console.log(`   ✅ Created category: ${cat.code}`);
      }
    }

    console.log('\n🎉 Cleanup completed!');
    console.log('\n📋 FINAL STATE:');
    console.log(`   Main Site: ${mainSiteId}`);
    console.log('   Users: 2 (1 BIM, 1 Admin)');
    console.log('   Sites: 1 (removed duplicates)');
    console.log('   Categories: 4');
    console.log('   Counters: 4');
    
    console.log('\n🔧 NEXT STEPS:');
    console.log('   1. Add your Google Sheet ID to .env.local:');
    console.log('      NEXT_PUBLIC_GOOGLE_SHEET_ID=your_sheet_id');
    console.log('   2. Update site spreadsheetId in Firebase:');
    console.log(`      Update ${mainSiteId} googleSheetsConfig.spreadsheetId`);
    console.log('   3. Ensure Google Sheet has project name matching "Bannsansiri Project"');
    
    return {
      success: true,
      mainSiteId,
      keptUsers: Object.keys(usersToKeep).length,
      deletedSites: sitesToDelete.length,
      deletedUsers: usersToDelete.length
    };

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw error;
  }
}

// ฟังก์ชันอัปเดต Google Sheets config แยกต่างหาก
async function updateGoogleSheetsConfig(siteId: string, spreadsheetId: string) {
  console.log('🔧 Updating Google Sheets configuration...');
  
  try {
    await adminDb.collection('sites').doc(siteId).update({
      'settings.googleSheetsConfig.spreadsheetId': spreadsheetId,
      updatedAt: FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Updated spreadsheetId for site ${siteId}`);
    
  } catch (error) {
    console.error('❌ Error updating Google Sheets config:', error);
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'update-sheets' && args[1]) {
    // Usage: npm run cleanup update-sheets YOUR_SHEET_ID
    const mainSiteId = 'O4GN2NuHj72uq2Z8WKp4';
    updateGoogleSheetsConfig(mainSiteId, args[1])
      .then(() => {
        console.log('✅ Google Sheets config updated!');
        process.exit(0);
      })
      .catch((error) => {
        console.error('❌ Update failed:', error.message);
        process.exit(1);
      });
  } else {
    // Default cleanup
    cleanupFirestore()
      .then(() => {
        console.log('✅ Cleanup completed!');
        process.exit(0);
      })
      .catch((error) => {
        console.error('❌ Cleanup failed:', error.message);
        process.exit(1);
      });
  }
}

export { cleanupFirestore, updateGoogleSheetsConfig };