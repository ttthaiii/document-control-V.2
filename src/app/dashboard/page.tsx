'use client';
import { AuthGuard } from '@/lib/components/shared/AuthGuard';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/useAuth';

function DashboardContent() {
  const router = useRouter();
  const { user } = useAuth();

  return (
      <div className="max-w-7xl mx-auto">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            🏗️ Dashboard
          </h1>
          <p className="text-gray-600 mt-2">
            ภาพรวมเอกสารและสถานะโครงการ
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* RFA Documents Card */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">📋 RFA Documents</h3>
            <p className="text-3xl font-bold text-blue-600">0</p>
            <p className="text-gray-600 text-sm mb-4">รอการอนุมัติ</p>
            
            <div className="flex space-x-2">
            <button
              onClick={() => router.push('/dashboard/rfa/create')}
              className="flex-1 bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 transition-colors"
            >
              สร้าง RFA
            </button>
            <button
              onClick={() => router.push('/dashboard/rfa')}
              className="flex-1 bg-gray-100 text-gray-700 px-3 py-2 rounded text-sm hover:bg-gray-200 transition-colors"
            >
              ดูทั้งหมด
            </button>
            </div>
          </div>

          {/* RFI Documents Card */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">❓ RFI Documents</h3>
            <p className="text-3xl font-bold text-yellow-600">0</p>
            <p className="text-gray-600 text-sm">รอการตอบ</p>
          </div>

          {/* Construction Info Card */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">📄 Construction Info</h3>
            <p className="text-3xl font-bold text-green-600">0</p>
            <p className="text-gray-600 text-sm">เอกสารทั้งหมด</p>
          </div>
        </div>

        {/* Welcome Message */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-blue-800 mb-2">
            🎉 ยินดีต้อนรับสู่ ttsdoc v2!
          </h2>
          <p className="text-blue-700 mb-4">
            ระบบจัดการเอกสารงานก่อสร้างพร้อมใช้งานแล้ว เร็วๆ นี้จะมีฟีเจอร์ RFA, RFI, และ Construction Info
          </p>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/admin')}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
            >
              👑 Admin Panel
            </button>
            <span className="text-blue-600 text-sm">
              (สำหรับเชิญผู้ใช้ใหม่)
            </span>
          </div>
        </div>
      </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}