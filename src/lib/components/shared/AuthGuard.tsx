// src/lib/components/shared/AuthGuard.tsx
'use client'

import { useAuth } from '@/lib/auth/useAuth'
import { useRouter } from 'next/navigation'
import { useEffect, ReactNode } from 'react'

interface AuthGuardProps {
  children: ReactNode
  requiredRoles?: string[]
  requiredSiteAccess?: string[]
  fallback?: ReactNode
  redirectTo?: string
}

export function AuthGuard({ 
  children, 
  requiredRoles = [],
  requiredSiteAccess = [],
  fallback,
  redirectTo = '/login'
}: AuthGuardProps) {
  const { user, loading, error } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push(redirectTo)
    }
  }, [user, loading, router, redirectTo])

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังตรวจสอบสิทธิ์...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-red-800 mb-2">
              เกิดข้อผิดพลาด
            </h2>
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
            >
              ลองใหม่
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Not authenticated
  if (!user) {
    if (fallback) {
      return <>{fallback}</>
    }
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            กรุณาเข้าสู่ระบบ
          </h2>
          <p className="text-gray-600 mb-4">
            คุณต้องเข้าสู่ระบบเพื่อเข้าถึงหน้านี้
          </p>
          <button
            onClick={() => router.push(redirectTo)}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            เข้าสู่ระบบ
          </button>
        </div>
      </div>
    )
  }

  // Check role requirements
  if (requiredRoles.length > 0) {
    const hasRequiredRole = requiredRoles.includes(user.role)
    
    if (!hasRequiredRole) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center max-w-md mx-auto">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-yellow-800 mb-2">
                ไม่มีสิทธิ์เข้าถึง
              </h2>
              <p className="text-yellow-700 mb-2">
                คุณไม่มีสิทธิ์เข้าถึงหน้านี้
              </p>
              <p className="text-sm text-yellow-600 mb-4">
                ต้องการสิทธิ์: {requiredRoles.join(', ')} | สิทธิ์ปัจจุบัน: {user.role}
              </p>
              <button
                onClick={() => router.back()}
                className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700 transition-colors"
              >
                ย้อนกลับ
              </button>
            </div>
          </div>
        </div>
      )
    }
  }

  // Check site access requirements
  if (requiredSiteAccess.length > 0 && user.role !== 'Admin') {
    const hasAccessToAnySite = requiredSiteAccess.some(siteId => 
      user.sites?.includes(siteId)
    )
    
    if (!hasAccessToAnySite) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center max-w-md mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-red-800 mb-2">
                ไม่มีสิทธิ์เข้าถึงโครงการ
              </h2>
              <p className="text-red-600 mb-4">
                คุณไม่มีสิทธิ์เข้าถึงโครงการที่ต้องการ
              </p>
              <button
                onClick={() => router.back()}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
              >
                ย้อนกลับ
              </button>
            </div>
          </div>
        </div>
      )
    }
  }

  // All checks passed - render children
  return <>{children}</>
}

// Specialized AuthGuards for common use cases
export function AdminOnly({ children }: { children: ReactNode }) {
  return (
    <AuthGuard requiredRoles={['Admin']}>
      {children}
    </AuthGuard>
  )
}

export function BIMOnly({ children }: { children: ReactNode }) {
  return (
    <AuthGuard requiredRoles={['BIM']}>
      {children}
    </AuthGuard>
  )
}

export function SiteAdminOrAdmin({ children }: { children: ReactNode }) {
  return (
    <AuthGuard requiredRoles={['Site Admin', 'Admin']}>
      {children}
    </AuthGuard>
  )
}

export function CMOrAdmin({ children }: { children: ReactNode }) {
  return (
    <AuthGuard requiredRoles={['CM', 'Admin']}>
      {children}
    </AuthGuard>
  )
}