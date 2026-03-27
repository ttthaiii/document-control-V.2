// src/components/rfa/ApprovedDocumentLibrary.tsx
'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/lib/auth/useAuth'
import { Site, Category, RFADocument, RFAFile } from '@/types/rfa'
import {
  Search, Building, Calendar, Download, Eye, ChevronDown,
  FileText, FileDigit, Filter, AlertTriangle, CheckCircle2,
  FolderOpen, DownloadCloud, Lock, ChevronRight,
} from 'lucide-react'
import Spinner from '@/components/shared/Spinner'
import PDFPreviewModal from './PDFPreviewModal'
import { db } from '@/lib/firebase/client'
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import { STATUSES, STATUS_LABELS } from '@/lib/config/workflow'

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatDate = (date: any): string => {
  if (!date) return '—';
  if (date.seconds) return new Date(date.seconds * 1000).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
  const d = new Date(date);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
};

const getPdfFiles = (doc: RFADocument): RFAFile[] =>
  (doc.files || []).filter(f => f.contentType === 'application/pdf' || f.fileName.toLowerCase().endsWith('.pdf'));

const resolveCategory = (doc: any): string => {
  const catId: string | undefined = doc.categoryId || doc.category?.id;
  if (!catId || catId === 'N/A') return '—';
  const rawName: string = (doc.categoryName || doc.taskData?.taskCategory || '').trim();
  if (rawName && rawName !== catId && /[a-z ]/.test(rawName)) return rawName;
  return catId.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

const resolveCategoryKey = (doc: any): string =>
  doc.categoryId || doc.category?.id || '';

// ─── Component ──────────────────────────────────────────────────────────────

export default function ApprovedDocumentLibrary() {
  const { user, firebaseUser } = useAuth();

  const [sites, setSites] = useState<Site[]>([]);
  const [documents, setDocuments] = useState<RFADocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedSite, setSelectedSite] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedRfaType, setSelectedRfaType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [previewFile, setPreviewFile] = useState<RFAFile | null>(null);
  // openDrawers: Set of 'docId-pdf' | 'docId-cad'
  const [openDrawers, setOpenDrawers] = useState<Set<string>>(new Set());

  // Sorting state
  type SortKey = 'documentNumber' | 'updatedAt';
  type SortDir = 'asc' | 'desc';
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: SortDir }>({ key: 'updatedAt', dir: 'desc' });

  // ── Fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    const run = async () => {
      if (!firebaseUser) return;
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch('/api/sites', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setSites((await res.json()).sites || []);
      } catch {}
    };
    run();
  }, [firebaseUser]);

  useEffect(() => {
    const run = async () => {
      if (!user?.sites?.length) { setIsLoading(false); return; }
      setIsLoading(true); setError(null);
      try {
        const snap = await getDocs(query(
          collection(db, 'rfaDocuments'),
          where('siteId', 'in', user.sites),
          where('isLatestApproved', '==', true),
          where('status', 'in', [STATUSES.APPROVED, STATUSES.APPROVED_WITH_COMMENTS, STATUSES.APPROVED_REVISION_REQUIRED]),
          orderBy('updatedAt', 'desc')
        ));
        setDocuments(snap.docs.map(d => ({ id: d.id, ...d.data() } as RFADocument)));
      } catch (e: any) { setError(e.message || 'โหลดข้อมูลไม่สำเร็จ'); }
      finally { setIsLoading(false); }
    };
    run();
  }, [user]);

  useEffect(() => { setSelectedCategory('ALL'); }, [selectedSite, selectedRfaType]);

  // ── Derived ───────────────────────────────────────────────────────
  const availableCategoryKeys = useMemo(() => {
    const map = new Map<string, string>();
    documents.forEach(doc => {
      const key = resolveCategoryKey(doc as any);
      if (key && key !== 'N/A' && !map.has(key)) map.set(key, resolveCategory(doc as any));
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [documents]);

  const filteredDocs = useMemo(() => documents.filter(doc => {
    const a = doc as any;
    if (selectedSite !== 'ALL' && a.siteId !== selectedSite) return false;
    if (selectedRfaType !== 'ALL' && doc.rfaType !== selectedRfaType) return false;
    if (selectedCategory !== 'ALL' && resolveCategoryKey(a) !== selectedCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!doc.documentNumber?.toLowerCase().includes(q) && !doc.title?.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [documents, selectedSite, selectedRfaType, selectedCategory, searchQuery]);

  // Helper: extract numeric suffix from a string (e.g., "AR-005" -> 5)
  const getNumericSuffix = (str: string): number => {
    if (!str) return 0;
    const match = str.match(/\d+$/);
    return match ? parseInt(match[0], 10) : 0;
  };

  const sortedDocs = useMemo(() => {
    const sortable = [...filteredDocs];
    sortable.sort((a, b) => {
      let aVal: any = 0;
      let bVal: any = 0;

      if (sortConfig.key === 'documentNumber') {
        const aNum = getNumericSuffix(a.documentNumber || '');
        const bNum = getNumericSuffix(b.documentNumber || '');
        // If both have trailing numbers, sort numerically. Otherwise fallback to string localeCompare.
        if (aNum !== 0 && bNum !== 0) {
          aVal = aNum;
          bVal = bNum;
        } else {
          aVal = (a.documentNumber || '').toLowerCase();
          bVal = (b.documentNumber || '').toLowerCase();
        }
      } else if (sortConfig.key === 'updatedAt') {
        aVal = a.updatedAt?.seconds || new Date(a.updatedAt).getTime() || 0;
        bVal = b.updatedAt?.seconds || new Date(b.updatedAt).getTime() || 0;
      }

      if (aVal < bVal) return sortConfig.dir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return sortable;
  }, [filteredDocs, sortConfig]);

  // ── Handlers ──────────────────────────────────────────────────────
  const requestSort = (key: SortKey) => {
    setSortConfig(prev => ({
      key,
      dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc'
    }));
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortConfig.key !== columnKey) return null;
    return (
      <ChevronDown
        className={`w-3 h-3 transition-transform ${sortConfig.dir === 'asc' ? 'rotate-180' : ''}`}
      />
    );
  };

  const toggleDrawer = (docId: string, type: 'pdf' | 'cad') => {
    const key = `${docId}-${type}`;
    setOpenDrawers(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  // ── Status helpers ────────────────────────────────────────────────
  const statusConfig = (status: string, isSuspended: boolean) => {
    if (isSuspended) return { dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', label: 'ระงับชั่วคราว', icon: <Lock className="w-3 h-3" /> };
    if (status === STATUSES.APPROVED) return { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', label: STATUS_LABELS[status] || status, icon: <CheckCircle2 className="w-3 h-3" /> };
    return { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', label: STATUS_LABELS[status] || status, icon: <AlertTriangle className="w-3 h-3" /> };
  };

  // ── Loading / Error ───────────────────────────────────────────────
  if (isLoading) return <div className="flex items-center justify-center py-32"><Spinner /></div>;
  if (error) return (
    <div className="max-w-lg mx-auto mt-12 p-6 bg-red-50 rounded-2xl border border-red-100 text-center">
      <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-400" />
      <p className="text-sm font-semibold text-red-700">{error}</p>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="bg-slate-50 min-h-screen font-sans antialiased">

      {/* ── Sticky Toolbar ── */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3">

          {/* Title (desktop) */}
          <div className="hidden lg:flex items-center gap-2.5 mr-4 flex-shrink-0">
            <FolderOpen className="w-5 h-5 text-blue-600" />
            <span className="text-base font-bold text-gray-800 tracking-tight">คลังเอกสารอนุมัติ</span>
            <span className="text-sm text-slate-400 font-medium">({filteredDocs.length} รายการ)</span>
          </div>

          {/* Divider */}
          <div className="hidden lg:block w-px h-6 bg-slate-200 flex-shrink-0" />

          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="ค้นหาเลขเอกสาร หรือชื่องาน..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-300 rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none transition-all placeholder:text-slate-400 text-gray-800"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            {/* Site */}
            <div className="relative">
              <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select value={selectedSite} onChange={e => setSelectedSite(e.target.value)}
                className="pl-9 pr-8 py-2.5 text-sm font-medium bg-white border border-slate-300 text-slate-700 rounded-lg appearance-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none cursor-pointer hover:border-slate-400 transition-colors">
                <option value="ALL">ทุกโครงการ</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>

            {/* RFA Type — ก่อนหมวดงาน */}
            <div className="relative">
              <select value={selectedRfaType} onChange={e => setSelectedRfaType(e.target.value)}
                className="px-4 pr-9 py-2.5 text-sm font-medium bg-white border border-slate-300 text-slate-700 rounded-lg appearance-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none cursor-pointer hover:border-slate-400 transition-colors">
                <option value="ALL">ทุกประเภท</option>
                <option value="RFA-SHOP">SHOP</option>
                <option value="RFA-MAT">MAT</option>
                <option value="RFA-GEN">GEN</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>

            {/* Category */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}
                className="pl-9 pr-8 py-2.5 text-sm font-medium bg-white border border-slate-300 text-slate-700 rounded-lg appearance-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none cursor-pointer hover:border-slate-400 transition-colors">
                <option value="ALL">ทุกหมวดงาน</option>
                {availableCategoryKeys.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>

            {/* Reset button — แสดงเมื่อมี filter active */}
            {(selectedSite !== 'ALL' || selectedRfaType !== 'ALL' || selectedCategory !== 'ALL' || searchQuery !== '') && (
              <button
                onClick={() => { setSelectedSite('ALL'); setSelectedRfaType('ALL'); setSelectedCategory('ALL'); setSearchQuery(''); }}
                className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-red-600 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 hover:border-red-300 transition-all"
              >
                ✕ ล้างตัวกรอง
              </button>
            )}
          </div>
        </div>
      </div>


      {/* ── Main Content ── */}
      <div className="">

        {filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <FolderOpen className="w-14 h-14 mb-4 text-slate-300" />
            <p className="text-base font-semibold text-slate-600">ไม่พบเอกสาร</p>
            <p className="text-sm mt-1">ลองเปลี่ยนตัวกรองหรือคำค้นหาดูนะครับ</p>
          </div>
        ) : (
          <>
            {/* ── Desktop: Dense Data Table ───────────────────────────────── */}
            <div className="hidden md:block">
              <div className="bg-white border-t border-b border-slate-200 overflow-hidden">

                {/* Table Header */}
                <div className="grid items-center px-6 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider select-none"
                  style={{ gridTemplateColumns: '2fr 1.2fr 1fr 0.7fr auto' }}>
                  <button onClick={() => requestSort('documentNumber')} className="pl-3 flex items-center gap-1.5 hover:text-slate-800 transition-colors w-fit">
                    เอกสาร <SortIcon columnKey="documentNumber" />
                  </button>
                  <div className="pl-1">หมวดงาน</div>
                  <div>สถานะ</div>
                  <button onClick={() => requestSort('updatedAt')} className="flex items-center justify-center gap-1.5 hover:text-slate-800 transition-colors mx-auto">
                    อัปเดตล่าสุด <SortIcon columnKey="updatedAt" />
                  </button>
                  <div className="w-52 text-center">ไฟล์แนบ</div>
                </div>

                {/* Table Rows */}
                <div className="divide-y divide-slate-100">
                  {sortedDocs.map(doc => {
                    const a = doc as any;
                    const isSuspended = doc.supersededStatus === 'SUSPENDED';
                    const isActive = doc.supersededStatus === 'ACTIVE';
                    const sc = statusConfig(doc.status, isSuspended);
                    const pdfFiles = getPdfFiles(doc);
                    const cadFiles: RFAFile[] = a.cadFiles || [];
                    const isPdfOpen = openDrawers.has(`${doc.id}-pdf`);
                    const isCadOpen = openDrawers.has(`${doc.id}-cad`);
                    const siteName = sites.find(s => s.id === a.siteId)?.name || '—';
                    const catLabel = resolveCategory(a);

                    // revision comment
                    let revisionComment: string = a.supersededComment || '';
                    if (!revisionComment && doc.workflow) {
                      const wf = [...doc.workflow].reverse().find(w => w.comments && (w.status === STATUSES.APPROVED_REVISION_REQUIRED || w.status === STATUSES.REJECTED));
                      if (wf) revisionComment = wf.comments || '';
                    }

                    return (
                      <div key={doc.id} className={`group relative ${isSuspended ? 'bg-red-50/40' : 'hover:bg-slate-50/80'} transition-colors duration-100`}>

                        {/* Status left accent line */}
                        <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${sc.dot}`} />

                        {/* Main row */}
                        <div className="grid items-center px-6 py-5"
                          style={{ gridTemplateColumns: '2fr 1.2fr 1fr 0.7fr auto' }}>

                          {/* Col 1: Doc number + title */}
                          <div className="pl-3 min-w-0 pr-4">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-lg font-bold text-slate-900 tracking-tight">{doc.documentNumber}</span>
                              <span className="text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 flex-shrink-0">
                                Rev.{String(doc.revisionNumber || 0).padStart(2, '0')}
                              </span>
                              {doc.rfaType && (
                                <span className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5 flex-shrink-0">
                                  {doc.rfaType.replace('RFA-', '')}
                                </span>
                              )}
                            </div>
                            <p className="text-base text-slate-500 truncate" title={doc.title}>{doc.title}</p>
                            {/* Inline revision banner */}
                            {(isSuspended || isActive) && (
                              <p className={`text-sm mt-1.5 ${isSuspended ? 'text-red-600' : 'text-amber-700'} flex items-center gap-1`}>
                                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                                {isSuspended ? 'ระงับชั่วคราว' : 'กำลังแก้ไข'}{revisionComment ? `: ${revisionComment}` : ''}
                              </p>
                            )}
                          </div>

                          {/* Col 2: Category (primary) / Site (secondary) */}
                          <div className="min-w-0 pr-3">
                            <p className="text-base font-medium text-slate-700 truncate" title={catLabel}>{catLabel}</p>
                            <p className="text-sm text-slate-400 truncate mt-0.5" title={siteName}>{siteName}</p>
                          </div>

                          {/* Col 3: Status badge */}
                          <div>
                            <span className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold ${sc.bg} ${sc.text}`}>
                              {sc.icon}
                              {sc.label}
                            </span>
                          </div>

                          {/* Col 4: Date */}
                          <div className="text-center">
                            <span className="text-base text-slate-500">{formatDate(doc.updatedAt)}</span>
                          </div>

                          {/* Col 5: File buttons */}
                          <div className="w-52 flex items-center justify-center gap-2">
                            <button
                              onClick={() => !isSuspended && toggleDrawer(doc.id, 'pdf')}
                              disabled={pdfFiles.length === 0 || isSuspended}
                              aria-label={`เปิดไฟล์ PDF (${pdfFiles.length})`}
                              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
                                pdfFiles.length === 0 || isSuspended
                                  ? 'text-slate-300 border-slate-100 cursor-not-allowed'
                                  : isPdfOpen
                                    ? 'bg-red-600 text-white border-red-600 shadow-sm'
                                    : 'text-slate-600 border-slate-200 hover:border-red-300 hover:text-red-600 hover:bg-red-50'
                              }`}
                            >
                              <FileText className="w-4 h-4" />
                              PDF
                              <span className="opacity-60">({pdfFiles.length})</span>
                            </button>
                            <button
                              onClick={() => !isSuspended && toggleDrawer(doc.id, 'cad')}
                              disabled={cadFiles.length === 0 || isSuspended}
                              aria-label={`ดาวน์โหลด CAD (${cadFiles.length})`}
                              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
                                cadFiles.length === 0 || isSuspended
                                  ? 'text-slate-300 border-slate-100 cursor-not-allowed'
                                  : isCadOpen
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                    : 'text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50'
                              }`}
                            >
                              <FileDigit className="w-4 h-4" />
                              CAD
                              <span className="opacity-60">({cadFiles.length})</span>
                            </button>
                          </div>
                        </div>

                        {/* ── PDF Drawer ── */}
                        {isPdfOpen && pdfFiles.length > 0 && (
                          <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3 pl-8">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">ไฟล์ PDF</p>
                            <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
                              {pdfFiles.map((pdf, idx) => (
                                <button key={`${pdf.fileName}-${idx}`} onClick={() => setPreviewFile(pdf)}
                                  className="flex items-center gap-2.5 p-2.5 bg-white rounded-lg border border-slate-200 hover:border-red-300 hover:shadow-sm group transition-all text-left">
                                  <div className="w-8 h-8 rounded-md bg-red-50 text-red-500 flex items-center justify-center flex-shrink-0 group-hover:bg-red-500 group-hover:text-white transition-colors">
                                    <FileText className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium text-slate-700 truncate group-hover:text-red-700 transition-colors" title={pdf.fileName}>{pdf.fileName}</p>
                                    <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5"><Eye className="w-3 h-3" /> พรีวิว</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* ── CAD Drawer ── */}
                        {isCadOpen && cadFiles.length > 0 && (
                          <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3 pl-8">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ไฟล์ต้นฉบับ (CAD)</p>
                              {cadFiles.length > 1 && (
                                <button onClick={() => cadFiles.forEach(f => f.fileUrl && window.open(f.fileUrl, '_blank'))}
                                  className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-semibold transition-colors">
                                  <DownloadCloud className="w-3.5 h-3.5" /> โหลดทั้งหมด
                                </button>
                              )}
                            </div>
                            <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
                              {cadFiles.map((cad, idx) => (
                                <button key={`${cad.fileName}-${idx}`} onClick={() => cad.fileUrl && window.open(cad.fileUrl, '_blank')}
                                  className="flex items-center gap-2.5 p-2.5 bg-white rounded-lg border border-slate-200 hover:border-blue-300 hover:shadow-sm group transition-all text-left">
                                  <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-500 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                    <FileDigit className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium text-slate-700 truncate group-hover:text-blue-700 transition-colors" title={cad.fileName}>{cad.fileName}</p>
                                    <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5"><Download className="w-3 h-3" /> ดาวน์โหลด</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>

                {/* Table Footer */}
                <div className="px-6 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                  <p className="text-[11px] text-slate-400">แสดง <span className="font-semibold text-slate-600">{filteredDocs.length}</span> จาก <span className="font-semibold text-slate-600">{documents.length}</span> รายการ</p>
                </div>
              </div>
            </div>

            {/* ── Mobile: Card Stack ─────────────────────────────────────── */}
            <div className="md:hidden flex flex-col gap-3">
              {/* Mobile sorting controls */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-slate-500">เรียงตาม:</span>
                <button onClick={() => requestSort('documentNumber')} className={`text-xs px-2.5 py-1.5 rounded-md border flex items-center gap-1 transition-colors ${sortConfig.key === 'documentNumber' ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-white border-slate-200 text-slate-500'}`}>
                  ชื่อเอกสาร <SortIcon columnKey="documentNumber" />
                </button>
                <button onClick={() => requestSort('updatedAt')} className={`text-xs px-2.5 py-1.5 rounded-md border flex items-center gap-1 transition-colors ${sortConfig.key === 'updatedAt' ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-white border-slate-200 text-slate-500'}`}>
                  อัปเดตล่าสุด <SortIcon columnKey="updatedAt" />
                </button>
              </div>

              {sortedDocs.map(doc => {
                const a = doc as any;
                const isSuspended = doc.supersededStatus === 'SUSPENDED';
                const isActive = doc.supersededStatus === 'ACTIVE';
                const sc = statusConfig(doc.status, isSuspended);
                const pdfFiles = getPdfFiles(doc);
                const cadFiles: RFAFile[] = a.cadFiles || [];
                const isPdfOpen = openDrawers.has(`${doc.id}-pdf`);
                const isCadOpen = openDrawers.has(`${doc.id}-cad`);
                const siteName = sites.find(s => s.id === a.siteId)?.name || '—';
                const catLabel = resolveCategory(a);

                let revisionComment: string = a.supersededComment || '';
                if (!revisionComment && doc.workflow) {
                  const wf = [...doc.workflow].reverse().find(w => w.comments && (w.status === STATUSES.APPROVED_REVISION_REQUIRED || w.status === STATUSES.REJECTED));
                  if (wf) revisionComment = wf.comments || '';
                }

                return (
                  <div key={doc.id} className={`bg-white rounded-xl border overflow-hidden ${isSuspended ? 'border-red-200' : 'border-slate-200'} shadow-sm`}>

                    {/* Card color accent top bar */}
                    <div className={`h-1 w-full ${sc.dot}`} />

                    <div className="p-4">
                      {/* Doc number row */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-base font-bold text-slate-900">{doc.documentNumber}</span>
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
                              Rev.{String(doc.revisionNumber || 0).padStart(2, '0')}
                            </span>
                          </div>
                          <p className="text-sm text-slate-500 mt-1 line-clamp-2">{doc.title}</p>
                        </div>
                        <span className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold ${sc.bg} ${sc.text}`}>
                          {sc.icon} {sc.label}
                        </span>
                      </div>

                      {/* Revision banner */}
                      {(isSuspended || isActive) && (
                        <div className={`flex items-start gap-1.5 text-xs rounded-md px-3 py-2 mb-3 ${isSuspended ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-amber-50 text-amber-800 border border-amber-100'}`}>
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span><span className="font-semibold">{isSuspended ? 'ระงับ: ' : 'กำลังแก้ไข: '}</span>{revisionComment || 'อยู่ในระหว่างการแก้ไข Rev. ใหม่'}</span>
                        </div>
                      )}

                      {/* Meta */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 mb-4">
                        <span className="flex items-center gap-1"><Building className="w-3 h-3" /> {siteName}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(doc.updatedAt)}</span>
                        {catLabel !== '—' && <span className="text-slate-400 truncate max-w-[140px]">{catLabel}</span>}
                      </div>

                      {/* File buttons */}
                      <div className="flex gap-2">
                        <button onClick={() => !isSuspended && toggleDrawer(doc.id, 'pdf')}
                          disabled={pdfFiles.length === 0 || isSuspended}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold border transition-all ${
                            pdfFiles.length === 0 || isSuspended
                              ? 'text-slate-300 border-slate-100 cursor-not-allowed'
                              : isPdfOpen
                                ? 'bg-red-600 text-white border-red-600'
                                : 'text-slate-600 border-slate-200 hover:border-red-300 hover:text-red-600'
                          }`}>
                          <FileText className="w-4 h-4" />
                          PDF ({pdfFiles.length})
                        </button>
                        <button onClick={() => !isSuspended && toggleDrawer(doc.id, 'cad')}
                          disabled={cadFiles.length === 0 || isSuspended}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold border transition-all ${
                            cadFiles.length === 0 || isSuspended
                              ? 'text-slate-300 border-slate-100 cursor-not-allowed'
                              : isCadOpen
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                          }`}>
                          <FileDigit className="w-4 h-4" />
                          CAD ({cadFiles.length})
                        </button>
                      </div>
                    </div>

                    {/* Mobile PDF drawer */}
                    {isPdfOpen && pdfFiles.length > 0 && (
                      <div className="border-t border-slate-100 bg-slate-50 p-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">ไฟล์ PDF</p>
                        <div className="space-y-1.5">
                          {pdfFiles.map((pdf, idx) => (
                            <button key={`${pdf.fileName}-${idx}`} onClick={() => setPreviewFile(pdf)}
                              className="w-full flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 hover:border-red-200 transition-all group">
                              <div className="w-9 h-9 rounded-lg bg-red-50 text-red-500 flex items-center justify-center flex-shrink-0">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="flex-1 text-left min-w-0">
                                <p className="text-sm font-medium text-slate-700 truncate">{pdf.fileName}</p>
                                <p className="text-xs text-slate-400 mt-0.5">แตะเพื่อพรีวิว</p>
                              </div>
                              <Eye className="w-4 h-4 text-slate-300 group-hover:text-red-500 transition-colors" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Mobile CAD drawer */}
                    {isCadOpen && cadFiles.length > 0 && (
                      <div className="border-t border-slate-100 bg-slate-50 p-3">
                        <div className="flex items-center justify-between mb-2 px-1">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ไฟล์ CAD</p>
                          {cadFiles.length > 1 && (
                            <button onClick={() => cadFiles.forEach(f => f.fileUrl && window.open(f.fileUrl, '_blank'))}
                              className="flex items-center gap-1 text-xs text-blue-600 font-semibold">
                              <DownloadCloud className="w-3.5 h-3.5" /> ทั้งหมด
                            </button>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {cadFiles.map((cad, idx) => (
                            <button key={`${cad.fileName}-${idx}`} onClick={() => cad.fileUrl && window.open(cad.fileUrl, '_blank')}
                              className="w-full flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 hover:border-blue-200 transition-all group">
                              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center flex-shrink-0">
                                <FileDigit className="w-4 h-4" />
                              </div>
                              <div className="flex-1 text-left min-w-0">
                                <p className="text-sm font-medium text-slate-700 truncate">{cad.fileName}</p>
                                <p className="text-xs text-slate-400 mt-0.5">แตะเพื่อดาวน์โหลด</p>
                              </div>
                              <Download className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* PDF Preview */}
      <PDFPreviewModal isOpen={!!previewFile} file={previewFile} onClose={() => setPreviewFile(null)} allowEdit={false} />
    </div>
  );
}