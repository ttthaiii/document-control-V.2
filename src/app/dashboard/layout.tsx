// src/app/dashboard/layout.tsx
'use client'

import { Suspense } from 'react' // 👈 เพิ่ม Suspense
import Layout from '@/components/layout/Layout'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    }>
      <Layout>{children}</Layout>
    </Suspense>
  )
}