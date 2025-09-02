// src/app/dashboard/rfa/create/page.tsx
'use client'

import { AuthGuard } from '@/lib/components/shared/AuthGuard'
import Layout from '@/components/layout/Layout'
import CreateRFAForm from '@/components/rfa/CreateRFAForm'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/useAuth'

export default function CreateRFAPage() {
  const router = useRouter()
  const { user } = useAuth()

  const handleClose = () => {
    router.push('/dashboard/rfa')
  }

  return (
    <AuthGuard>
      <Layout>
        <div className="max-w-7xl mx-auto">
          {/* Page Header */}
          <div className="mb-6">
            <div className="flex items-center space-x-2 text-sm text-gray-500 mb-4">
              <span 
                onClick={() => router.push('/dashboard')}
                className="hover:text-blue-600 cursor-pointer"
              >
                Dashboard
              </span>
              <span>›</span>
              <span 
                onClick={() => router.push('/dashboard/rfa')}
                className="hover:text-blue-600 cursor-pointer"
              >
                RFA Documents
              </span>
              <span>›</span>
              <span className="text-gray-700">สร้างเอกสารใหม่</span>
            </div>

            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">
              📋 สร้างเอกสาร RFA
            </h1>
            <p className="text-gray-600 mt-2">
              สร้างเอกสาร Request for Approval ใหม่
            </p>
          </div>

          {/* Form Container */}
          <div className="bg-white rounded-lg shadow">
            <CreateRFAForm
              onClose={handleClose}
              isModal={false}
              userProp={user ? {
                id: user.id,
                email: user.email,
                role: user.role,
                sites: user.sites || []
              } : undefined}
            />
          </div>
        </div>
      </Layout>
    </AuthGuard>
  )
}