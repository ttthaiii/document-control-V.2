'use client'

import { Suspense } from 'react'
// ✅ หน้านี้จะใช้ RFASingleDocumentPage จากไฟล์ rfa/[id]/page.tsx โดยตรง
// แต่ Next.js จะ "ดักจับ" และแสดงผลแค่ Component นี้ใน slot @modal
import RFADetailPage from '@/app/rfa/[id]/page'

// ไม่ต้องมี Logic ซ้ำซ้อน แค่ re-export หน้าหลักออกมา
// Next.js จะจัดการที่เหลือให้เอง
export default function InterceptedRFADetailPage() {
  return (
    <Suspense fallback={null}>
        <RFADetailPage />
    </Suspense>
  )
}