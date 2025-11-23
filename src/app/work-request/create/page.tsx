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
    // --- 👇 นี่คือจุดที่แก้ไข ---
    // เพิ่ม ROLES.BIM เข้าไปใน AuthGuard
    <AuthGuard requiredRoles={[ROLES.SITE_ADMIN, ROLES.ADMIN, ROLES.BIM]}>
    // --- 👆 สิ้นสุดการแก้ไข ---
      <Suspense fallback={<div className="text-center p-8">Loading Form...</div>}>
        <WorkRequestCreateContent />
      </Suspense>
    </AuthGuard>
  );
}