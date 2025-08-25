'use client';
import { AuthGuard } from '@/lib/components/shared/AuthGuard';
import { LoginForm } from '@/lib/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 text-4xl">🏗️</div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            ttsdoc v2
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            ระบบจัดการเอกสารงานก่อสร้าง
          </p>
        </div>
        
        <div className="mt-8">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}