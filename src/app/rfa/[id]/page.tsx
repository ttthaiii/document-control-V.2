'use client'

import { useState, useEffect, Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'

// ✅ 1. นำ Layout กลับมา
import Layout from '@/components/layout/Layout'
import RFADetailModal from '@/components/rfa/RFADetailModal'
import { AuthGuard } from '@/lib/components/shared/AuthGuard'
import { RFADocument } from '@/types/rfa'
import { Loader2 } from 'lucide-react'

function RFADetailFallbackPage() {
  const router = useRouter()
  const params = useParams()

  const [document, setDocument] = useState<RFADocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const id = params.id as string

  useEffect(() => {
    if (!id) return;
    // ... (โค้ดดึงข้อมูลเหมือนเดิม) ...
    const fetchDocument = async () => {
      setLoading(true)
      try {
        const docRef = doc(db, 'rfaDocuments', id)
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          setDocument({ id: docSnap.id, ...docSnap.data() } as RFADocument)
        } else { setError('ไม่พบเอกสาร') }
      } catch (err) { setError('เกิดข้อผิดพลาดในการโหลดข้อมูล') }
      finally { setLoading(false) }
    }
    fetchDocument()
  }, [id])

  const handleClose = () => router.back()

  // ✅ 2. แสดงทุกอย่างภายใต้ <Layout> เสมอ
  // นี่คือหน้าตาที่ถูกต้องสำหรับ Fallback
  return (
    <Layout>
      {/* พื้นหลังจะเป็นหน้า Dashboard ที่ว่างเปล่า แต่มี Layout ครบ */}
      <RFADetailModal
        document={document}
        onClose={handleClose}
        onUpdate={(updatedDoc) => setDocument(updatedDoc)}
        // loading และ error ถูกจัดการภายใน Modal แล้ว
      />
    </Layout>
  )
}

export default function RFADetailPage() {
    return (
        <Suspense fallback={<div>Loading Page...</div>}>
            <AuthGuard>
                <RFADetailFallbackPage />
            </AuthGuard>
        </Suspense>
    )
}