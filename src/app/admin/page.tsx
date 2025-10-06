// src/app/admin/page.tsx (แก้ไขแล้ว)
import { Suspense } from 'react'; // 👈 1. Import Suspense
import { InviteUserForm } from '@/lib/components/admin/InviteUserForm';
import { AuthGuard } from '@/lib/components/shared/AuthGuard';
import { ROLES } from '@/lib/config/workflow';

export default function AdminPage() {
  return (
    <AuthGuard requiredRoles={[ROLES.ADMIN]}>
      <div className="min-h-screen bg-gray-100 py-8">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold text-center text-gray-800 mb-8">
            👑 Admin Panel - ttsdoc v2
          </h1>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              {/* 👇 2. ครอบ InviteUserForm ด้วย Suspense */}
              <Suspense fallback={<div className="text-center p-8 bg-white rounded-lg shadow">Loading Form...</div>}>
                <InviteUserForm />
              </Suspense>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-lg">
              <h2 className="text-xl font-bold mb-4 text-gray-800">
                📋 วิธีใช้งาน
              </h2>
              <div className="space-y-3 text-sm text-gray-700">
                <p>1. ใส่อีเมลและเลือกตำแหน่งงานของผู้ใช้ใหม่</p>
                <p>2. คลิก "สร้างคำเชิญ" เพื่อสร้าง invitation link</p>
                <p>3. Copy link และส่งให้ผู้ใช้</p>
                <p>4. ผู้ใช้คลิก link → ตั้งรหัสผ่าน → เข้าใช้งานได้เลย</p>
              </div>
              <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-yellow-800 text-sm">
                  💡 <strong>Tips:</strong> Link จะหมดอายุใน 7 วัน
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}