// src/app/admin/activity-logs/page.tsx
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  collection, query, where, orderBy, limit, startAfter,
  onSnapshot, Timestamp, getDocs, QueryDocumentSnapshot, DocumentData
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/useAuth';
import { AuthGuard } from '@/lib/components/shared/AuthGuard';
import { ROLES } from '@/lib/config/workflow';
import { ActivityLog, LogAction } from '@/types/activity-log';
import Layout from '@/components/layout/Layout';
import { Search, Download, RefreshCw, ChevronDown, Clock, X, FileText, Info, Eye } from 'lucide-react';

const LOG_VIEWER_ROLES = [ROLES.PM, ROLES.PD, ROLES.ADMIN];
const PAGE_SIZE = 100;

const ACTION_LABELS: Record<string, string> = {
  LOGIN: '🔐 เข้าสู่ระบบ', LOGOUT: '🚪 ออกจากระบบ',
  VIEW_DETAIL: '👁️ เปิดดูเอกสาร', PREVIEW_FILE: '📄 เปิดดูไฟล์', DOWNLOAD_FILE: '⬇️ ดาวน์โหลด',
  CREATE_DOCUMENT: '➕ สร้างเอกสาร', SUBMIT_DOCUMENT: '📤 ส่งขออนุมัติ',
  APPROVE_DOCUMENT: '✅ อนุมัติ', REJECT_DOCUMENT: '❌ ไม่อนุมัติ', REQUEST_REVISION: '🔄 ขอแก้ไข',
  CREATE_WORK_REQUEST: '📋 สร้าง WR', APPROVE_WORK_REQUEST: '✅ อนุมัติ WR', REJECT_WORK_REQUEST: '❌ ไม่อนุมัติ WR',
  INVITE_USER: '✉️ เชิญผู้ใช้', UPDATE_USER: '👤 อัปเดตผู้ใช้',
};

const ACTION_COLORS: Record<string, string> = {
  LOGIN: 'bg-blue-100 text-blue-800', LOGOUT: 'bg-gray-100 text-gray-700',
  VIEW_DETAIL: 'bg-indigo-100 text-indigo-800', PREVIEW_FILE: 'bg-purple-100 text-purple-800', DOWNLOAD_FILE: 'bg-cyan-100 text-cyan-800',
  CREATE_DOCUMENT: 'bg-green-100 text-green-800', SUBMIT_DOCUMENT: 'bg-yellow-100 text-yellow-800',
  APPROVE_DOCUMENT: 'bg-green-100 text-green-800', REJECT_DOCUMENT: 'bg-red-100 text-red-800', REQUEST_REVISION: 'bg-orange-100 text-orange-800',
  CREATE_WORK_REQUEST: 'bg-teal-100 text-teal-800', APPROVE_WORK_REQUEST: 'bg-green-100 text-green-800', REJECT_WORK_REQUEST: 'bg-red-100 text-red-800',
  INVITE_USER: 'bg-pink-100 text-pink-800', UPDATE_USER: 'bg-slate-100 text-slate-800',
};

function formatTime(date: Date | null) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}
function getRelativeTime(date: Date | null) {
  if (!date) return '';
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return 'เมื่อกี้';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} นาทีที่แล้ว`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} ชั่วโมงที่แล้ว`;
  return `${Math.floor(diff / 86400000)} วันที่แล้ว`;
}

function exportToCSV(logs: ActivityLog[], filename: string, sites: { id: string; name: string }[] = []) {
  const headers = ['เวลา', 'ผู้ใช้งาน', 'Role', 'การกระทำ', 'ชื่อเอกสาร', 'เลขที่เอกสาร', 'รายละเอียด', 'โครงการ'];
  const rows = logs.map(log => {
    const siteName = log.siteName || (log.siteId ? (sites.find(s => s.id === log.siteId)?.name || log.siteId) : '');
    return [
      formatTime(log.createdAt), log.userEmail, log.userRole,
      ACTION_LABELS[log.action] || log.action, log.resourceTitle || '', log.resourceName || '', log.description, siteName,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });
  const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Components ---
function LogTable({ logs, sites, loading, isAuditMode }: { logs: ActivityLog[], sites: { id: string; name: string }[], loading: boolean, isAuditMode: boolean }) {
  if (loading) {
    return (
      <div className="flex justify-center items-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <span className="ml-3 text-gray-500">กำลังโหลดข้อมูล...</span>
      </div>
    );
  }
  if (logs.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
        <div className="text-4xl mb-3 opacity-50">🔍</div>
        <p className="text-gray-500 font-medium">ไม่พบข้อมูล Activity Log</p>
        <p className="text-sm text-gray-400 mt-1">ลองเปลี่ยนเงื่อนไขการค้นหา หรือช่วงวันที่</p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <table className="w-full text-sm table-fixed">
        <thead className="bg-gray-50/80 border-b border-gray-200">
          <tr>
            <th className="text-left px-5 py-3.5 font-semibold text-gray-600 w-44">เวลา</th>
            <th className="text-left px-5 py-3.5 font-semibold text-gray-600 w-48">ผู้ใช้งาน</th>
            <th className="text-left px-5 py-3.5 font-semibold text-gray-600 w-40">การกระทำ</th>
            <th className="text-left px-5 py-3.5 font-semibold text-gray-600">รายละเอียด</th>
            {!isAuditMode && <th className="text-left px-5 py-3.5 font-semibold text-gray-600 w-32">โครงการ</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {logs.map((log) => {
            const displaySiteName = log.siteName || (log.siteId ? (sites.find(s => s.id === log.siteId)?.name || log.siteId) : '—');
            return (
              <tr key={log.id} className="hover:bg-blue-50/30 transition-colors">
                <td className="px-5 py-3.5 text-gray-500 align-top">
                  <div className="font-mono text-xs text-gray-600">{formatTime(log.createdAt)}</div>
                  <div className="text-[11px] text-gray-400 mt-1">{getRelativeTime(log.createdAt)}</div>
                </td>
                <td className="px-5 py-3.5 overflow-hidden align-top">
                  <div className="font-medium text-gray-800 truncate text-xs" title={log.userEmail}>{log.userEmail}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{log.userRole}</div>
                </td>
                <td className="px-5 py-3.5 align-top">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-700'}`}>
                    {ACTION_LABELS[log.action] || log.action}
                  </span>
                </td>
                <td className="px-5 py-3.5 overflow-hidden align-top">
                  {!isAuditMode && log.resourceTitle && (
                    <div className="text-xs font-semibold text-gray-800 mb-1" title={log.resourceTitle} style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}>
                      {log.resourceTitle}
                    </div>
                  )}
                  <div className="text-gray-600 text-xs leading-relaxed" style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }} title={log.description}>
                    {log.description}
                  </div>
                  {!isAuditMode && log.resourceName && (
                    <div className="text-[11px] text-blue-600/80 font-mono mt-1" style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}>
                      {log.resourceName}
                    </div>
                  )}
                </td>
                {!isAuditMode && <td className="px-5 py-3.5 text-xs text-gray-600 align-top">{displaySiteName}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- Main Page ---
function ActivityLogContent() {
  const { user } = useAuth();
  
  // App States
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [allDocs, setAllDocs] = useState<{ id: string; title: string; documentNumber: string; siteName: string; siteId?: string }[]>([]);
  
  // UI States
  const [mode, setMode] = useState<'TIMELINE' | 'DOC_AUDIT'>('TIMELINE');
  const [selectedDoc, setSelectedDoc] = useState<{ id: string; title: string, documentNumber: string } | null>(null);
  
  // Filters
  const today = new Date().toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [filterAction, setFilterAction] = useState('');
  const [filterSiteId, setFilterSiteId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  
  // Data States
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [suggestions, setSuggestions] = useState<typeof allDocs>([]);
  
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // 1. Initial Load (Sites + RFA Docs for Autocomplete)
  useEffect(() => {
    if (!user) return;
    const initData = async () => {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      
      // Load Sites
      fetch('/api/sites', { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => {
          const siteList = data.sites || [];
          setSites(user.role !== ROLES.ADMIN ? siteList.filter((s: any) => user.sites?.includes(s.id)) : siteList);
        });

      // Load Documents Dictionary (For fast search, all statuses)
      fetch('/api/rfa/lookup', { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => {
          const docs = (data.documents || []).map((d: any) => ({
            id: d.id, title: d.title || '', documentNumber: d.documentNumber || '', siteName: d.siteName || '', siteId: d.siteId,
          }));
          setAllDocs(docs);
        });
    };
    initData();
  }, [user]);

  // 2. Data Fetcher
  const fetchLogs = useCallback(async (isLoadMore = false) => {
    if (!user) return;
    if (!isLoadMore) {
      if (unsubscribeRef.current) unsubscribeRef.current();
      setLoading(true);
      setLogs([]);
      setLastDoc(null);
    } else {
      setLoadingMore(true);
    }

    try {
      if (mode === 'TIMELINE') {
        // --- TIMELINE QUERY (Date based) ---
        let q = query(
          collection(db, 'activityLogs'),
          where('createdAt', '>=', Timestamp.fromDate(new Date(`${dateFrom}T00:00:00`))),
          where('createdAt', '<=', Timestamp.fromDate(new Date(`${dateTo}T23:59:59`))),
          orderBy('createdAt', 'desc')
        );

        if (user.role !== ROLES.ADMIN) {
          const userSites = user.sites || [];
          if (userSites.length > 0) q = query(q, where('siteId', 'in', userSites));
        } else if (filterSiteId) {
          q = query(q, where('siteId', '==', filterSiteId));
        }

        if (filterAction) q = query(q, where('action', '==', filterAction));

        if (isLoadMore && lastDoc) {
          q = query(q, startAfter(lastDoc), limit(PAGE_SIZE));
          const snap = await getDocs(q);
          const newItems = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.() || null } as ActivityLog));
          setLogs(prev => [...prev, ...newItems]);
          setLastDoc(snap.docs[snap.docs.length - 1] || null);
          setHasMore(snap.docs.length === PAGE_SIZE);
        } else {
          q = query(q, limit(PAGE_SIZE));
          // Live Subscription for timeline
          const unsub = onSnapshot(q, (snap) => {
            const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.() || null } as ActivityLog));
            setLogs(items);
            setLastDoc(snap.docs[snap.docs.length - 1] || null);
            setHasMore(snap.docs.length === PAGE_SIZE);
            setLoading(false);
            setIsLive(true);
          }, () => setLoading(false));
          unsubscribeRef.current = unsub;
        }

      } else if (mode === 'DOC_AUDIT' && selectedDoc) {
        // --- DOC AUDIT QUERY (Resource based - Get ALL history) ---
        // ใช้ resourceName (Document Number) เป็นหลัก เพื่อรวมประวัติจากทุก Revision ที่รหัสเอกสารเดียวกัน
        // (ใช้งาน Firebase Composite Index: resourceName + createdAt)
        setIsLive(false); // No live updates for full history audit
        const q = query(
          collection(db, 'activityLogs'), 
          where('resourceName', '==', selectedDoc.documentNumber),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.() || null } as ActivityLog));
        
        setLogs(items);
        setHasMore(false);
      }
    } catch (err: any) {
      console.error('[fetchLogs] Error:', err);
    } finally {
      if (isLoadMore) setLoadingMore(false);
      else if (mode === 'DOC_AUDIT') setLoading(false);
    }
  }, [user, mode, selectedDoc, dateFrom, dateTo, filterSiteId, filterAction, lastDoc]);

  // Effect Trigger
  useEffect(() => {
    if (!loadingMore) fetchLogs();
    return () => { if (unsubscribeRef.current) unsubscribeRef.current(); };
  }, [mode, selectedDoc, dateFrom, dateTo, filterSiteId, filterAction]); // Disable warning, fetchLogs is callback

  // 3. Client-side Search & Suggestions
  useEffect(() => {
    if (mode === 'DOC_AUDIT' || !searchInput.trim() || searchInput.length < 2) {
      setSuggestions([]);
      return;
    }
    const term = searchInput.toLowerCase();
    
    // กรอง AllDocs ตาม Site ที่เลือก
    let sourceDocs = allDocs;
    if (filterSiteId && mode === 'TIMELINE') {
      sourceDocs = allDocs.filter(d => d.siteId === filterSiteId);
    }

    const matched = sourceDocs.filter(d => d.title.toLowerCase().includes(term) || d.documentNumber.toLowerCase().includes(term)).slice(0, 8);
    setSuggestions(matched);
  }, [searchInput, allDocs, mode, filterSiteId]);

  // 4. Local Filtering Result
  const filteredLogs = useMemo(() => {
    let result = logs;
    const term = searchInput.toLowerCase().trim();

    if (mode === 'DOC_AUDIT') {
      // In Audit mode, dates & actions are filtered locally because Firestore fetched ALL history
      if (dateFrom) result = result.filter(l => l.createdAt && l.createdAt.getTime() >= new Date(`${dateFrom}T00:00:00`).getTime());
      if (dateTo) result = result.filter(l => l.createdAt && l.createdAt.getTime() <= new Date(`${dateTo}T23:59:59`).getTime());
      if (filterAction) result = result.filter(l => l.action === filterAction);
      
      if (term) {
        result = result.filter(l => 
          l.userEmail?.toLowerCase().includes(term) || l.description?.toLowerCase().includes(term) || (ACTION_LABELS[l.action] || '').toLowerCase().includes(term)
        );
      }
    } else {
      // In timeline mode, Firestore already filtered dates & actions. Only search is local.
      if (term) {
        result = result.filter(l =>
          l.resourceTitle?.toLowerCase().includes(term) ||
          l.resourceName?.toLowerCase().includes(term) ||
          l.userEmail?.toLowerCase().includes(term) ||
          l.description?.toLowerCase().includes(term) ||
          (ACTION_LABELS[l.action] || '').toLowerCase().includes(term)
        );
      }
    }
    return result;
  }, [logs, mode, dateFrom, dateTo, filterAction, searchInput]);

  // Actions
  const handleSelectDoc = (doc: typeof allDocs[0]) => {
    setSelectedDoc(doc);
    setMode('DOC_AUDIT');
    setSearchInput('');
    setDateFrom(''); // Clear dates to see full history
    setDateTo('');
    setFilterAction('');
  };

  const handleClearAudit = () => {
    setSelectedDoc(null);
    setMode('TIMELINE');
    setDateFrom(today);
    setDateTo(today);
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="w-full px-6 py-8 space-y-4">
        
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            📊 Activity Log
          </h1>
          <p className="text-gray-500 mt-1">มอนิเตอร์และตรวจสอบประวัติการเข้าวิเคราะห์เอกสารในระบบ</p>
        </div>

        {/* Banner for Doc Audit Mode */}
        {mode === 'DOC_AUDIT' && selectedDoc && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 mb-4 bg-blue-50 border border-blue-200 rounded-2xl shadow-sm animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white text-blue-600 rounded-xl shadow-sm"><FileText size={20} /></div>
                  <div>
                    <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-0.5">โหมดตรวจสอบประวัติเอกสาร (Document Audit)</div>
                    <div className="font-bold text-gray-900 text-lg flex items-center gap-2">
                      {selectedDoc.documentNumber}
                      <span className="text-base font-medium text-gray-600 truncate max-w-sm sm:max-w-md">{selectedDoc.title}</span>
                    </div>
                  </div>
                </div>
                <button onClick={handleClearAudit} className="mt-3 sm:mt-0 flex items-center justify-center gap-1.5 px-4 py-2 bg-white text-gray-600 hover:text-red-600 hover:bg-red-50 hover:border-red-200 border border-gray-200 rounded-xl text-sm font-medium transition-all shadow-sm">
                  <X size={16} /> ยกเลิก
                </button>
            </div>
        )}

        {/* Unified Search & Filters Bar */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
          
          {/* Top Row: Filters & Exports */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 relative z-30 items-end">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">เริ่มจากวันที่</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 hover:bg-white transition-colors" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">ถึงวันที่</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 hover:bg-white transition-colors" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">ประเภทการทำรายการ</label>
              <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 hover:bg-white transition-colors">
                <option value="">ทั้งหมด ทุกประเภท</option>
                {Object.keys(ACTION_LABELS).map(a => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
              </select>
            </div>
            {(user?.role === ROLES.ADMIN || sites.length > 1) && mode === 'TIMELINE' && (
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">จำกัดโครงการ</label>
                <select value={filterSiteId} onChange={e => setFilterSiteId(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 hover:bg-white transition-colors">
                  <option value="">ทั้งหมด ทุกโครงการ</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            {!(user?.role === ROLES.ADMIN || sites.length > 1) && mode === 'TIMELINE' && (
              <div className="hidden md:block" />
            )}
            
            <div className={`flex items-center justify-end gap-2 ${(!(user?.role === ROLES.ADMIN || sites.length > 1) || mode === 'DOC_AUDIT') ? 'md:col-span-2' : ''}`}>
               {mode === 'TIMELINE' && (
                <button onClick={() => fetchLogs(false)} title="รีเฟรชข้อมูลใหม่"
                  className="p-2.5 text-gray-600 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
                  <RefreshCw size={16} className={loading && !loadingMore ? 'animate-spin' : ''} />
                </button>
               )}
              <button onClick={() => exportToCSV(filteredLogs, mode === 'TIMELINE' ? 'timeline' : `audit_${selectedDoc?.documentNumber}`, sites)}
                disabled={filteredLogs.length === 0}
                className="flex items-center justify-center gap-2 px-4 py-2.5 w-full md:w-auto text-sm font-medium bg-[#107c41] text-white rounded-lg hover:bg-[#0c6b37] transition-colors shadow-sm disabled:opacity-50">
                <Download size={16} />
                Export CSV
              </button>
            </div>
          </div>

          {/* Bottom Row: Search Box */}
          <div className="relative z-20">
              <div className="relative w-full">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                  <Search size={18} />
                </div>
                <input
                  type="text"
                  placeholder={mode === 'DOC_AUDIT' ? `กรองรายชื่อผู้ใช้งาน หรือรายละเอียด ในประวัติของเอกสาร ${selectedDoc?.documentNumber} (ด้านล่าง)...` : "ค้นหาแบบปกติ (ชื่อโปรเจค, ชื่อคน) หรือ พิมพ์ดึงชื่อและเลขเอกสารเพื่อเข้าสู่โหมดตรวจประวัติ (Audit)..."}
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  className={`w-full text-sm border ${mode === 'DOC_AUDIT' ? 'border-blue-200 focus:ring-blue-500 bg-blue-50/30 text-blue-900 placeholder-blue-400/70' : 'border-gray-300 focus:ring-blue-500 bg-gray-50 focus:bg-white text-gray-900 placeholder-gray-400'} rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 shadow-sm transition-all`}
                />
                
                {/* Autocomplete Dropdown (Timeline Mode Only) */}
                {mode === 'TIMELINE' && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden py-2 animate-in fade-in slide-in-from-top-2">
                    <div className="px-4 py-2 bg-gray-50/80 border-b border-gray-100 mb-1 flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">เจอเอกสารที่ตรงกัน {suggestions.length} รายการ</span>
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">✨ โหมด Document Audit</span>
                    </div>
                    {suggestions.map(doc => (
                      <button key={doc.id} onClick={() => handleSelectDoc(doc)}
                        className="w-full text-left px-5 py-3 hover:bg-blue-50 transition-colors flex items-start gap-3 group">
                        <FileText size={16} className="text-gray-400 mt-0.5 group-hover:text-blue-500 transition-colors" />
                        <div>
                          <div className="font-medium text-gray-800 text-sm group-hover:text-blue-700 transition-colors">{doc.title || '(ไม่มีชื่อ)'}</div>
                          <div className="flex gap-3 mt-1">
                            <span className="text-[11px] font-mono text-gray-500 group-hover:text-blue-500">{doc.documentNumber}</span>
                            <span className="text-[11px] text-gray-400">• {doc.siteName}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
          </div>
        </div>

        {/* Audit Stats Indicator (Shows only in Document Audit Mode) */}
        {mode === 'DOC_AUDIT' && filteredLogs.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-2 animate-in slide-in-from-bottom-2 fade-in">
             {[
               { title: 'เปิดดูเอกสารทั้งหมด', count: filteredLogs.filter(l => l.action === 'VIEW_DETAIL').length, icon: <Eye size={20} className="text-indigo-500" />, bg: 'bg-indigo-50 border-indigo-100' },
               { title: 'สั่งดาวน์โหลดไฟล์', count: filteredLogs.filter(l => l.action === 'DOWNLOAD_FILE').length, icon: <Download size={20} className="text-cyan-500" />, bg: 'bg-cyan-50 border-cyan-100' },
               { title: 'พิมพ์/เปิด Preview', count: filteredLogs.filter(l => l.action === 'PREVIEW_FILE').length, icon: <FileText size={20} className="text-purple-500" />, bg: 'bg-purple-50 border-purple-100' },
             ].map((stat, i) => (
                <div key={i} className={`rounded-xl border p-4 flex items-center gap-4 ${stat.bg}`}>
                  <div className="p-3 bg-white rounded-lg shadow-sm">{stat.icon}</div>
                  <div>
                    <div className="text-2xl font-bold text-gray-800 leading-none">{stat.count} <span className="text-sm font-normal text-gray-500">ครั้ง</span></div>
                    <div className="text-xs font-medium text-gray-600 mt-1">{stat.title}</div>
                  </div>
                </div>
             ))}
          </div>
        )}

        {/* Status Bar */}
        <div className="flex justify-between items-center text-sm px-2 mt-4">
          <div className="text-gray-500">
            {loading && !loadingMore ? 'กำลังคำนวณข้อมูล...' : (
              <>พบข้อมูลที่ตรงกัน <strong className="text-gray-900 mx-1">{filteredLogs.length}</strong> รายการ</>
            )}
          </div>
          {mode === 'TIMELINE' ? (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> Live Timeline
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
              <Info size={12} /> ข้อมูลย้อนหลังทั้งหมดของเอกสาร
            </span>
          )}
        </div>

        {/* Main Table */}
        <LogTable logs={filteredLogs} sites={sites} loading={loading && !loadingMore} isAuditMode={mode === 'DOC_AUDIT'} />

        {/* Load More Pagination */}
        {mode === 'TIMELINE' && hasMore && !loading && searchInput.trim() === '' && (
          <div className="flex justify-center pt-4 pb-12">
            <button onClick={() => fetchLogs(true)} disabled={loadingMore}
              className="group flex items-center gap-2 px-6 py-3 text-sm font-medium bg-white border-2 border-gray-200 rounded-full hover:border-blue-500 hover:text-blue-600 text-gray-600 transition-all shadow-sm shadow-gray-100 disabled:opacity-50">
              {loadingMore ? (
                <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> โหลดข้อมูล...</>
              ) : (
                <><ChevronDown size={18} className="group-hover:translate-y-0.5 transition-transform" /> แสดงข้อมูลประวัติเพิ่ม (ทีละ 100)</>
              )}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

export default function ActivityLogPage() {
  return (
    <AuthGuard requiredRoles={LOG_VIEWER_ROLES}>
      <Layout>
        <ActivityLogContent />
      </Layout>
    </AuthGuard>
  );
}
