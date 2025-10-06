// src/app/rfa/general/create/page.tsx (แก้ไขแล้ว)
'use client';
import { Suspense } from 'react'; // 👈 1. Import Suspense
import { AuthGuard } from '@/lib/components/shared/AuthGuard';
import Layout from '@/components/layout/Layout';
import CreateRFAForm from '@/components/rfa/CreateRFAForm';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/useAuth';
import { ROLES } from '@/lib/config/workflow';

function RFAGeneralCreateContent() {
  const router = useRouter();
  const { user: appUser } = useAuth();

  const handleCancel = () => {
    router.push('/dashboard/rfa?type=RFA-GEN');
  };

  const user = appUser ? {
    id: appUser.id,
    email: appUser.email,
    role: appUser.role,
    sites: appUser.sites || []
  } : undefined;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            General Submission - RFA
          </h1>
        </div>
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6">
            <CreateRFAForm
              onClose={handleCancel}
              isModal={false}
              userProp={user}
              presetRfaType="RFA-GEN"
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default function RFAGeneralCreatePage() {
  return (
    <AuthGuard requiredRoles={[ROLES.BIM, ROLES.SITE_ADMIN, ROLES.ADMIN]}>
      {/* 👇 2. ครอบ RFAGeneralCreateContent ด้วย Suspense */}
      <Suspense fallback={<div className="p-8 text-center">Loading Form...</div>}>
        <RFAGeneralCreateContent />
      </Suspense>
    </AuthGuard>
  );
}