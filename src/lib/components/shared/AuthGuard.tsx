'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

export function AuthGuard({ children, requireAuth = true }: AuthGuardProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);

      if (requireAuth && !user) {
        // User not authenticated, redirect to login
        router.push('/login');
      } else if (!requireAuth && user) {
        // User authenticated but on auth page, redirect to dashboard
        router.push('/dashboard');
      }
    });

    return () => unsubscribe();
  }, [router, requireAuth]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังตรวจสอบการเข้าสู่ระบบ...</p>
        </div>
      </div>
    );
  }

  // If require auth and no user, don't render children (will redirect)
  if (requireAuth && !user) {
    return null;
  }

  // If don't require auth and has user, don't render children (will redirect)
  if (!requireAuth && user) {
    return null;
  }

  return <>{children}</>;
}