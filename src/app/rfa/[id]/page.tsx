// src/app/rfa/[id]/page.tsx (แก้ไขสมบูรณ์)
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth/useAuth' // 👈 1. Import useAuth

export default function RFADirectLinkHandlerPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  
  const { user, loading: authLoading } = useAuth() // 👈 2. เรียกใช้ useAuth เพื่อเช็คสถานะ

  useEffect(() => {
    // ถ้ากำลังรอสถานะ login ให้แสดงหน้า loading ไปก่อน
    if (authLoading) {
      return; 
    }

    const docId = params.id as string;

    // --- 👇 [แก้ไข] Logic การทำงานใหม่ทั้งหมด ---
    
    // 3. เมื่อเช็คสถานะเสร็จแล้ว และพบว่า "ยังไม่ได้ login"
    if (!user) {
      // สร้าง URL ปลายทาง (เอกสารที่พยายามจะเปิด)
      const destination = `/rfa/${docId}`;
      // ส่งไปหน้า login พร้อมบอกว่า login เสร็จแล้วให้กลับมาที่นี่
      router.replace(`/login?redirect=${encodeURIComponent(destination)}`);
      return; // หยุดการทำงานทันที
    }

    // 4. ถ้า "login อยู่แล้ว" ให้ทำงานตามปกติ
    const fetchTypeAndRedirect = async () => {
      if (!docId) {
        setError("ไม่พบ ID ของเอกสารใน URL");
        return;
      }
      try {
        const docRef = doc(db, 'rfaDocuments', docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const docData = docSnap.data();
          const rfaType = docData.rfaType;

          if (rfaType) {
            const currentQuery = new URLSearchParams(searchParams.toString());
            currentQuery.set('type', rfaType);
            currentQuery.set('docId', docId);
            router.replace(`/dashboard/rfa?${currentQuery.toString()}`);
          } else {
            setError("ไม่สามารถระบุประเภทของเอกสารได้");
          }
        } else {
          setError("ไม่พบเอกสารที่คุณต้องการ");
        }
      } catch (err) {
        console.error("Redirect Error:", err);
        setError("เกิดข้อผิดพลาดในการเปิดเอกสาร");
      }
    };

    fetchTypeAndRedirect();
    
  }, [params.id, router, searchParams, user, authLoading]); // 👈 5. เพิ่ม dependency

  // UI ส่วน loading/error ไม่ต้องแก้ไข
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
  );
}