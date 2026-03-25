// src/components/rfa/ApprovedDocumentLibrary.tsx (โค้ดฉบับสมบูรณ์)
'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/lib/auth/useAuth'
import { Site, Category, RFADocument, RFAFile } from '@/types/rfa'
import { Search, Building, Tag, FileText, Calendar, Download, Eye, FileDigit, AlertTriangle, Lock, FolderOpen, ChevronDown, ChevronUp } from 'lucide-react'
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

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSite, setSelectedSite] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedRfaType, setSelectedRfaType] = useState('ALL');
  const [documents, setDocuments] = useState<RFADocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<RFAFile | null>(null);
  const [expandedCadIds, setExpandedCadIds] = useState<Set<string>>(new Set());

  const toggleCad = (docId: string) => {
    setExpandedCadIds(prev => {
      const next = new Set(prev);
      next.has(docId) ? next.delete(docId) : next.add(docId);
      return next;
    });
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedSite('ALL');
    setSelectedCategory('ALL');
    setSelectedRfaType('ALL');
  };

  useEffect(() => {
    const fetchSites = async () => {
      if (!firebaseUser) return;
      try {
        const token = await firebaseUser.getIdToken();
        const sitesResponse = await fetch('/api/sites', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!sitesResponse.ok) throw new Error('Failed to fetch sites');
        const sitesData = await sitesResponse.json();
        setSites(sitesData.sites || []);
      } catch (err) {
        setError('ไม่สามารถโหลดข้อมูล Filter ได้');
        console.error(err);
      }
    };
    fetchSites();
  }, [firebaseUser]);

  // Reset category เมื่อเปลี่ยน RFA Type หรือโครงการ
  useEffect(() => {
    setSelectedCategory('ALL');
  }, [selectedRfaType, selectedSite]);

  useEffect(() => {
    const fetchDocuments = async () => {
      if (!user?.sites || user.sites.length === 0) {
        setIsLoading(false);
        return;
      }
      setDocuments([]); // เคลียร์ทันที เพื่อให้ availableCategories reset ก่อน fetch ใหม่
      setIsLoading(true);
      setError(null);

      try {
        let q = query(
          collection(db, 'rfaDocuments'),
          where('siteId', 'in', user.sites),
          where('isLatestApproved', '==', true),
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
        if (selectedRfaType !== 'ALL') {
          q = query(q, where('rfaType', '==', selectedRfaType));
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
  }, [user, selectedSite, selectedRfaType]);

  // Helper: แปลง raw Firestore fields เป็น { key (categoryId), display code } แบบ consistent
  // ใช้ categoryId เป็น stable key เสมอ — ป้องกัน duplicate จากชื่อที่ format ต่างกัน
  const resolveCategory = (doc: any): { key: string; code: string } | null => {
    const catId: string | undefined = doc.categoryId || doc.category?.id;
    if (!catId || catId === 'N/A') return null;

    // Display: ถ้า categoryName เป็น human-readable (มี space หรือ lowercase) → ใช้เลย
    // ถ้าไม่ใช่ (ALL_CAPS หรือ SNAKE_CASE) → แปลงจาก categoryId
    const rawName: string = (doc.categoryName || doc.taskData?.taskCategory || '').trim();
    const isHumanReadable = rawName && rawName !== catId && /[a-z ]/.test(rawName);
    const displayCode = isHumanReadable
      ? rawName
      : catId.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

    return { key: catId, code: displayCode };
  };

  const availableCategories = useMemo(() => {
    const map = new Map<string, Category>(); // keyed by categoryId (stable)
    documents.forEach(doc => {
      const resolved = resolveCategory(doc as any);
      if (resolved && !map.has(resolved.key)) {
        map.set(resolved.key, {
          id: resolved.key,
          siteId: (doc as any).siteId || '',
          categoryCode: resolved.code,  // display label
          categoryName: resolved.code,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.categoryCode.localeCompare(b.categoryCode));
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    let result = documents;
    if (selectedCategory !== 'ALL') {
      result = result.filter(doc => {
        const resolved = resolveCategory(doc as any);
        return resolved?.code === selectedCategory;
      });
    }
    if (!searchTerm) return result;
    const lowercasedFilter = searchTerm.toLowerCase();
    return result.filter(doc =>
      doc.title.toLowerCase().includes(lowercasedFilter) ||
      (doc.documentNumber && doc.documentNumber.toLowerCase().includes(lowercasedFilter))
    );
  }, [searchTerm, selectedCategory, documents]);

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
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div className="relative md:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="ค้นหา..."
                // 🟢 แก้ไข: เติม bg-white text-gray-900
                className="w-full h-10 pl-10 pr-4 border rounded-lg bg-white text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="relative md:col-span-1">
              <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <select
                // 🟢 แก้ไข: เติม bg-white text-gray-900
                className="w-full h-10 pl-10 pr-4 border rounded-lg appearance-none truncate bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                value={selectedSite}
                onChange={(e) => setSelectedSite(e.target.value)}
              >
                <option value="ALL">ทุกโครงการ</option>
                {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
            </div>
            <div className="relative md:col-span-1">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <select
                // 🟢 แก้ไข: เติม bg-white text-gray-900
                className="w-full h-10 pl-10 pr-4 border rounded-lg appearance-none bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none truncate"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="ALL">ทุกหมวดงาน</option>
                {availableCategories.map((cat: Category) => <option key={cat.id} value={cat.categoryCode}>{cat.categoryCode}</option>)}
              </select>
            </div>
            <div className="relative md:col-span-1">
              <FileDigit className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <select
                className="w-full h-10 pl-10 pr-4 border rounded-lg appearance-none bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none truncate"
                value={selectedRfaType}
                onChange={(e) => setSelectedRfaType(e.target.value)}
              >
                <option value="ALL">ทุกประเภท</option>
                <option value="RFA-SHOP">Shop Drawing</option>
                <option value="RFA-MAT">Material</option>
                <option value="RFA-GEN">General</option>
              </select>
            </div>
            <div className="md:col-span-1">
              <button
                onClick={resetFilters}
                className="w-full h-10 px-4 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium"
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
              {filteredDocuments.map(doc => {
                const isSuspended = doc.supersededStatus === 'SUSPENDED';
                const isRevisionInProgress = doc.supersededStatus === 'ACTIVE' || isSuspended;

                // 🟢 ค้นหาไฟล์หลักที่จะแสดง (เอา PDF ล่าสุด หรือไฟล์ล่าสุด) 
                const mainFile = doc.files && doc.files.length > 0
                  ? [...doc.files].reverse().find(f => f.contentType === 'application/pdf' || f.fileName.toLowerCase().endsWith('.pdf')) || doc.files[doc.files.length - 1]
                  : null;
                
                let revisionComment = (doc as any).supersededComment;
                if (!revisionComment && doc.workflow) {
                  const wfStep = [...doc.workflow].reverse().find(w => w.comments && (w.status === STATUSES.APPROVED_REVISION_REQUIRED || w.status === STATUSES.REJECTED));
                  if (wfStep) revisionComment = wfStep.comments;
                }
                revisionComment = revisionComment || '';
                return (
                <div key={doc.id} className={`border rounded-lg p-4 space-y-3 transition-all ${
                  isSuspended ? 'bg-red-50 border-red-300'
                  : 'bg-white'
                }`}>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-semibold text-gray-800 truncate">{doc.documentNumber}</p>
                      <span className="inline-flex items-center px-1.5 py-0.5 bg-gray-200 text-gray-800 rounded-md text-[10px] font-bold">
                        REV-{String(doc.revisionNumber || 0).padStart(2, '0')}
                        {isRevisionInProgress && (
                          <span className="ml-1 text-[10px] text-orange-600 font-bold" title="ต้องการ Rev. ใหม่">⚠️</span>
                        )}
                      </span>
                      {isSuspended && (
                        <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white">
                          <Lock className="w-2.5 h-2.5 mr-0.5" />ห้ามใช้
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2 mt-1">{doc.title}</p>
                  </div>
                  {/* Revision / Suspension Remark Banner */}
                  {isSuspended && revisionComment && (
                    <div className="flex items-start gap-2 px-3 py-2 bg-red-100 border border-red-300 rounded-md text-xs text-red-700">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span><span className="font-semibold">สาเหตุที่ระงับ: </span>{revisionComment}</span>
                    </div>
                  )}
                  {!isSuspended && isRevisionInProgress && revisionComment && (
                    <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-300 rounded-md text-xs text-amber-800">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span><span className="font-semibold">กำลังแก้ไข: </span>{revisionComment}</span>
                    </div>
                  )}
                  {!isSuspended && isRevisionInProgress && !revisionComment && (
                    <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-300 rounded-md text-xs text-amber-800">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>เอกสารฉบับนี้กำลังอยู่ในระหว่างการแก้ไข Rev. ใหม่</span>
                    </div>
                  )}
                  {mainFile && (
                    isSuspended ? (
                      <div className="w-full flex items-center justify-center text-sm bg-red-100 border border-red-300 rounded-md p-2 text-red-700 font-medium cursor-not-allowed">
                        <Lock className="w-4 h-4 mr-2" />
                        <span className="truncate">ห้ามเปิดไฟล์ — รอ Rev. ใหม่</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleFileClick(mainFile)}
                        className="w-full flex items-center justify-center text-sm bg-white border border-gray-300 rounded-md p-2 hover:bg-gray-100 transition-colors text-gray-700 font-medium"
                      >
                        {mainFile.fileName.toLowerCase().endsWith('.pdf') ? <Eye className="w-4 h-4 mr-2 text-red-500" /> : <Download className="w-4 h-4 mr-2 text-blue-500" />}
                        <span className="truncate">{mainFile.fileName}</span>
                      </button>
                    )
                  )}
                  {/* CAD Files Section (Mobile) — Progressive Disclosure */}
                  {!isSuspended && (doc as any).cadFiles && (doc as any).cadFiles.length > 0 && (
                    <div>
                      <button
                        onClick={() => toggleCad(doc.id)}
                        className="w-full flex items-center justify-between text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-1.5 hover:bg-blue-100 transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <FolderOpen className="w-3.5 h-3.5" />
                          ไฟล์ CAD ({(doc as any).cadFiles.length} ไฟล์)
                        </span>
                        {expandedCadIds.has(doc.id) ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      {expandedCadIds.has(doc.id) && (
                        <div className="mt-1 space-y-1 pl-1">
                          {(doc as any).cadFiles.map((cad: any, i: number) => (
                            <a
                              key={i}
                              href={cad.fileUrl}
                              download={cad.fileName}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline py-0.5"
                            >
                              <Download className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="truncate">{cad.fileName}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-2 border-t text-xs text-gray-500">
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded font-medium">{STATUS_LABELS[doc.status] || doc.status}</span>
                    <span>{formatDate(doc.updatedAt)}</span>
                  </div>
                </div>
              )})}
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
                  {filteredDocuments.map(doc => {
                    const isSuspended = doc.supersededStatus === 'SUSPENDED';
                    const isRevisionInProgress = doc.supersededStatus === 'ACTIVE' || isSuspended;

                    // 🟢 ค้นหาไฟล์หลักที่จะแสดง (เอา PDF ล่าสุด หรือไฟล์ล่าสุด) 
                    const mainFile = doc.files && doc.files.length > 0
                      ? [...doc.files].reverse().find(f => f.contentType === 'application/pdf' || f.fileName.toLowerCase().endsWith('.pdf')) || doc.files[doc.files.length - 1]
                      : null;

                    let revisionComment = (doc as any).supersededComment;
                    if (!revisionComment && doc.workflow) {
                      const wfStep = [...doc.workflow].reverse().find(w => w.comments && (w.status === STATUSES.APPROVED_REVISION_REQUIRED || w.status === STATUSES.REJECTED));
                      if (wfStep) revisionComment = wfStep.comments;
                    }
                    revisionComment = revisionComment || '';
                    return (
                    <tr key={doc.id} className={
                      isSuspended ? 'bg-red-50'
                      : 'bg-white'
                    }>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-800">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {doc.documentNumber}
                          <span className="inline-flex items-center px-1.5 py-0.5 bg-gray-200 text-gray-800 rounded-md text-[10px] font-bold">
                            REV-{String(doc.revisionNumber || 0).padStart(2, '0')}
                            {isRevisionInProgress && (
                              <span className="ml-1 text-[10px] text-orange-600 font-bold" title="ต้องการ Rev. ใหม่">⚠️</span>
                            )}
                          </span>
                          {isSuspended && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white flex-shrink-0">
                              <Lock className="w-2.5 h-2.5 mr-0.5" />ห้ามใช้
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <p className="line-clamp-2">{doc.title}</p>
                        {/* Revision / Suspension Remark */}
                        {isSuspended && revisionComment && (
                          <div className="flex items-start gap-1.5 mt-1.5 text-xs text-red-700">
                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                            <span><span className="font-semibold">สาเหตุที่ระงับ: </span>{revisionComment}</span>
                          </div>
                        )}
                        {!isSuspended && isRevisionInProgress && (
                          <div className="flex items-start gap-1.5 mt-1.5 text-xs text-amber-700">
                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                            <span>
                              <span className="font-semibold">กำลังแก้ไข: </span>
                              {revisionComment || 'อยู่ในระหว่างการแก้ไข Rev. ใหม่'}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {mainFile ? (
                          isSuspended ? (
                            <div className="flex items-center text-red-600 font-medium cursor-not-allowed" title="ไฟล์ถูกระงับ">
                              <Lock className="w-4 h-4 mr-2 flex-shrink-0" />
                              <span className="truncate max-w-[200px] line-through text-red-400">{mainFile.fileName}</span>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <button
                                onClick={() => handleFileClick(mainFile)}
                                className="flex items-center text-blue-600 hover:text-blue-800 hover:underline"
                                title={mainFile.fileName}
                              >
                                <FileText className="w-4 h-4 mr-2 flex-shrink-0" />
                                <span className="truncate max-w-[250px]">{mainFile.fileName}</span>
                              </button>
                              {/* CAD Files (Desktop) — Progressive Disclosure */}
                              {(doc as any).cadFiles && (doc as any).cadFiles.length > 0 && (
                                <div className="mt-1.5">
                                  <button
                                    onClick={() => toggleCad(doc.id)}
                                    className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-0.5 hover:bg-blue-100 transition-colors"
                                  >
                                    <FolderOpen className="w-3 h-3" />
                                    ไฟล์ CAD ({(doc as any).cadFiles.length})
                                    {expandedCadIds.has(doc.id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                  </button>
                                  {expandedCadIds.has(doc.id) && (
                                    <div className="mt-1 space-y-0.5 pl-1">
                                      {(doc as any).cadFiles.map((cad: any, i: number) => (
                                        <a
                                          key={i}
                                          href={cad.fileUrl}
                                          download={cad.fileName}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline py-0.5"
                                          title={cad.fileName}
                                        >
                                          <Download className="w-3 h-3 flex-shrink-0" />
                                          <span className="truncate max-w-[200px]">{cad.fileName}</span>
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded font-medium inline-block w-fit">{STATUS_LABELS[doc.status] || doc.status}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(doc.updatedAt)}</td>
                    </tr>
                  )})}

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
        allowEdit={false}
      />
    </>
  );
}