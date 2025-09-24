'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { Loader2 } from 'lucide-react'

export default function RFADirectLinkHandlerPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const docId = params.id as string
    if (!docId) {
      setError("ไม่พบ ID ของเอกสารใน URL")
      return
    }

    const fetchTypeAndRedirect = async () => {
      try {
        // 1. ดึงข้อมูลเอกสารจาก Firestore เพื่อหา rfaType
        const docRef = doc(db, 'rfaDocuments', docId)
        const docSnap = await getDoc(docRef)

        if (docSnap.exists()) {
          const docData = docSnap.data()
          const rfaType = docData.rfaType // เช่น "RFA-MAT"

          if (rfaType) {
            // 2. สร้าง URL ใหม่ที่สมบูรณ์ โดยมีทั้ง type และ docId
            const currentQuery = new URLSearchParams(searchParams.toString())
            currentQuery.set('type', rfaType)
            currentQuery.set('docId', docId)

            // 3. Redirect ไปยังหน้า Dashboard ที่ถูกต้อง
            router.replace(`/dashboard/rfa?${currentQuery.toString()}`)
          } else {
            setError("ไม่สามารถระบุประเภทของเอกสารได้")
          }
        } else {
          setError("ไม่พบเอกสารที่คุณต้องการ")
        }
      } catch (err) {
        console.error("Redirect Error:", err)
        setError("เกิดข้อผิดพลาดในการเปิดเอกสาร")
      }
    }

    fetchTypeAndRedirect()
  }, [params.id, router, searchParams])

  // ระหว่างที่กำลังดึงข้อมูลและ Redirect ให้แสดงหน้า Loading
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        {error ? (
          <>
            <h2 className="text-xl font-bold text-red-700 mb-2">เกิดข้อผิดพลาด</h2>
            <p className="text-red-600">{error}</p>
            <button 
              onClick={() => router.push('/dashboard')}
              className="mt-4 bg-gray-200 px-4 py-2 rounded"
            >
              กลับสู่ Dashboard
            </button>
          </>
        ) : (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto" />
            <p className="mt-4 text-gray-600">กำลังเปิดเอกสาร...</p>
          </>
        )}
      </div>
    </div>
  )
}