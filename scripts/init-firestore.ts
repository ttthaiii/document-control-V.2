// scripts/init-firestore.ts - Fixed Version
import { adminDb } from '../src/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'

async function initializeFirestore() {
  console.log('🔥 Initializing Firestore Database...')
  
  try {
    // 1. สร้าง Bannsansiri site
    console.log('📍 Creating Bannsansiri site...')
    const siteRef = await adminDb.collection('sites').add({
      name: 'Bannsansiri Construction Project',
      description: 'Main construction project for Bannsansiri development',
      members: [],
      settings: {
        enabledSystems: ['RFA', 'RFI', 'CONSTRUCTION_INFO', 'WORK_REQUESTS'],
        googleSheetsConfig: {
          spreadsheetId: '',
          sheetName: 'DB_TaskOverview'
        }
      },
      status: 'ACTIVE',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    })
    
    console.log('✅ Site created with ID:', siteRef.id)
    const siteId = siteRef.id
    
    // 2. สร้าง Admin user
    console.log('👤 Creating Admin user...')
    const adminUserRef = await adminDb.collection('users').add({
      email: 'admin@bannsansiri.com',
      role: 'Admin',
      sites: [siteId],
      status: 'ACTIVE',
      createdFromInvitation: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    })
    
    console.log('✅ Admin user created with ID:', adminUserRef.id)
    
    // 3. แก้ไข existing users
    console.log('👷 Fixing existing users...')
    
    const knownUserIds = [
      'q82uGlLOYcRaadwhlhST5omSoMp2',
      'vUffX1OTzL5PSijDcydy'
    ]
    
    const siteMembers = []
    
    // เพิ่ม admin user ใน members
    siteMembers.push({
      userId: adminUserRef.id,
      role: 'Admin',
      joinedAt: new Date() // ใช้ Date object แทน FieldValue.serverTimestamp()
    })
    
    for (const userId of knownUserIds) {
      try {
        const userDoc = await adminDb.collection('users').doc(userId).get()
        
        if (userDoc.exists) {
          const userData = userDoc.data()
          if (!userData) {
            console.log(`  ⚠️ No data found for user ${userId}`)
            continue
          }
          
          console.log(`📋 Found user: ${userData.email} (${userData.role})`)
          
          // แก้ไข sites field
          let sitesArray = []
          if (userData.sites) {
            if (Array.isArray(userData.sites)) {
              sitesArray = userData.sites
            } else {
              sitesArray = [siteId] // แปลง string เป็น array
              console.log(`  🔧 Fixed sites field for ${userData.email}`)
            }
          }
          
          if (!sitesArray.includes(siteId)) {
            sitesArray.push(siteId)
          }
          
          // อัปเดต user
          await adminDb.collection('users').doc(userId).update({
            sites: sitesArray,
            updatedAt: FieldValue.serverTimestamp()
          })
          
          console.log(`  ✅ Updated ${userData.email}`)
          
          // เพิ่มใน site members
          siteMembers.push({
            userId: userId,
            role: userData.role,
            joinedAt: new Date() // ใช้ Date object แทน FieldValue.serverTimestamp()
          })
        }
      } catch (error) {
        console.log(`  ⚠️ Skip user ${userId}: ${error}`)
      }
    }
    
    // อัปเดต site members
    await adminDb.collection('sites').doc(siteId).update({
      members: siteMembers,
      updatedAt: FieldValue.serverTimestamp()
    })
    
    console.log('✅ Site members updated')
    
    // 4. สร้าง categories
    console.log('📂 Creating categories...')
    const categories = [
      { code: 'SHOP_01', name: 'Shop Drawing - Structural' },
      { code: 'SHOP_02', name: 'Shop Drawing - MEP' },
      { code: 'GEN_01', name: 'General Submission' },
      { code: 'MAT_01', name: 'Material Approval' }
    ]
    
    for (const cat of categories) {
      await adminDb.collection('sites').doc(siteId)
        .collection('categories').add({
        categoryCode: cat.code,
        categoryName: cat.name,
        active: true,
        createdAt: FieldValue.serverTimestamp()
      })
      console.log(`  ✅ Category: ${cat.code}`)
    }
    
    // 5. สร้าง counters
    console.log('🔢 Creating counters...')
    const counters = [
      { type: 'RFA-SHOP', prefix: 'RFS' },
      { type: 'RFA-GEN', prefix: 'RFG' },
      { type: 'RFA-MAT', prefix: 'RFM' },
      { type: 'RFI-INTERNAL', prefix: 'RFI' }
    ]
    
    for (const counter of counters) {
      await adminDb.collection('counters').doc(`${siteId}_${counter.type}`).set({
        siteId: siteId,
        documentType: counter.type,
        prefix: counter.prefix,
        currentNumber: 0,
        createdAt: FieldValue.serverTimestamp()
      })
      console.log(`  ✅ Counter: ${counter.type}`)
    }
    
    console.log('\n🎉 Database initialization completed!')
    console.log(`📍 Site ID: ${siteId}`)
    console.log(`👤 Admin ID: ${adminUserRef.id}`)
    console.log(`📂 Categories: ${categories.length} created`)
    console.log(`🔢 Counters: ${counters.length} created`)
    
    return {
      success: true,
      siteId: siteId,
      adminUserId: adminUserRef.id
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  }
}

// Execute if run directly
if (require.main === module) {
  initializeFirestore()
    .then(() => {
      console.log('✅ Script completed!')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Script failed:', error.message)
      process.exit(1)
    })
}

export { initializeFirestore }