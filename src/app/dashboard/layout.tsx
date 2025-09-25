// src/app/dashboard/layout.tsx

'use client'

import Layout from '@/components/layout/Layout'

// Layout นี้จะถูกใช้กับทุกหน้าที่อยู่ใน /dashboard/*
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <Layout>{children}</Layout>
}