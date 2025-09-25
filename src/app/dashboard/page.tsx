// src/app/dashboard/page.tsx (โค้ดใหม่)

'use client';

import { AuthGuard } from '@/lib/components/shared/AuthGuard';
import ApprovedDocumentLibrary from '@/components/rfa/ApprovedDocumentLibrary'; // 👈 1. Import component ใหม่

function DashboardContent() {
  // 2. ลบโค้ดเก่าออกทั้งหมด แล้วแทนที่ด้วย Component ใหม่
  return <ApprovedDocumentLibrary />;
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}