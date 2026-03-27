// src/app/admin/activity-logs/page.tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/useAuth';
import { AuthGuard } from '@/lib/components/shared/AuthGuard';
import { ROLES } from '@/lib/config/workflow';
import { ActivityLog, LogAction } from '@/types/activity-log';
import { auth } from '@/lib/firebase/client';
import Layout from '@/components/layout/Layout';

// --- ค่าคงที่ ---
const LOG_VIEWER_ROLES = [ROLES.PM, ROLES.PD, ROLES.ADMIN];

const ACTION_LABELS: Record<LogAction, string> = {
  LOGIN: '🔐 เข้าสู่ระบบ',
  LOGOUT: '🚪 ออกจากระบบ',
  VIEW_DETAIL: '👁️ เปิดดูเอกสาร',
  PREVIEW_FILE: '📄 เปิดดูไฟล์',
  DOWNLOAD_FILE: '⬇️ ดาวน์โหลด',
  CREATE_DOCUMENT: '➕ สร้างเอกสาร',
  SUBMIT_DOCUMENT: '📤 ส่งขออนุมัติ',
  APPROVE_DOCUMENT: '✅ อนุมัติ',
  REJECT_DOCUMENT: '❌ ไม่อนุมัติ',
  REQUEST_REVISION: '🔄 ขอแก้ไข',
  CREATE_WORK_REQUEST: '📋 สร้าง WR',
  APPROVE_WORK_REQUEST: '✅ อนุมัติ WR',
  REJECT_WORK_REQUEST: '❌ ไม่อนุมัติ WR',
  INVITE_USER: '✉️ เชิญผู้ใช้',
  UPDATE_USER: '👤 อัปเดตผู้ใช้',
};

const ACTION_COLORS: Record<LogAction, string> = {
  LOGIN: 'bg-blue-100 text-blue-800',
  LOGOUT: 'bg-gray-100 text-gray-700',
  VIEW_DETAIL: 'bg-indigo-100 text-indigo-800',
  PREVIEW_FILE: 'bg-purple-100 text-purple-800',
  DOWNLOAD_FILE: 'bg-cyan-100 text-cyan-800',
  CREATE_DOCUMENT: 'bg-green-100 text-green-800',
  SUBMIT_DOCUMENT: 'bg-yellow-100 text-yellow-800',
  APPROVE_DOCUMENT: 'bg-green-100 text-green-800',
  REJECT_DOCUMENT: 'bg-red-100 text-red-800',
  REQUEST_REVISION: 'bg-orange-100 text-orange-800',
  CREATE_WORK_REQUEST: 'bg-teal-100 text-teal-800',
  APPROVE_WORK_REQUEST: 'bg-green-100 text-green-800',
  REJECT_WORK_REQUEST: 'bg-red-100 text-red-800',
  INVITE_USER: 'bg-pink-100 text-pink-800',
  UPDATE_USER: 'bg-slate-100 text-slate-800',
};

function formatTime(date: Date | null): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(date);
}

function getRelativeTime(date: Date | null): string {
  if (!date) return '';
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return 'เมื่อกี้';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} นาทีที่แล้ว`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} ชั่วโมงที่แล้ว`;
  return `${Math.floor(diff / 86400000)} วันที่แล้ว`;
}

// --- Main Component ---
function ActivityLogContent() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(true);

  // Filters
  const today = new Date().toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [filterAction, setFilterAction] = useState<string>('');
  const [filterUserId, setFilterUserId] = useState('');
  const [filterSiteId, setFilterSiteId] = useState('');
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({}); // userId → email

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const newLogCount = useRef(0);

  // โหลด site list สำหรับ admin
  useEffect(() => {
    if (!user) return;
    const loadSites = async () => {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/sites', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const siteList = (data.sites || []).map((s: any) => ({ id: s.id, name: s.name }));
        if (user.role !== ROLES.ADMIN) {
          // PM/PD เห็นแค่ site ของตัวเอง
          setSites(siteList.filter((s: any) => user.sites?.includes(s.id)));
        } else {
          setSites(siteList);
        }
      }
    };
    loadSites();
  }, [user]);

  // subscribe real-time Firestore logs
  const subscribeToLogs = useCallback(() => {
    if (!user) return;
    setLoading(true);

    // cleanup previous listener
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    const fromDate = new Date(`${dateFrom}T00:00:00`);
    const toDate = new Date(`${dateTo}T23:59:59`);

    let q = query(
      collection(db, 'activityLogs'),
      where('createdAt', '>=', Timestamp.fromDate(fromDate)),
      where('createdAt', '<=', Timestamp.fromDate(toDate)),
      orderBy('createdAt', 'desc'),
      limit(200),
    );

    // PM/PD: filter เฉพาะ site ของตัวเอง
    if (user.role !== ROLES.ADMIN) {
      const userSites = user.sites || [];
      if (userSites.length === 0) {
        setLogs([]);
        setLoading(false);
        return;
      }
      const targetSiteId = filterSiteId || (userSites.length === 1 ? userSites[0] : null);
      if (targetSiteId && userSites.includes(targetSiteId)) {
        q = query(q, where('siteId', '==', targetSiteId));
      } else if (!filterSiteId) {
        q = query(q, where('siteId', 'in', userSites.slice(0, 10)));
      }
    } else if (filterSiteId) {
      q = query(q, where('siteId', '==', filterSiteId));
    }

    // Filter action
    if (filterAction) {
      q = query(q, where('action', '==', filterAction));
    }

    // Filter user
    if (filterUserId) {
      q = query(q, where('userId', '==', filterUserId));
    }

    const unsub = onSnapshot(q, (snapshot) => {
      const logList = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || null,
        } as ActivityLog;
      });
      setLogs(logList);
      setLoading(false);

      // build userMap for filter dropdown
      const newUserMap: Record<string, string> = {};
      logList.forEach(l => {
        if (l.userId && l.userEmail) newUserMap[l.userId] = l.userEmail;
      });
      setUserMap(prev => ({ ...prev, ...newUserMap }));
    });

    unsubscribeRef.current = unsub;
  }, [user, dateFrom, dateTo, filterSiteId, filterAction, filterUserId]);

  useEffect(() => {
    subscribeToLogs();
    return () => { if (unsubscribeRef.current) unsubscribeRef.current(); };
  }, [subscribeToLogs]);

  // Toggle live mode
  const toggleLive = () => {
    if (isLive) {
      if (unsubscribeRef.current) unsubscribeRef.current();
      setIsLive(false);
    } else {
      setIsLive(true);
      subscribeToLogs();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-800">📋 Activity Log</h1>
          <span className="text-sm text-gray-500">บันทึกการใช้งานระบบ</span>
          <button
            onClick={toggleLive}
            className={`ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${isLive
              ? 'bg-green-100 text-green-700 border border-green-300'
              : 'bg-gray-100 text-gray-500 border border-gray-200'
              }`}
          >
            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            {isLive ? 'LIVE' : 'หยุดชั่วคราว'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <div className="flex flex-wrap gap-3 items-end">
          {/* วันที่ */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">จากวันที่</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">ถึงวันที่</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Site (Admin เท่านั้น) */}
          {user?.role === ROLES.ADMIN && sites.length > 0 && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">โครงการ</label>
              <select value={filterSiteId} onChange={e => setFilterSiteId(e.target.value)}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">ทุกโครงการ</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {/* PM/PD: filter site ของตัวเอง */}
          {user?.role !== ROLES.ADMIN && sites.length > 1 && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">โครงการ</label>
              <select value={filterSiteId} onChange={e => setFilterSiteId(e.target.value)}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">ทุกโครงการ</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {/* Action filter */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">ประเภทการกระทำ</label>
            <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">ทุกประเภท</option>
              {Object.entries(ACTION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* User filter */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">ผู้ใช้งาน</label>
            <select value={filterUserId} onChange={e => setFilterUserId(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">ทุกคน</option>
              {Object.entries(userMap).map(([uid, email]) => (
                <option key={uid} value={uid}>{email}</option>
              ))}
            </select>
          </div>

          {/* Count & Clear Filters */}
          <div className="ml-auto flex items-center gap-3 self-end pb-1.5">
            {(filterAction || filterUserId || filterSiteId || dateFrom !== today || dateTo !== today) && (
              <button
                onClick={() => {
                  setFilterAction('');
                  setFilterUserId('');
                  setFilterSiteId('');
                  setDateFrom(today);
                  setDateTo(today);
                }}
                className="text-red-600 hover:text-red-700 text-xs font-medium bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-md border border-red-200 transition-colors flex items-center gap-1"
                title="ล้างตัวกรอง"
              >
                ✕ ล้างตัวกรอง
              </button>
            )}
            <div className="text-sm text-gray-500">
              {!loading && `${logs.length} รายการ`}
            </div>
          </div>
        </div>
      </div>

      {/* Log Table */}
      <div className="px-6 py-4">
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            <span className="ml-3 text-gray-500">กำลังโหลด...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">📭</div>
            <p>ไม่มีข้อมูล Activity Log ในช่วงเวลานี้</p>
            <p className="text-sm mt-1">ลองเปลี่ยน filter หรือวันที่</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 w-44">เวลา</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">ผู้ใช้งาน</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 w-40">การกระทำ</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">รายละเอียด</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 w-36">โครงการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log, index) => (
                  <tr key={log.id}
                    className={`hover:bg-gray-50 transition-colors ${index === 0 && isLive ? 'bg-blue-50/40' : ''}`}>
                    <td className="px-4 py-3 text-gray-500">
                      <div className="font-mono text-xs">{formatTime(log.createdAt)}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{getRelativeTime(log.createdAt)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{log.userEmail}</div>
                      <div className="text-xs text-gray-500">{log.userRole}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-700'}`}>
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-sm">
                      <div className="text-gray-700 truncate" title={log.description}>{log.description}</div>
                      {log.resourceName && (
                        <div className="text-xs text-blue-600 font-mono mt-0.5 truncate" title={log.resourceName}>
                          {log.resourceType && <span className="text-gray-400 mr-1">[{log.resourceType}]</span>}
                          {log.resourceName}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {log.siteName || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Page export with AuthGuard ---
export default function ActivityLogPage() {
  return (
    <AuthGuard requiredRoles={LOG_VIEWER_ROLES}>
      <Layout>
        <ActivityLogContent />
      </Layout>
    </AuthGuard>
  );
}
