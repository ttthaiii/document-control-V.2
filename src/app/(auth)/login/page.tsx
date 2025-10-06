// src/app/(auth)/login/page.tsx (แก้ไขแล้ว)
import { Suspense } from 'react'; // 👈 1. Import Suspense
import { LoginForm } from '@/lib/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-gray-100 flex items-center justify-center p-4">
      {/* 👇 2. ครอบด้วย Suspense */}
      <Suspense fallback={<div>Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}