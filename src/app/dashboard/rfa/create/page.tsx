// src/app/dashboard/rfa/create/page.tsx (แก้ไขแล้ว)
'use client'

import { Suspense } from 'react'; // 👈 1. Import Suspense
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
          <div className="mb-6">
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">
              📋 สร้างเอกสาร RFA
            </h1>
            <p className="text-gray-600 mt-2">
              สร้างเอกสาร Request for Approval ใหม่
            </p>
          </div>
          <div className="bg-white rounded-lg shadow">
            {/* 👇 2. ครอบ CreateRFAForm ด้วย Suspense */}
            <Suspense fallback={<div className="p-8 text-center">Loading Form...</div>}>
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
            </Suspense>
          </div>
        </div>
      </Layout>
    </AuthGuard>
  )
}