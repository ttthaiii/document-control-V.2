'use client';
import { AuthGuard } from '@/lib/components/shared/AuthGuard';
import CreateRFAForm from '@/components/rfa/CreateRFAForm';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/useAuth';
import { ArrowLeft } from 'lucide-react';

function RFACreateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: appUser } = useAuth(); // เปลี่ยนชื่อตัวแปร
  const preselectedType = searchParams.get('type');

  const handleSuccess = (data: any) => {
    console.log('RFA created successfully:', data);
    router.push('/dashboard/rfa');
  };

  const handleCancel = () => {
    router.back();
  };

  // Convert AppUser to User format for CreateRFAForm
  const user = appUser ? {
    id: appUser.id,
    email: appUser.email,
    role: appUser.role,
    sites: appUser.sites || []
  } : undefined;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleCancel}
                className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                กลับ
              </button>
              <h1 className="text-2xl font-bold text-gray-900">
                📋 สร้างเอกสาร RFA
              </h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-800">
              สร้างเอกสาร Request for Approval (RFA)
            </h2>
            <p className="text-gray-600 mt-1">
              กรุณากรอกข้อมูลเอกสารให้ครบถ้วนก่อนส่งเพื่อขออนุมัติ
            </p>
          </div>
          
          <div className="p-6">
            <CreateRFAForm
              onClose={handleCancel}
              isModal={false}
              user={user} // ใช้ user ที่แปลงแล้ว
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function RFACreatePage() {
  return (
    <AuthGuard>
      <RFACreateContent />
    </AuthGuard>
  );
}