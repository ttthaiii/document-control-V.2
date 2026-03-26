'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { RFADocument } from '@/types/rfa'
import RFADetailModal from './RFADetailModal' // <-- ใช้ Modal ตัวเดิมที่คุณมี
import { useNotification } from '@/lib/context/NotificationContext';
import { useLogActivity } from '@/lib/hooks/useLogActivity';


interface SmartRFAModalProps {
  documentId: string | null
  onClose: () => void
}

export default function SmartRFAModal({ documentId, onClose }: SmartRFAModalProps) {
  const { logActivity } = useLogActivity();
  const router = useRouter()
  const searchParams = useSearchParams()
  const [documentData, setDocumentData] = useState<RFADocument | null>(null)
  const { showNotification } = useNotification()
  const hasLoggedViewRef = useRef<string | null>(null);
  // ไม่ต้องใช้ state loading, error ที่นี่ เพราะ RFADetailModal จัดการภายในตัวเองได้

  // Effect สำหรับดึงข้อมูลเอกสารเมื่อ documentId เปลี่ยน
  useEffect(() => {
    if (!documentId) {
      setDocumentData(null)
      return;
    }

    const fetchDocument = async () => {
      const docRef = doc(db, 'rfaDocuments', documentId)
      const docSnap = await getDoc(docRef)
      if (docSnap.exists()) {
        const data = docSnap.data();
        setDocumentData({ id: docSnap.id, ...data } as RFADocument)
        
        // Log View Detail
        if (hasLoggedViewRef.current !== docSnap.id) {
          logActivity({
            action: 'VIEW_DETAIL',
            resourceType: 'RFA',
            resourceId: docSnap.id,
            resourceName: data.documentNumber || data.runningNumber,
            siteId: data.site?.id,
            siteName: data.site?.name,
            description: `เข้าดูรายละเอียด RFA: ${data.documentNumber || data.runningNumber}`
          });
          hasLoggedViewRef.current = docSnap.id;
        }
      } else {
        // หากไม่เจอเอกสาร ให้ปิด Modal และแจ้งผู้ใช้
        showNotification('error', 'ข้อผิดพลาด', 'ไม่พบเอกสารที่คุณต้องการ')
        onClose()
      }
    }
    fetchDocument()
  }, [documentId, onClose])

  // Effect สำหรับจัดการ URL และปุ่ม Back ของเบราว์เซอร์
  useEffect(() => {
    const currentQuery = searchParams.toString();
    const newUrl = `/dashboard/rfa?${currentQuery.replace(/&?docId=[^&]*/, '')}&docId=${documentId}`;

    const handlePopState = (event: PopStateEvent) => {
      onClose()
    }

    if (documentId) {
      // เปลี่ยน URL โดยไม่โหลดหน้าใหม่
      window.history.pushState({ docId: documentId }, '', newUrl);
      window.addEventListener('popstate', handlePopState)
    }

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [documentId, onClose, searchParams])

  // ถ้าไม่มี documentId ก็ไม่ต้องแสดงอะไรเลย
  if (!documentId) return null

  return (
    <RFADetailModal
      document={documentData}
      onClose={onClose} // ส่ง props onClose ไปตรงๆ
      onUpdate={setDocumentData}
    />
  )
}