// src/app/dashboard/page.tsx (แก้ไขแล้ว)
'use client';

import { Suspense } from 'react'; // 👈 1. Import Suspense
import { AuthGuard } from '@/lib/components/shared/AuthGuard';
import ApprovedDocumentLibrary from '@/components/rfa/ApprovedDocumentLibrary';

function DashboardContent() {
  // v ทำให้ Container หลักเป็น Flexbox และสูงเต็มพื้นที่
  return (
    <div className="h-full flex flex-col">
        <ApprovedDocumentLibrary />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard blockedRoles={['CM']}>
      {/* 👇 2. ครอบ DashboardContent ด้วย Suspense */}
      <Suspense fallback={<div className="p-8 text-center">Loading Dashboard...</div>}>
        <DashboardContent />
      </Suspense>
    </AuthGuard>
  );
}