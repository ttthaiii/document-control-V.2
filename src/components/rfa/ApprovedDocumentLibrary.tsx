// src/components/rfa/ApprovedDocumentLibrary.tsx (โค้ดฉบับสมบูรณ์)
'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/lib/auth/useAuth'
import { Site, Category, RFADocument, RFAFile } from '@/types/rfa'
import { Search, Building, Tag, FileText, Calendar, Download, Eye } from 'lucide-react'
import Spinner from '@/components/shared/Spinner'
import PDFPreviewModal from './PDFPreviewModal'

// v 1. Import สิ่งที่จำเป็นจาก Firestore SDK และ workflow config
import { db } from '@/lib/firebase/client'
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import { STATUSES, STATUS_LABELS } from '@/lib/config/workflow' // <--- เพิ่ม STATUS_LABELS ที่นี่


const formatDate = (date: any): string => {
  if (!date) return 'N/A';
  if (date.seconds) {
    return new Date(date.seconds * 1000).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Invalid Date';
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
};


const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkScreenSize = () => setIsMobile(window.innerWidth < 768);
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);
  return isMobile;
};

export default function ApprovedDocumentLibrary() {
  const { user, firebaseUser } = useAuth();
  const isMobile = useIsMobile();

  const [sites, setSites] = useState<Site[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSite, setSelectedSite] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [documents, setDocuments] = useState<RFADocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<RFAFile | null>(null);

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedSite('ALL');
    setSelectedCategory('ALL');
  };
  
  useEffect(() => {
    const fetchFilterData = async () => {
      if (!firebaseUser) return;
      try {
        const token = await firebaseUser.getIdToken();
        const [sitesResponse, categoriesResponse] = await Promise.all([
          fetch('/api/sites', { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch('/api/rfa/categories?rfaType=ALL', { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        if (!sitesResponse.ok || !categoriesResponse.ok) throw new Error('Failed to fetch filter data');
        
        const sitesData = await sitesResponse.json();
        const categoriesData = await categoriesResponse.json();

        setSites(sitesData.sites || []);
        const uniqueCategories = Array.from(new Map(categoriesData.categories.map((cat: Category) => [cat.categoryCode, cat])).values());
        setCategories(uniqueCategories as Category[]);
      } catch (err) {
        setError('ไม่สามารถโหลดข้อมูล Filter ได้');
        console.error(err);
      }
    };
    fetchFilterData();
  }, [firebaseUser]);

  useEffect(() => {
    const fetchDocuments = async () => {
      if (!user?.sites || user.sites.length === 0) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      
      try {
        let q = query(
          collection(db, 'rfaDocuments'),
          where('siteId', 'in', user.sites),
          where('isLatest', '==', true),
          where('status', 'in', [
            STATUSES.APPROVED, 
            STATUSES.APPROVED_WITH_COMMENTS, 
            STATUSES.APPROVED_REVISION_REQUIRED
          ]),
          orderBy('updatedAt', 'desc')
        );

        if (selectedSite !== 'ALL') {
          q = query(q, where('siteId', '==', selectedSite));
        }
        if (selectedCategory !== 'ALL') {
          q = query(q, where('categoryId', '==', selectedCategory));
        }
        
        const querySnapshot = await getDocs(q);
        
        const docsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RFADocument));
        setDocuments(docsData);

      } catch (err) {
        setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลเอกสารได้');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocuments();
  }, [user, selectedSite, selectedCategory]);

  const filteredDocuments = useMemo(() => {
    if (!searchTerm) return documents;
    const lowercasedFilter = searchTerm.toLowerCase();
    return documents.filter(doc =>
      doc.title.toLowerCase().includes(lowercasedFilter) ||
      (doc.documentNumber && doc.documentNumber.toLowerCase().includes(lowercasedFilter))
    );
  }, [searchTerm, documents]);

  const handleFileClick = (file: RFAFile) => {
    const isPdf = file.contentType === 'application/pdf' || file.fileName.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      setPreviewFile(file);
    } else {
      window.open(file.fileUrl, '_blank');
    }
  };

  return (
    <>
      {/* 1. ให้ Container หลักสูงเต็มพื้นที่ และเป็น Flexbox แนวตั้ง */}
      <div className="bg-white rounded-lg shadow flex flex-col h-full">
        {/* --- ส่วน Filter (ไม่ Scroll) --- */}
        <div className="p-4 border-b">
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            📚 คลังเอกสารอนุมัติ (Approved Document Library)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="relative md:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input type="text" placeholder="ค้นหา..." className="w-full pl-10 pr-4 py-2 border rounded-lg"
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <div className="relative md:col-span-1">
               <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
               <select className="w-full pl-10 pr-4 py-2 border rounded-lg appearance-none truncate"
                 value={selectedSite} onChange={(e) => setSelectedSite(e.target.value)}>
                  <option value="ALL">ทุกโครงการ</option>
                  {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
               </select>
            </div>
            <div className="relative md:col-span-1">
               <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
               <select className="w-full pl-10 pr-4 py-2 border rounded-lg appearance-none"
                  value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                  <option value="ALL">ทุกหมวดงาน</option>
                   {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.categoryCode}</option>)}
               </select>
            </div>
            <div className="md:col-span-1">
                <button 
                    onClick={resetFilters}
                    className="w-full px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                >
                    รีเซ็ต
                </button>
            </div>
          </div>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </div>

        <div className="p-4 flex-1 min-h-0 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-16"><Spinner /></div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed rounded-lg"><p className="text-gray-500">ไม่พบเอกสารที่อนุมัติแล้ว</p></div>
          ) : isMobile ? (
            <div className="space-y-3">
              {filteredDocuments.map(doc => (
                <div key={doc.id} className="bg-gray-50 border rounded-lg p-4 space-y-3">
                  <div>
                    <p className="font-semibold text-gray-800 truncate">{doc.documentNumber}</p>
                    <p className="text-sm text-gray-600 line-clamp-2 mt-1">{doc.title}</p>
                  </div>
                  {doc.files && doc.files.length > 0 && (
                     <button
                        onClick={() => handleFileClick(doc.files[0])}
                        className="w-full flex items-center justify-center text-sm bg-white border border-gray-300 rounded-md p-2 hover:bg-gray-100 transition-colors"
                      >
                       {doc.files[0].fileName.toLowerCase().endsWith('.pdf') ? <Eye className="w-4 h-4 mr-2 text-red-500"/> : <Download className="w-4 h-4 mr-2 text-blue-500"/>}
                       <span className="truncate">{doc.files[0].fileName}</span>
                     </button>
                  )}
                  <div className="flex justify-between items-center pt-2 border-t text-xs text-gray-500">
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded font-medium">{STATUS_LABELS[doc.status] || doc.status}</span>
                    <span>{formatDate(doc.updatedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">เลขที่เอกสาร</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">หัวข้อเรื่อง</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ไฟล์แนบ</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">สถานะ</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">วันที่อนุมัติ</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredDocuments.map(doc => (
                    <tr key={doc.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-800">{doc.documentNumber}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{doc.title}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {doc.files && doc.files.length > 0 ? (
                           <button
                             onClick={() => handleFileClick(doc.files[0])}
                             className="flex items-center text-blue-600 hover:text-blue-800 hover:underline"
                             title={doc.files[0].fileName}
                           >
                            <FileText className="w-4 h-4 mr-2 flex-shrink-0"/>
                            <span className="truncate max-w-[250px]">{doc.files[0].fileName}</span>
                          </button>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded font-medium">{STATUS_LABELS[doc.status] || doc.status}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(doc.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <PDFPreviewModal
        isOpen={!!previewFile}
        file={previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </>
  );
}