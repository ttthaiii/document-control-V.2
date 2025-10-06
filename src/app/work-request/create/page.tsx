'use client';

import { AuthGuard } from '@/lib/components/shared/AuthGuard';
import Layout from '@/components/layout/Layout';
import CreateWorkRequestForm from '@/components/work-request/CreateWorkRequestForm';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/useAuth';
import { ROLES } from '@/lib/config/workflow';
import { Suspense } from 'react';

function WorkRequestCreateContent() {
  const router = useRouter();
  const { user: appUser } = useAuth();

  // --- 👇 จุดที่แก้ไข ---
  const handleClose = () => {
    // เปลี่ยนจาก '/dashboard' เป็น '/dashboard/work-request'
    router.push('/dashboard/work-request');
  };
  // --- 👆 สิ้นสุดจุดที่แก้ไข ---
  
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
              onClose={handleClose} // ใช้ handleClose ที่แก้ไขแล้ว
              userProp={user}
            /> 
        </div>
      </div>
    </Layout>
  );
}

export default function WorkRequestCreatePage() {
  return (
    <AuthGuard requiredRoles={[ROLES.SITE_ADMIN, ROLES.ADMIN]}>
      {/* 👇 2. ครอบด้วย Suspense */}
      <Suspense fallback={<div className="text-center p-8">Loading Form...</div>}>
        <WorkRequestCreateContent />
      </Suspense>
    </AuthGuard>
  );
}