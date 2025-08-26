'use client';
import { AuthGuard } from '@/lib/components/shared/AuthGuard';
import Layout from '@/components/layout/Layout';
import CreateRFAForm from '@/components/rfa/CreateRFAForm';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/useAuth';

function RFAShopCreateContent() {
  const router = useRouter();
  const { user: appUser } = useAuth();

  const handleSuccess = (data: any) => {
    console.log('RFA-SHOP created successfully:', data);
    // Redirect to RFA list or dashboard
    router.push('/dashboard');
  };

  const handleCancel = () => {
    router.push('/dashboard');
  };

  // Convert AppUser to User format for CreateRFAForm
  const user = appUser ? {
    id: appUser.id,
    email: appUser.email,
    role: appUser.role,
    sites: appUser.sites || []
  } : undefined;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        {/* Page Header */}
        <div className="mb-6">
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-2xl">🏗️</span>
            <h1 className="text-2xl font-bold text-gray-900">
              Shop Drawing - RFA
            </h1>
          </div>
          <p className="text-gray-600">
            สร้างเอกสารขออนุมัติ Shop Drawing • BIM → Site Admin → CM
          </p>
          <div className="mt-2 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            RFA-SHOP
          </div>
        </div>
        
        {/* Form Container */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6 border-b bg-blue-50">
            <h2 className="text-xl font-semibold text-blue-900 mb-2">
              Request for Approval - Shop Drawing
            </h2>
            <p className="text-blue-700 text-sm">
              📋 แบบร่างการผลิต/การติดตั้งที่ต้องได้รับการอนุมัติก่อนดำเนินการ
            </p>
          </div>
          
          <div className="p-6">
            <CreateRFAForm
              onClose={handleCancel}
              isModal={false}
              userProp={user}
              presetRfaType="RFA-SHOP"  // 🎯 Preset type - ข้าม Step 1
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default function RFAShopCreatePage() {
  return (
    <AuthGuard requiredRoles={['BIM', 'Admin']}>
      <RFAShopCreateContent />
    </AuthGuard>
  );
}