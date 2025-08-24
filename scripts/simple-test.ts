import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local file explicitly
config({ path: resolve(process.cwd(), '.env.local') });

async function testEnv() {
  console.log('🔍 Testing Environment Variables (with dotenv)...\n');
  
  // Check if variables exist now
  console.log('📋 Environment Variables:');
  console.log('FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID || '❌ MISSING');
  console.log('FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL || '❌ MISSING');  
  console.log('FIREBASE_PRIVATE_KEY exists:', process.env.FIREBASE_PRIVATE_KEY ? '✅ YES' : '❌ NO');
  
  if (process.env.FIREBASE_PRIVATE_KEY) {
    console.log('FIREBASE_PRIVATE_KEY length:', process.env.FIREBASE_PRIVATE_KEY.length);
    console.log('FIREBASE_PRIVATE_KEY preview:', process.env.FIREBASE_PRIVATE_KEY.substring(0, 30) + '...');
  }
  
  // Web SDK variables
  console.log('\n🌐 Next.js Public Variables:');
  console.log('NEXT_PUBLIC_FIREBASE_API_KEY:', process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? '✅ SET' : '❌ MISSING');
  console.log('NEXT_PUBLIC_FIREBASE_PROJECT_ID:', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '❌ MISSING');
  
  // Test Firebase Admin config
  console.log('\n🔧 Testing Firebase Admin Config:');
  
  try {
    const config = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };
    
    if (config.projectId && config.clientEmail && config.privateKey) {
      console.log('✅ All required fields present');
      console.log('   Project ID:', config.projectId);
      console.log('   Client Email:', config.clientEmail);
      console.log('   Private Key length:', config.privateKey.length);
      
      // Check private key format
      if (config.privateKey.includes('BEGIN PRIVATE KEY')) {
        console.log('✅ Private key format looks correct');
        console.log('🎉 Ready to test Firebase connection!');
      } else {
        console.log('❌ Private key format may be incorrect');
      }
      
    } else {
      console.log('❌ Missing required configuration');
      
      if (!config.projectId) console.log('   - Missing PROJECT_ID');
      if (!config.clientEmail) console.log('   - Missing CLIENT_EMAIL');  
      if (!config.privateKey) console.log('   - Missing PRIVATE_KEY');
    }
    
  } catch (error: any) {
    console.error('❌ Configuration error:', error.message || error);
  }
}

testEnv();