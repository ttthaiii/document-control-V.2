import { Suspense } from 'react';
import { ResetPasswordForm } from '@/lib/components/auth/ResetPasswordForm';

export default function ResetPasswordPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-100 to-gray-100 flex items-center justify-center p-4">
            <Suspense fallback={<div>Loading...</div>}>
                <ResetPasswordForm />
            </Suspense>
        </div>
    );
}
