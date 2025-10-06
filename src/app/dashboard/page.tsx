// src/app/dashboard/page.tsx (แก้ไขแล้ว)
'use client';

import { Suspense } from 'react'; // 👈 1. Import Suspense
import { AuthGuard } from '@/lib/components/shared/AuthGuard';
import ApprovedDocumentLibrary from '@/components/rfa/ApprovedDocumentLibrary';

function DashboardContent() {
  return <ApprovedDocumentLibrary />;
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      {/* 👇 2. ครอบ DashboardContent ด้วย Suspense */}
      <Suspense fallback={<div className="p-8 text-center">Loading Dashboard...</div>}>
        <DashboardContent />
      </Suspense>
    </AuthGuard>
  );
}