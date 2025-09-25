// src/components/rfa/ApprovedDocumentLibrary.tsx (Fully Implemented with Preview)

'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/lib/auth/useAuth'
import { Site, Category, RFADocument, RFAFile } from '@/types/rfa' // Import RFAFile
import { Search, Building, Tag, Loader2, FileText, Calendar } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { STATUS_LABELS } from '@/lib/config/workflow'
import PDFPreviewModal from './PDFPreviewModal'

// Helper function to format date
const formatDate = (date: any): string => {
  if (!date) return 'N/A';
  // Handle Firebase Timestamp object serialized by Next.js API
  if (date._seconds) {
    return new Date(date._seconds * 1000).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  // Handle Firestore Timestamp object on the client
  if (typeof date.toDate === 'function') {
    return date.toDate().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  // Handle ISO strings or other date strings
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return 'Invalid Date';
  }
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
};

// Helper hook for responsive design
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // ฟังก์ชันนี้จะทำงานในฝั่ง Client เท่านั้น
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    // เรียกใช้ครั้งแรกเพื่อให้ State ถูกตั้งค่า
    checkScreenSize();
    
    // เพิ่ม Event Listener เพื่อตรวจจับการเปลี่ยนแปลงขนาดหน้าจอ
    window.addEventListener('resize', checkScreenSize);

    // Cleanup function: ลบ Event Listener ออกเมื่อ Component ถูก unmount
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []); // dependency array ว่างเปล่า ทำให้ useEffect นี้ทำงานแค่ครั้งเดียวหลัง mount

  return isMobile;
};


// Main Component
export default function ApprovedDocumentLibrary() {
  const { user, firebaseUser } = useAuth();
  const isMobile = useIsMobile();
  const router = useRouter();

  // ✅ 1. เพิ่ม State เพื่อตรวจสอบว่า Component ถูก Mount ในฝั่ง Client แล้วหรือยัง
  const [hasMounted, setHasMounted] = useState(false);

  // States for filters, data, etc. (No changes)
  const [sites, setSites] = useState<Site[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSite, setSelectedSite] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [documents, setDocuments] = useState<RFADocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<RFAFile | null>(null);
  const [isFetchingPreview, setIsFetchingPreview] = useState(false);
 
  // ✅ 2. ใช้ useEffect เพื่อตั้งค่า hasMounted เป็น true
  // useEffect นี้จะทำงาน *หลังจาก* การ render ครั้งแรกในฝั่ง Client เท่านั้น
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Fetch filter data (No changes)
  useEffect(() => {
    const fetchFilterData = async () => { /* ... */ };
    if (firebaseUser) fetchFilterData();
  }, [firebaseUser]);

  // Fetch documents list (No changes)
  useEffect(() => {
    const fetchDocuments = async () => { /* ... */ };
    if (firebaseUser) fetchDocuments();
  }, [firebaseUser, user, selectedSite, selectedCategory]);

  // Client-side search logic (No changes)
  const filteredDocuments = useMemo(() => {
     if (!searchTerm) return documents;
    const lowercasedFilter = searchTerm.toLowerCase();
    return documents.filter(doc =>
      doc.title.toLowerCase().includes(lowercasedFilter) ||
      doc.documentNumber.toLowerCase().includes(lowercasedFilter)
    );
  }, [searchTerm, documents]);

  const handleRowClick = async (docId: string) => {
    if (!firebaseUser) return;
    setIsFetchingPreview(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/rfa/${docId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await res.json();

      if (result.success && result.document.files && result.document.files.length > 0) {
        const fileToPreview = result.document.files[0]; // เอาไฟล์แรกของฉบับล่าสุด
        const isPdf = fileToPreview.contentType === 'application/pdf' || fileToPreview.fileName.toLowerCase().endsWith('.pdf');

        if (isPdf) {
          setPreviewFile(fileToPreview);
        } else {
          // ถ้าไม่ใช่ PDF ให้ดาวน์โหลดเลย
          window.open(fileToPreview.fileUrl, '_blank');
        }
      } else {
        alert('ไม่พบไฟล์แนบสำหรับเอกสารนี้');
      }
    } catch (e) {
      alert('เกิดข้อผิดพลาดในการดึงข้อมูลไฟล์');
      console.error(e);
    } finally {
      setIsFetchingPreview(false);
    }
  };

  // UI Rendering
  return (
    <>
    <div className="bg-white rounded-lg shadow">
      {/* Header and Filters */}
      <div className="p-4 border-b">
        <h2 className="text-xl font-bold text-gray-800 mb-4">
          📚 คลังเอกสารอนุมัติ (Approved Document Library)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input type="text" placeholder="ค้นหา..." className="w-full pl-10 pr-4 py-2 border rounded-lg"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="relative">
             <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
             <select className="w-full pl-10 pr-4 py-2 border rounded-lg appearance-none"
               value={selectedSite} onChange={(e) => setSelectedSite(e.target.value)}>
                <option value="ALL">ทุกโครงการ</option>
                {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
             </select>
          </div>
          <div className="relative">
             <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
             <select className="w-full pl-10 pr-4 py-2 border rounded-lg appearance-none"
                value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                <option value="ALL">ทุกหมวดงาน</option>
                 {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.categoryCode}</option>)}
             </select>
          </div>
        </div>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      </div>

      {/* Document List Area */}
        <div className="p-4">
          {isLoading ? (
            <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto"/></div>
          ) : (
            // ✅ 3. เพิ่มเงื่อนไข !hasMounted
            // ในการ render ครั้งแรกบน Client, ส่วนนี้จะแสดง Loading
            // ซึ่งจะตรงกับที่ Server render (ที่ไม่สามารถแสดง Table หรือ Card ได้)
            // ทำให้ Hydration Error หายไป
            !hasMounted ? (
              <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto"/></div>
            ) : filteredDocuments.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed rounded-lg"><p className="text-gray-500">ไม่พบเอกสารที่อนุมัติแล้ว</p></div>
            ) : isMobile ? (
              // Mobile View: Cards
              <div className="space-y-3">
                {filteredDocuments.map(doc => (
                  <div key={doc.id} className="bg-gray-50 border rounded-lg p-4 cursor-pointer"
                       onClick={() => handleRowClick(doc.id)}>
                    <p className="font-semibold text-blue-700 truncate">{doc.documentNumber}</p>
                    <p className="text-sm text-gray-800 line-clamp-2 mt-1 h-10">{doc.title}</p>
                    <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded">{STATUS_LABELS[doc.status] || doc.status}</span>
                      <span>{formatDate(doc.updatedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Desktop View: Table
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">เลขที่เอกสาร</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">หัวข้อเรื่อง</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">สถานะ</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">วันที่อนุมัติ</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredDocuments.map(doc => (
                      <tr key={doc.id} className="hover:bg-gray-50 cursor-pointer" 
                          onClick={() => handleRowClick(doc.id)}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-700">{doc.documentNumber}</td>
                        <td className="px-6 py-4 text-sm text-gray-800">{doc.title}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded">{STATUS_LABELS[doc.status] || doc.status}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(doc.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>

      <PDFPreviewModal
        isOpen={!!previewFile}
        file={previewFile}
        onClose={() => setPreviewFile(null)}
      />
      {isFetchingPreview && (
         <div className="fixed inset-0 bg-black bg-opacity-50 z-[70] flex items-center justify-center">
            <Loader2 className="w-12 h-12 text-white animate-spin" />
        </div>
      )}
    </>
  );
}