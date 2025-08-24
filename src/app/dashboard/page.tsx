'use client';
import { AuthGuard } from '@/lib/components/shared/AuthGuard';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { useRouter } from 'next/navigation';

function DashboardContent() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-900">
              🏗️ ttsdoc v2 Dashboard
            </h1>
            <div className="flex items-center space-x-4">
              <span className="text-gray-600">
                👋 สวัสดี, {auth.currentUser?.email}
              </span>
              <button
                onClick={handleLogout}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
              >
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Quick Stats */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">📋 RFA Documents</h3>
            <p className="text-3xl font-bold text-blue-600">0</p>
            <p className="text-gray-600 text-sm">รอการอนุมัติ</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">❓ RFI Documents</h3>
            <p className="text-3xl font-bold text-yellow-600">0</p>
            <p className="text-gray-600 text-sm">รอการตอบ</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">📄 Construction Info</h3>
            <p className="text-3xl font-bold text-green-600">0</p>
            <p className="text-gray-600 text-sm">เอกสารทั้งหมด</p>
          </div>
        </div>

        {/* Welcome Message */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-blue-800 mb-2">
            🎉 ยินดีต้อนรับสู่ ttsdoc v2!
          </h2>
          <p className="text-blue-700">
            ระบบจัดการเอกสารงานก่อสร้างพร้อมใช้งานแล้ว เร็วๆ นี้จะมีฟีเจอร์ RFA, RFI, และ Construction Info
          </p>
          <div className="mt-4">
            <a
              href="/admin"
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 mr-4"
            >
              👑 Admin Panel
            </a>
            <span className="text-blue-600 text-sm">
              (สำหรับเชิญผู้ใช้ใหม่)
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard requireAuth={true}>
      <DashboardContent />
    </AuthGuard>
  );
}