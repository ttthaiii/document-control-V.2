// scripts/dump-firestore-data.ts
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables FIRST
config({ path: resolve(process.cwd(), '.env.local') });

// Add debug to verify loading
console.log('ENV CHECK:', {
  projectId: process.env.FIREBASE_PROJECT_ID ? 'SET' : 'MISSING',
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL ? 'SET' : 'MISSING',
  privateKey: process.env.FIREBASE_PRIVATE_KEY ? 'SET' : 'MISSING'
});

// Import Firebase AFTER env vars loaded
import { adminDb } from '../src/lib/firebase/admin';

interface DataDump {
  users: any[];
  sites: any[];
  categories: any[];
  counters: any[];
  rfaDocuments: any[];
  rfiDocuments: any[];
  invitations: any[];
}

async function dumpFirestoreData(): Promise<DataDump> {
  console.log('🔍 Starting Firestore data dump...\n');

  const dump: DataDump = {
    users: [],
    sites: [],
    categories: [],
    counters: [],
    rfaDocuments: [],
    rfiDocuments: [],
    invitations: []
  };

  try {
    // 1. Dump Users
    console.log('👥 Fetching Users...');
    const usersSnapshot = await adminDb.collection('users').get();
    usersSnapshot.docs.forEach(doc => {
      const data = doc.data();
      dump.users.push({
        id: doc.id,
        email: data.email || 'N/A',
        role: data.role || 'N/A',
        sites: data.sites || [],
        status: data.status || 'N/A',
        createdAt: data.createdAt?.toDate() || null,
        createdFromInvitation: data.createdFromInvitation || false
      });
    });
    console.log(`   Found ${dump.users.length} users`);

    // 2. Dump Sites
    console.log('🏗️ Fetching Sites...');
    const sitesSnapshot = await adminDb.collection('sites').get();
    
    for (const doc of sitesSnapshot.docs) {
      const data = doc.data();
      const siteData = {
        id: doc.id,
        name: data.name || 'N/A',
        description: data.description || '',
        members: data.members || [],
        status: data.status || 'N/A',
        createdAt: data.createdAt?.toDate() || null,
        settings: data.settings || {},
        categories: [] as any[]
      };

      // Get categories for this site
      try {
        const categoriesSnapshot = await adminDb
          .collection('sites')
          .doc(doc.id)
          .collection('categories')
          .get();
        
        categoriesSnapshot.docs.forEach((catDoc: any) => {
          const catData = catDoc.data();
          siteData.categories.push({
            id: catDoc.id,
            categoryCode: catData.categoryCode || 'N/A',
            categoryName: catData.categoryName || 'N/A',
            active: catData.active || false,
            rfaTypes: catData.rfaTypes || [],
            createdAt: catData.createdAt?.toDate() || null
          });
        });
      } catch (error) {
        console.log(`   ⚠️ Error fetching categories for site ${doc.id}: ${error}`);
      }

      dump.sites.push(siteData);
    }
    console.log(`   Found ${dump.sites.length} sites`);

    // 3. Dump Counters
    console.log('🔢 Fetching Counters...');
    const countersSnapshot = await adminDb.collection('counters').get();
    countersSnapshot.docs.forEach(doc => {
      const data = doc.data();
      dump.counters.push({
        id: doc.id,
        siteId: data.siteId || 'N/A',
        documentType: data.documentType || 'N/A',
        prefix: data.prefix || 'N/A',
        currentNumber: data.currentNumber || 0,
        createdAt: data.createdAt?.toDate() || null
      });
    });
    console.log(`   Found ${dump.counters.length} counters`);

    // 4. Dump RFA Documents
    console.log('📋 Fetching RFA Documents...');
    const rfaSnapshot = await adminDb.collection('rfaDocuments').get();
    rfaSnapshot.docs.forEach(doc => {
      const data = doc.data();
      dump.rfaDocuments.push({
        id: doc.id,
        documentNumber: data.documentNumber || 'N/A',
        rfaType: data.rfaType || 'N/A',
        title: data.title || 'N/A',
        siteId: data.siteId || 'N/A',
        categoryId: data.categoryId || 'N/A',
        status: data.status || 'N/A',
        currentStep: data.currentStep || 'N/A',
        createdBy: data.createdBy || 'N/A',
        assignedTo: data.assignedTo || 'N/A',
        createdAt: data.createdAt?.toDate() || null,
        taskData: data.taskData || null
      });
    });
    console.log(`   Found ${dump.rfaDocuments.length} RFA documents`);

    // 5. Dump RFI Documents
    console.log('❓ Fetching RFI Documents...');
    const rfiSnapshot = await adminDb.collection('rfiDocuments').get();
    rfiSnapshot.docs.forEach(doc => {
      const data = doc.data();
      dump.rfiDocuments.push({
        id: doc.id,
        documentNumber: data.documentNumber || 'N/A',
        title: data.title || 'N/A',
        siteId: data.siteId || 'N/A',
        status: data.status || 'N/A',
        createdBy: data.createdBy || 'N/A',
        createdAt: data.createdAt?.toDate() || null
      });
    });
    console.log(`   Found ${dump.rfiDocuments.length} RFI documents`);

    // 6. Dump Invitations
    console.log('✉️ Fetching Invitations...');
    const invitationsSnapshot = await adminDb.collection('invitations').get();
    invitationsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      dump.invitations.push({
        id: doc.id,
        email: data.email || 'N/A',
        role: data.role || 'N/A',
        sites: data.sites || [],
        status: data.status || 'N/A',
        createdAt: data.createdAt?.toDate() || null,
        expiresAt: data.expiresAt?.toDate() || null,
        acceptedAt: data.acceptedAt?.toDate() || null
      });
    });
    console.log(`   Found ${dump.invitations.length} invitations`);

    return dump;

  } catch (error) {
    console.error('❌ Error dumping data:', error);
    throw error;
  }
}

function analyzeData(dump: DataDump) {
  console.log('\n📊 DATA ANALYSIS\n');
  console.log('='.repeat(50));

  // Users Analysis
  console.log('\n👥 USERS ANALYSIS:');
  console.log(`Total users: ${dump.users.length}`);
  
  if (dump.users.length > 0) {
    const roleDistribution = dump.users.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {});
    
    console.log('Role distribution:', roleDistribution);
    
    dump.users.forEach((user: any, index: number) => {
      console.log(`  ${index + 1}. ${user.email} (${user.role})`);
      console.log(`     ID: ${user.id}`);
      console.log(`     Sites: [${user.sites.join(', ')}]`);
      console.log(`     Status: ${user.status}`);
      console.log(`     Created: ${user.createdAt?.toLocaleString() || 'N/A'}`);
      console.log('');
    });
  }

  // Sites Analysis  
  console.log('\n🏗️ SITES ANALYSIS:');
  console.log(`Total sites: ${dump.sites.length}`);
  
  dump.sites.forEach((site, index) => {
    console.log(`  ${index + 1}. ${site.name}`);
    console.log(`     ID: ${site.id}`);
    console.log(`     Members: ${site.members.length}`);
    console.log(`     Categories: ${site.categories.length}`);
    console.log(`     Status: ${site.status}`);
    console.log(`     Settings:`, JSON.stringify(site.settings, null, 6));
    
    if (site.categories.length > 0) {
      console.log('     Categories:');
      site.categories.forEach((cat: any) => {
        console.log(`       - ${cat.categoryCode}: ${cat.categoryName} (Active: ${cat.active})`);
      });
    }
    console.log('');
  });

  // Counters Analysis
  console.log('\n🔢 COUNTERS ANALYSIS:');
  console.log(`Total counters: ${dump.counters.length}`);
  
  dump.counters.forEach((counter, index) => {
    console.log(`  ${index + 1}. ${counter.id}`);
    console.log(`     Type: ${counter.documentType}`);
    console.log(`     Prefix: ${counter.prefix}`);
    console.log(`     Current: ${counter.currentNumber}`);
    console.log(`     Site: ${counter.siteId}`);
    console.log('');
  });

  // Documents Analysis
  console.log('\n📋 DOCUMENTS ANALYSIS:');
  console.log(`RFA Documents: ${dump.rfaDocuments.length}`);
  console.log(`RFI Documents: ${dump.rfiDocuments.length}`);
  console.log(`Invitations: ${dump.invitations.length}`);

  // Check for potential issues
  console.log('\n⚠️ POTENTIAL ISSUES:');
  
  // Check for users without sites
  const usersWithoutSites = dump.users.filter((user: any) => !user.sites || user.sites.length === 0);
  if (usersWithoutSites.length > 0) {
    console.log(`❗ Users without sites: ${usersWithoutSites.length}`);
    usersWithoutSites.forEach((user: any) => {
      console.log(`   - ${user.email} (${user.id})`);
    });
  }

  // Check for invalid site references
  const validSiteIds = new Set(dump.sites.map((site: any) => site.id));
  const invalidUserSites = dump.users.filter((user: any) => 
    user.sites.some((siteId: string) => !validSiteIds.has(siteId))
  );
  
  if (invalidUserSites.length > 0) {
    console.log(`❗ Users with invalid site references: ${invalidUserSites.length}`);
    invalidUserSites.forEach((user: any) => {
      const invalidSites = user.sites.filter((siteId: string) => !validSiteIds.has(siteId));
      console.log(`   - ${user.email}: Invalid sites [${invalidSites.join(', ')}]`);
    });
  }

  // Check for sites without categories
  const sitesWithoutCategories = dump.sites.filter((site: any) => site.categories.length === 0);
  if (sitesWithoutCategories.length > 0) {
    console.log(`❗ Sites without categories: ${sitesWithoutCategories.length}`);
    sitesWithoutCategories.forEach((site: any) => {
      console.log(`   - ${site.name} (${site.id})`);
    });
  }

  // Check for duplicate users
  const emailCounts = dump.users.reduce((acc: Record<string, number>, user: any) => {
    acc[user.email] = (acc[user.email] || 0) + 1;
    return acc;
  }, {});
  
  const duplicateEmails = Object.entries(emailCounts).filter(([_, count]) => (count as number) > 1);
  if (duplicateEmails.length > 0) {
    console.log(`❗ Duplicate user emails: ${duplicateEmails.length}`);
    duplicateEmails.forEach(([email, count]) => {
      console.log(`   - ${email}: ${count} entries`);
    });
  }

  console.log('\n' + '='.repeat(50));
}

// Execute if run directly
if (require.main === module) {
  dumpFirestoreData()
    .then((dump) => {
      analyzeData(dump);
      console.log('\n✅ Data dump completed!');
      
      // Save to file
      const fs = require('fs');
      const outputPath = './firestore-dump.json';
      fs.writeFileSync(outputPath, JSON.stringify(dump, null, 2));
      console.log(`💾 Data saved to: ${outputPath}`);
      
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Dump failed:', error.message);
      process.exit(1);
    });
}

export { dumpFirestoreData };