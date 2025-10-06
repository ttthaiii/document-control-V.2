import { Suspense } from 'react';
import { AcceptInvitationForm } from '@/lib/components/auth/AcceptInvitationForm';

interface PageProps {
  searchParams: { token?: string };
}

export default function AcceptInvitationPage({ searchParams }: PageProps) {
  const token = searchParams.token;

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">❌ Token ไม่ถูกต้อง</h2>
          <p className="text-gray-600 mb-4">ไม่พบ invitation token ใน URL</p>
          <a 
            href="/login" 
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            กลับสู่หน้าเข้าสู่ระบบ
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <Suspense fallback={<div>Loading...</div>}>
        <AcceptInvitationForm token={token} />
      </Suspense>
    </div>
  );
}