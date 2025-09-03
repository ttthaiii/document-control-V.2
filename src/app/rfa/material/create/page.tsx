'use client';
import { AuthGuard } from '@/lib/components/shared/AuthGuard';
import Layout from '@/components/layout/Layout';
import CreateRFAForm from '@/components/rfa/CreateRFAForm';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/useAuth';

function RFAMaterialCreateContent() {
  const router = useRouter();
  const { user: appUser } = useAuth();

  // Redirect to the correct RFA list page on cancel
  const handleCancel = () => {
    router.push('/dashboard/rfa?type=RFA-MAT');
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
            <span className="text-2xl">🧱</span>
            <h1 className="text-2xl font-bold text-gray-900">
              Material Approval - RFA
            </h1>
          </div>
          <p className="text-gray-600">
            สร้างเอกสารขออนุมัติวัสดุ • Site Admin → CM
          </p>
          <div className="mt-2 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
            RFA-MAT
          </div>
        </div>
        
        {/* Form Container */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6 border-b bg-orange-50">
            <h2 className="text-xl font-semibold text-orange-900 mb-2">
              Request for Approval - Material
            </h2>
            <p className="text-orange-700 text-sm">
              🏗️ วัสดุก่อสร้าง อุปกรณ์ หรือผลิตภัณฑ์ที่ต้องการการอนุมัติก่อนใช้งาน
            </p>
          </div>
          
          <div className="p-6">
            <CreateRFAForm
              onClose={handleCancel}
              isModal={false}
              userProp={user}
              presetRfaType="RFA-MAT"
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default function RFAMaterialCreatePage() {
  return (
    <AuthGuard requiredRoles={['Site Admin', 'Admin']}>
      <RFAMaterialCreateContent />
    </AuthGuard>
  );
}