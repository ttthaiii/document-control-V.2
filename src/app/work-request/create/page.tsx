// src/app/work-request/create/page.tsx
'use client';

import { AuthGuard } from '@/lib/components/shared/AuthGuard';
import Layout from '@/components/layout/Layout';
import CreateWorkRequestForm from '@/components/work-request/CreateWorkRequestForm';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/useAuth';
import { ROLES } from '@/lib/config/workflow'; // Import ROLES มาใช้
import { Suspense } from 'react';

function WorkRequestCreateContent() {
  // ... (โค้ดข้างในเหมือนเดิม) ...
  const router = useRouter();
  const { user: appUser } = useAuth();

  const handleClose = () => {
    router.push('/dashboard/work-request');
  };
  
  const user = appUser ? {
    id: appUser.id,
    email: appUser.email,
    role: appUser.role,
    sites: appUser.sites || [],
    status: appUser.status
  } : undefined;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-2xl">✍️</span>
            <h1 className="text-2xl font-bold text-gray-900">
              Create New Work Request
            </h1>
          </div>
          <p className="text-gray-600">
            ส่งคำร้องของานไปยังทีม BIM สำหรับงานเร่งด่วนหรืองานที่ไม่ได้วางแผน
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <CreateWorkRequestForm
              onClose={handleClose}
              userProp={user}
            /> 
        </div>
      </div>
    </Layout>
  );
}

export default function WorkRequestCreatePage() {
  return (
    // ✅ แก้ไข AuthGuard: ใส่ Role ทั้งหมดที่มีสิทธิ์ "สร้าง" ตามระบบใหม่ (PE, OE, Admin)
    // หมายเหตุ: เราใส่เผื่อไว้ก่อนได้ แล้วไปเช็คละเอียดใน Form อีกที
    <AuthGuard requiredRoles={[
      ROLES.ADMIN, 
      ROLES.PE, 
      ROLES.OE,
      // แถม Role อื่นเผื่อไว้ ถ้าอนาคตคุณเปลี่ยนใจอนุญาต
      ROLES.SITE_ADMIN, 
      ROLES.BIM 
    ]}>
      <Suspense fallback={<div className="text-center p-8">Loading Form...</div>}>
        <WorkRequestCreateContent />
      </Suspense>
    </AuthGuard>
  );
}