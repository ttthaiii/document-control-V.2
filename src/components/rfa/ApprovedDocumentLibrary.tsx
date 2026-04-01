// src/components/rfa/ApprovedDocumentLibrary.tsx
'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/lib/auth/useAuth'
import { useLogActivity } from '@/lib/hooks/useLogActivity'
import { Site, Category, RFADocument, RFAFile } from '@/types/rfa'
import {
  Search, Building, Tag, FileText, Calendar, Download, Eye,
  FileDigit, AlertTriangle, Lock, FolderOpen, ChevronDown, ChevronUp, Filter
} from 'lucide-react'
import Spinner from '@/components/shared/Spinner'
import PDFPreviewModal from './PDFPreviewModal'

import { db } from '@/lib/firebase/client'
import { collection, query, where, getDocs, orderBy, QueryConstraint } from 'firebase/firestore'
import { STATUSES, STATUS_LABELS } from '@/lib/config/workflow'


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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const resolveCategory = (doc: any): { key: string; code: string } | null => {
  const catId: string | undefined = doc.categoryId || doc.category?.id;
  if (!catId || catId === 'N/A') return null;
  const rawName: string = (doc.categoryName || doc.taskData?.taskCategory || '').trim();
  const isHumanReadable = rawName && rawName !== catId && /[a-z ]/.test(rawName);
  const displayCode = isHumanReadable
    ? rawName
    : catId.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  return { key: catId, code: displayCode };
};

// Extract numeric suffix for smart alphanumeric sort
const getNumericSuffix = (str: string): number => {
  if (!str) return 0;
  const match = str.match(/\d+$/);
  return match ? parseInt(match[0], 10) : 0;
};

export default function ApprovedDocumentLibrary() {
  const { user, firebaseUser } = useAuth();
  const { logActivity } = useLogActivity();
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

  // expandedIds ใช้ key แบบ `pdf-${doc.id}` และ `cad-${doc.id}` แยกกัน
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // ── Sorting ──────────────────────────────────────────────────────────────
  type SortKey = 'documentNumber' | 'updatedAt';
  type SortDir = 'asc' | 'desc';
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: SortDir }>({ key: 'updatedAt', dir: 'desc' });

  const requestSort = (key: SortKey) => {
    setSortConfig(prev => ({
      key,
      dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc',
    }));
  };

  const toggleExpanded = (key: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedSite('ALL');
    setSelectedCategory('ALL');
    setSelectedRfaType('ALL');
  };

  // ── Fetch Sites ───────────────────────────────────────────────────────────
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

  useEffect(() => {
    setSelectedCategory('ALL');
  }, [selectedRfaType, selectedSite]);

  // ── Fetch Documents ───────────────────────────────────────────────────────
  // FIX: selectedSite และ selectedRfaType ถูก filter ใน Firestore query
  // แต่ต้องไม่ใช้ 'in' และ '==' บน field เดียวกัน (siteId) พร้อมกัน
  useEffect(() => {
    const fetchDocuments = async () => {
      if (!user?.sites || user.sites.length === 0) {
        setIsLoading(false);
        return;
      }
      setDocuments([]);
      setIsLoading(true);
      setError(null);

      try {
        const constraints: QueryConstraint[] = [
          where('isLatestApproved', '==', true),
          where('status', 'in', [
            STATUSES.APPROVED,
            STATUSES.APPROVED_WITH_COMMENTS,
            STATUSES.APPROVED_REVISION_REQUIRED
          ]),
          orderBy('updatedAt', 'desc'),
        ];

        // FIX: ถ้าเลือก site เฉพาะ ให้ใช้ '==' แทน 'in' เพื่อหลีกเลี่ยง conflict
        if (selectedSite !== 'ALL') {
          constraints.unshift(where('siteId', '==', selectedSite));
        } else {
          constraints.unshift(where('siteId', 'in', user.sites));
        }

        if (selectedRfaType !== 'ALL') {
          constraints.push(where('rfaType', '==', selectedRfaType));
        }

        const q = query(collection(db, 'rfaDocuments'), ...constraints);
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

  // ── Derived ───────────────────────────────────────────────────────────────

  // FIX: availableCategories ใช้ categoryId (key) เป็น id
  // เพื่อให้ filter เปรียบเทียบด้วย key ไม่ใช่ displayCode
  const availableCategories = useMemo(() => {
    const map = new Map<string, Category>();
    documents.forEach(doc => {
      const resolved = resolveCategory(doc as any);
      if (resolved && !map.has(resolved.key)) {
        map.set(resolved.key, {
          id: resolved.key,
          siteId: (doc as any).siteId || '',
          categoryCode: resolved.code,
          categoryName: resolved.code,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.categoryCode.localeCompare(b.categoryCode));
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    let result = documents;

    // FIX: เปรียบเทียบด้วย key (categoryId) ไม่ใช่ displayCode
    if (selectedCategory !== 'ALL') {
      result = result.filter(doc => {
        const resolved = resolveCategory(doc as any);
        return resolved?.key === selectedCategory;
      });
    }
    if (!searchTerm) return result;
    const lowercasedFilter = searchTerm.toLowerCase();
    return result.filter(doc =>
      doc.title.toLowerCase().includes(lowercasedFilter) ||
      (doc.documentNumber && doc.documentNumber.toLowerCase().includes(lowercasedFilter))
    );
  }, [searchTerm, selectedCategory, documents]);

  // ── Smart alphanumeric sort ───────────────────────────────────────────────
  const sortedDocuments = useMemo(() => {
    const sortable = [...filteredDocuments];
    sortable.sort((a, b) => {
      let aVal: any = 0;
      let bVal: any = 0;

      if (sortConfig.key === 'documentNumber') {
        const aNum = getNumericSuffix(a.documentNumber || '');
        const bNum = getNumericSuffix(b.documentNumber || '');
        if (aNum !== 0 && bNum !== 0) {
          aVal = aNum; bVal = bNum;
        } else {
          aVal = (a.documentNumber || '').toLowerCase();
          bVal = (b.documentNumber || '').toLowerCase();
        }
      } else if (sortConfig.key === 'updatedAt') {
        aVal = (a.updatedAt as any)?.seconds || new Date(a.updatedAt as any).getTime() || 0;
        bVal = (b.updatedAt as any)?.seconds || new Date(b.updatedAt as any).getTime() || 0;
      }

      if (aVal < bVal) return sortConfig.dir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return sortable;
  }, [filteredDocuments, sortConfig]);

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    const isActive = sortConfig.key === columnKey;
    return isActive && sortConfig.dir === 'asc'
      ? <ChevronUp className="w-3.5 h-3.5 inline ml-0.5" />
      : <ChevronDown className={`w-3.5 h-3.5 inline ml-0.5 ${!isActive ? 'opacity-30' : ''}`} />;
  };

  // ── File handlers ─────────────────────────────────────────────────────────
  const handlePreviewPdf = (file: RFAFile, doc: RFADocument) => {
    const siteName = sites.find(s => s.id === (doc as any).siteId)?.name || '—';
    logActivity({
      action: 'PREVIEW_FILE',
      resourceType: 'RFA',
      resourceId: doc.id,
      resourceName: doc.documentNumber,
      siteId: (doc as any).siteId,
      siteName,
      description: `เปิดดูไฟล์ "${file.fileName}" (คลังเอกสาร)`,
    });
    setPreviewFile(file);
  };

  const handleDownloadCad = (cad: RFAFile, doc: RFADocument) => {
    const siteName = sites.find(s => s.id === (doc as any).siteId)?.name || '—';
    logActivity({
      action: 'DOWNLOAD_FILE',
      resourceType: 'RFA',
      resourceId: doc.id,
      resourceName: doc.documentNumber,
      siteId: (doc as any).siteId,
      siteName,
      description: `ดาวน์โหลดไฟล์ CAD "${cad.fileName}" (คลังเอกสาร)`,
    });
    if (cad.fileUrl) window.open(cad.fileUrl, '_blank');
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow flex flex-col h-full">

        {/* ── Filter Bar ── */}
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
                className="w-full h-10 pl-10 pr-4 border rounded-lg bg-white text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="relative md:col-span-1">
              <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <select
                className="w-full h-10 pl-10 pr-4 border rounded-lg appearance-none truncate bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                value={selectedSite}
                onChange={(e) => setSelectedSite(e.target.value)}
              >
                <option value="ALL">ทุกโครงการ</option>
                {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
            </div>
            <div className="relative md:col-span-1">
              {/* FIX: option value ใช้ cat.id (categoryId key) ไม่ใช่ cat.categoryCode */}
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <select
                className="w-full h-10 pl-10 pr-4 border rounded-lg appearance-none bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none truncate"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="ALL">ทุกหมวดงาน</option>
                {availableCategories.map((cat: Category) => (
                  <option key={cat.id} value={cat.id}>{cat.categoryCode}</option>
                ))}
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

        {/* ── Content ── */}
        <div className="p-4 flex-1 min-h-0 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-16"><Spinner /></div>
          ) : sortedDocuments.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed rounded-lg">
              <FolderOpen className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-gray-500">ไม่พบเอกสารที่อนุมัติแล้ว</p>
            </div>
          ) : isMobile ? (

            /* ── Mobile: Card Stack ── */
            <div className="space-y-3">
              {/* Mobile sort controls */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-gray-500">เรียงตาม:</span>
                <button
                  onClick={() => requestSort('documentNumber')}
                  className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1 transition-colors ${sortConfig.key === 'documentNumber' ? 'bg-gray-100 border-gray-300 text-gray-800' : 'bg-white border-gray-200 text-gray-500'}`}
                >
                  ชื่อเอกสาร <SortIcon columnKey="documentNumber" />
                </button>
                <button
                  onClick={() => requestSort('updatedAt')}
                  className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1 transition-colors ${sortConfig.key === 'updatedAt' ? 'bg-gray-100 border-gray-300 text-gray-800' : 'bg-white border-gray-200 text-gray-500'}`}
                >
                  อัปเดตล่าสุด <SortIcon columnKey="updatedAt" />
                </button>
              </div>

              {sortedDocuments.map(doc => {
                const isSuspended = doc.supersededStatus === 'SUSPENDED';
                const isRevisionInProgress = doc.supersededStatus === 'ACTIVE' || isSuspended;
                const cadFiles: any[] = (doc as any).cadFiles || [];
                const pdfFiles = (doc.files || []).filter(
                  f => f.contentType === 'application/pdf' || f.fileName.toLowerCase().endsWith('.pdf')
                );

                let revisionComment = (doc as any).supersededComment || '';
                if (!revisionComment && doc.workflow) {
                  const wfStep = [...doc.workflow].reverse().find(
                    w => w.comments && (w.status === STATUSES.APPROVED_REVISION_REQUIRED || w.status === STATUSES.REJECTED)
                  );
                  if (wfStep) revisionComment = wfStep.comments || '';
                }

                return (
                  <div key={doc.id} className={`border rounded-lg p-4 space-y-3 transition-all ${isSuspended ? 'bg-red-50 border-red-300' : 'bg-white'}`}>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-semibold text-gray-800 truncate">{doc.documentNumber}</p>
                        <span className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[11px] font-semibold">
                          Rev.{String(doc.revisionNumber || 0).padStart(2, '0')}
                          {isRevisionInProgress && (
                            <span className="ml-1 text-orange-500">⚠</span>
                          )}
                        </span>
                        {doc.rfaType && (
                          <span className="inline-flex items-center px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[11px] font-semibold">
                            {doc.rfaType.replace('RFA-', '')}
                          </span>
                        )}
                        {isSuspended && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white">
                            <Lock className="w-2.5 h-2.5 mr-0.5" />ห้ามใช้
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2 mt-1">{doc.title}</p>
                    </div>

                    {/* Revision / Suspension Banner */}
                    {isRevisionInProgress && (
                      <div className={`flex items-start gap-2 px-3 py-2 rounded-md text-xs ${isSuspended ? 'bg-red-100 border border-red-300 text-red-700' : 'bg-amber-50 border border-amber-300 text-amber-800'}`}>
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>
                          <span className="font-semibold">{isSuspended ? 'สาเหตุที่ระงับ: ' : 'กำลังแก้ไข: '}</span>
                          {revisionComment || 'อยู่ในระหว่างการแก้ไข Rev. ใหม่'}
                        </span>
                      </div>
                    )}

                    {/* File Buttons (Mobile) */}
                    {isSuspended ? (
                      <div className="flex items-center justify-center text-sm bg-red-100 border border-red-300 rounded-md p-2 text-red-700 font-medium cursor-not-allowed">
                        <Lock className="w-4 h-4 mr-2" />
                        <span>ห้ามเปิดไฟล์ — รอ Rev. ใหม่</span>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        {/* PDF Button (mobile) */}
                        <button
                          onClick={() => {
                            if (pdfFiles.length === 1) {
                              handlePreviewPdf(pdfFiles[0], doc);
                            } else if (pdfFiles.length > 1) {
                              toggleExpanded(`pdf-${doc.id}`);
                            }
                          }}
                          disabled={pdfFiles.length === 0}
                          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded text-xs font-semibold border transition-colors ${
                            pdfFiles.length === 0
                              ? 'text-gray-300 border-gray-200 cursor-not-allowed'
                              : 'text-red-600 border-red-200 bg-red-50 hover:bg-red-100'
                          }`}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          PDF ({pdfFiles.length})
                        </button>

                        {/* CAD Button (mobile) */}
                        <button
                          onClick={() => cadFiles.length > 0 && toggleExpanded(`cad-${doc.id}`)}
                          disabled={cadFiles.length === 0}
                          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded text-xs font-semibold border transition-colors ${
                            cadFiles.length === 0
                              ? 'text-gray-300 border-gray-200 cursor-not-allowed'
                              : 'text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100'
                          }`}
                        >
                          <FileDigit className="w-3.5 h-3.5" />
                          CAD ({cadFiles.length})
                        </button>
                      </div>
                    )}

                    {/* PDF dropdown (mobile) */}
                    {!isSuspended && expandedIds.has(`pdf-${doc.id}`) && pdfFiles.length > 1 && (
                      <div className="space-y-1 pl-1 border-l-2 border-red-100">
                        {pdfFiles.map((pdf, i) => (
                          <button
                            key={i}
                            onClick={() => handlePreviewPdf(pdf, doc)}
                            className="flex items-center gap-1.5 text-xs text-red-600 hover:underline py-0.5 w-full text-left"
                          >
                            <Eye className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{pdf.fileName}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* CAD dropdown (mobile) */}
                    {!isSuspended && expandedIds.has(`cad-${doc.id}`) && cadFiles.length > 0 && (
                      <div className="space-y-1 pl-1 border-l-2 border-blue-100">
                        {cadFiles.map((cad: any, i: number) => (
                          <button
                            key={i}
                            onClick={() => handleDownloadCad(cad, doc)}
                            className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline py-0.5 w-full text-left"
                          >
                            <Download className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{cad.fileName}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-2 border-t text-xs text-gray-500">
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded font-medium">
                        {STATUS_LABELS[doc.status] || doc.status}
                      </span>
                      <span>{formatDate(doc.updatedAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

          ) : (

            /* ── Desktop: Table ── */
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {/* Col 1: เลขที่เอกสาร */}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      <button
                        onClick={() => requestSort('documentNumber')}
                        className="flex items-center gap-1 hover:text-gray-700 transition-colors"
                      >
                        เลขที่เอกสาร <SortIcon columnKey="documentNumber" />
                      </button>
                    </th>
                    {/* Col 2: ชื่อเอกสาร */}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ชื่อเอกสาร
                    </th>
                    {/* Col 3: Rev. */}
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Rev.
                    </th>
                    {/* Col 4: หมวดงาน */}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      หมวดงาน
                    </th>
                    {/* Col 5: สถานะ */}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      สถานะ
                    </th>
                    {/* Col 6: หมายเหตุ */}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      หมายเหตุ
                    </th>
                    {/* Col 7: อัปเดตล่าสุด */}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      <button
                        onClick={() => requestSort('updatedAt')}
                        className="flex items-center gap-1 hover:text-gray-700 transition-colors"
                      >
                        อัปเดตล่าสุด <SortIcon columnKey="updatedAt" />
                      </button>
                    </th>
                    {/* Col 8: ไฟล์แนบ */}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      ไฟล์แนบ
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedDocuments.map(doc => {
                    const isSuspended = doc.supersededStatus === 'SUSPENDED';
                    const isRevisionInProgress = doc.supersededStatus === 'ACTIVE' || isSuspended;
                    const cadFiles: any[] = (doc as any).cadFiles || [];
                    const pdfFiles = (doc.files || []).filter(
                      f => f.contentType === 'application/pdf' || f.fileName.toLowerCase().endsWith('.pdf')
                    );

                    let revisionComment = (doc as any).supersededComment || '';
                    if (!revisionComment && doc.workflow) {
                      const wfStep = [...doc.workflow].reverse().find(
                        w => w.comments && (
                          w.status === STATUSES.APPROVED_REVISION_REQUIRED ||
                          w.status === STATUSES.REJECTED
                        )
                      );
                      if (wfStep) revisionComment = wfStep.comments || '';
                    }

                    return (
                      <tr
                        key={doc.id}
                        className={isSuspended ? 'bg-red-50' : 'bg-white hover:bg-gray-50 transition-colors'}
                      >
                        {/* Col 1: เลขที่เอกสาร */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="text-sm font-semibold text-gray-900 block">
                            {doc.documentNumber}
                          </span>
                          {isSuspended && (
                            <span className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white">
                              <Lock className="w-2.5 h-2.5 mr-0.5" />ห้ามใช้
                            </span>
                          )}
                        </td>

                        {/* Col 2: ชื่อเอกสาร */}
                        <td className="px-4 py-4 max-w-[260px]">
                          <p className="text-sm text-gray-700 line-clamp-2">{doc.title}</p>
                        </td>

                        {/* Col 3: Rev. */}
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-semibold">
                            {String(doc.revisionNumber || 0).padStart(2, '0')}
                            {isRevisionInProgress && (
                              <span className="text-orange-500">⚠</span>
                            )}
                          </span>
                        </td>

                        {/* Col 4: หมวดงาน */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-700">
                            {resolveCategory(doc as any)?.code || '—'}
                          </span>
                        </td>

                        {/* Col 5: สถานะ */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                            {STATUS_LABELS[doc.status] || doc.status}
                          </span>
                        </td>

                        {/* Col 6: หมายเหตุ */}
                        <td className="px-4 py-4 max-w-[200px]">
                          {isSuspended ? (
                            // กรณีระงับ
                            <span className="flex items-start gap-1 text-xs text-red-600 font-medium">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              ห้ามใช้ไฟล์ฉบับนี้
                            </span>
                          ) : isRevisionInProgress && revisionComment ? (
                            // กำลังแก้ไข + มี comment → แสดง comment พร้อม tooltip เพื่อให้ดูเต็มเมื่อ hover
                            <span
                              className="flex items-start gap-1 text-xs text-amber-700 cursor-help"
                              title={revisionComment}
                            >
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span className="line-clamp-2">{revisionComment}</span>
                            </span>
                          ) : isRevisionInProgress ? (
                            // กำลังแก้ไข + ไม่มี comment → แสดงข้อความ default
                            <span className="flex items-start gap-1 text-xs text-amber-600">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>อยู่ระหว่างการสร้าง Rev. ใหม่</span>
                            </span>
                          ) : (
                            // ปกติ ไม่มีหมายเหตุ
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </td>

                        {/* Col 7: อัปเดตล่าสุด */}
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(doc.updatedAt)}
                        </td>

                        {/* Col 8: ไฟล์แนบ */}
                        <td className="px-4 py-4">
                          {isSuspended ? (
                            <div className="flex items-center gap-1.5 text-xs text-red-500 font-medium">
                              <Lock className="w-3.5 h-3.5" />
                              <span>ไฟล์ถูกระงับ</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              {/* PDF Button */}
                              <button
                                onClick={() => {
                                  if (pdfFiles.length === 1) {
                                    handlePreviewPdf(pdfFiles[0], doc);
                                  } else if (pdfFiles.length > 1) {
                                    toggleExpanded(`pdf-${doc.id}`);
                                  }
                                }}
                                disabled={pdfFiles.length === 0}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border transition-colors ${
                                  pdfFiles.length === 0
                                    ? 'text-gray-300 border-gray-200 cursor-not-allowed'
                                    : 'text-red-600 border-red-200 bg-red-50 hover:bg-red-100'
                                }`}
                              >
                                <FileText className="w-3.5 h-3.5" />
                                PDF ({pdfFiles.length})
                              </button>

                              {/* CAD Button */}
                              <button
                                onClick={() => cadFiles.length > 0 && toggleExpanded(`cad-${doc.id}`)}
                                disabled={cadFiles.length === 0}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border transition-colors ${
                                  cadFiles.length === 0
                                    ? 'text-gray-300 border-gray-200 cursor-not-allowed'
                                    : 'text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100'
                                }`}
                              >
                                <FileDigit className="w-3.5 h-3.5" />
                                CAD ({cadFiles.length})
                              </button>
                            </div>
                          )}

                          {/* PDF dropdown (ถ้า > 1 ไฟล์) */}
                          {!isSuspended && expandedIds.has(`pdf-${doc.id}`) && pdfFiles.length > 1 && (
                            <div className="mt-2 space-y-1 pl-1 border-l-2 border-red-100">
                              {pdfFiles.map((pdf, i) => (
                                <button
                                  key={i}
                                  onClick={() => handlePreviewPdf(pdf, doc)}
                                  className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 hover:underline py-0.5 w-full text-left"
                                >
                                  <Eye className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate max-w-[200px]">{pdf.fileName}</span>
                                </button>
                              ))}
                            </div>
                          )}

                          {/* CAD dropdown */}
                          {!isSuspended && expandedIds.has(`cad-${doc.id}`) && cadFiles.length > 0 && (
                            <div className="mt-2 space-y-1 pl-1 border-l-2 border-blue-100">
                              {cadFiles.map((cad: any, i: number) => (
                                <button
                                  key={i}
                                  onClick={() => handleDownloadCad(cad, doc)}
                                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline py-0.5 w-full text-left"
                                >
                                  <Download className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate max-w-[200px]">{cad.fileName}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Table footer */}
              <div className="px-6 py-2.5 bg-gray-50 border-t border-gray-200">
                <p className="text-[11px] text-gray-400">
                  แสดง <span className="font-semibold text-gray-600">{sortedDocuments.length}</span> จาก <span className="font-semibold text-gray-600">{documents.length}</span> รายการ
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <PDFPreviewModal
        isOpen={!!previewFile}
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        allowEdit={false}
        onDownload={() => {
          if (!previewFile) return;
          const parentDoc = documents.find(d => d.files?.some(f => f.fileUrl === previewFile.fileUrl));
          if (parentDoc) {
            const siteName = sites.find(s => s.id === (parentDoc as any).siteId)?.name || '—';
            logActivity({
              action: 'DOWNLOAD_FILE',
              resourceType: 'RFA',
              resourceId: parentDoc.id,
              resourceName: parentDoc.documentNumber,
              siteId: (parentDoc as any).siteId,
              siteName,
              description: `ดาวน์โหลดไฟล์ "${previewFile.fileName}" (คลังเอกสาร)`,
            });
          }
        }}
      />
    </>
  );
}