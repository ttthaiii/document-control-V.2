// src/lib/components/shared/AuthGuard.tsx
'use client'

import { useAuth } from '@/lib/auth/useAuth'
import { useRouter } from 'next/navigation'
import { useEffect, ReactNode } from 'react'

const SkeletonLoader = () => (
  <div className="min-h-screen bg-gray-50">
    <div className="animate-pulse">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="h-8 bg-gray-200 rounded w-32"></div>
            <div className="h-8 bg-gray-200 rounded w-24"></div>
          </div>
        </div>
      </div>
      <div className="flex">
        <div className="w-64 bg-white border-r border-gray-200 min-h-screen">
          <div className="p-4 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
        <div className="flex-1 p-8">
          <div className="space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white p-6 rounded-lg shadow">
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded mb-4"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
)

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
    return <SkeletonLoader />
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