'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { FileText, Calendar, User, Clock, Building, Tag, ArrowUp, ArrowDown, Lock, AlertTriangle } from 'lucide-react'
import { RFADocument } from '@/types/rfa'

import { STATUSES } from '@/lib/config/workflow'
import Spinner from '@/components/shared/Spinner'

interface RFAListTableProps {
  documents: RFADocument[]
  isLoading: boolean
  onDocumentClick: (document: RFADocument) => void
  getStatusColor: (status: string) => string
  statusLabels: { [key: string]: string }
  getRFATypeColor: (type: string) => string
}

// ✅ [FIX 3] กำหนดสถานะที่ "ยังไม่เสร็จสิ้น" ทั้งหมด เพื่อใช้คำนวณวันค้าง
const ACTIVE_STATUSES_FOR_PENDING_DAYS = [
  STATUSES.PENDING_REVIEW,
  STATUSES.PENDING_CM_APPROVAL,
  STATUSES.PENDING_FINAL_APPROVAL,
  STATUSES.REVISION_REQUIRED,
  STATUSES.APPROVED_REVISION_REQUIRED,
  STATUSES.REJECTED, // เพิ่มสถานะ REJECTED เข้ามา
];


const convertToDate = (date: any): Date | null => {
  if (!date) return null;
  if (typeof date.toDate === 'function') {
    return date.toDate();
  }
  if (date._seconds) {
    return new Date(date._seconds * 1000);
  }
  const d = new Date(date);
  if (!isNaN(d.getTime())) {
    return d;
  }
  return null;
};

// Type สำหรับ state การเรียงลำดับ
type SortDirection = 'ascending' | 'descending';
type SortKey = keyof RFADocument | 'site.name' | 'category.categoryCode' | 'responsibleParty' | 'pendingDays';


export default function RFAListTable({
  documents,
  isLoading,
  onDocumentClick,
  getStatusColor,
  statusLabels,
  getRFATypeColor
}: RFAListTableProps) {
  const [isMobile, setIsMobile] = useState(false)

  // ✅ [CHANGE 1] เพิ่ม State สำหรับจัดการการเรียงลำดับ
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({ key: 'updatedAt', direction: 'descending' });


  useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth <= 768)
    checkIsMobile()
    window.addEventListener('resize', checkIsMobile)
    return () => window.removeEventListener('resize', checkIsMobile)
  }, [])

  const getResponsibleParty = (doc: RFADocument): { name: string, role: string } => {
    switch (doc.status) {
      case STATUSES.PENDING_REVIEW:
      case STATUSES.PENDING_FINAL_APPROVAL:
        return { name: 'Site', role: 'Site' };

      case STATUSES.PENDING_CM_APPROVAL:
        return { name: 'CM', role: 'CM' };

      case STATUSES.REVISION_REQUIRED:
      case STATUSES.APPROVED_REVISION_REQUIRED:
        return { name: doc.createdByInfo?.role || 'Creator', role: doc.createdByInfo?.role || 'Creator' };

      case STATUSES.REJECTED:
        return doc.isLatest
          ? { name: doc.createdByInfo?.role || 'Creator', role: doc.createdByInfo?.role || 'Creator' }
          : { name: 'เสร็จสิ้น', role: 'Completed' };

      case STATUSES.APPROVED:
      case STATUSES.APPROVED_WITH_COMMENTS:
        return { name: 'เสร็จสิ้น', role: 'Completed' };

      default:
        return { name: 'N/A', role: 'N/A' };
    }
  }

  const calculatePendingDays = (document: RFADocument) => {
    const lastUpdate = convertToDate(document.updatedAt);
    if (!lastUpdate) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const updateDate = new Date(lastUpdate);
    updateDate.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - updateDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  // Helper: extract numeric suffix from a string (e.g., "AR-005" -> 5)
  const getNumericSuffix = (str: string): number => {
    if (!str) return 0;
    const match = str.match(/\d+$/);
    return match ? parseInt(match[0], 10) : 0;
  };

  // ✅ [CHANGE 1] เพิ่ม useMemo สำหรับเรียงลำดับข้อมูลก่อนแสดงผล
  const sortedDocuments = useMemo(() => {
    let sortableDocuments = [...documents];
    if (sortConfig !== null) {
      sortableDocuments.sort((a, b) => {
        const getNestedValue = (obj: any, path: string) => path.split('.').reduce((o, p) => (o ? o[p] : undefined), obj);

        let aValue: any;
        let bValue: any;

        if (sortConfig.key === 'documentNumber') {
          const aNum = getNumericSuffix(a.documentNumber || '');
          const bNum = getNumericSuffix(b.documentNumber || '');
          if (aNum !== 0 && bNum !== 0) {
            aValue = aNum;
            bValue = bNum;
          } else {
            aValue = (a.documentNumber || '').toLowerCase();
            bValue = (b.documentNumber || '').toLowerCase();
          }
        } else if (sortConfig.key === 'pendingDays') {
          const aIsActive = ACTIVE_STATUSES_FOR_PENDING_DAYS.includes(a.status);
          const bIsActive = ACTIVE_STATUSES_FOR_PENDING_DAYS.includes(b.status);
          aValue = aIsActive ? calculatePendingDays(a) : -1; // ตอนนี้จะเรียกใช้งานได้แล้ว
          bValue = bIsActive ? calculatePendingDays(b) : -1; // ตอนนี้จะเรียกใช้งานได้แล้ว
        } else if (sortConfig.key === 'responsibleParty') {
          aValue = getResponsibleParty(a).name;
          bValue = getResponsibleParty(b).name;
        } else if (sortConfig.key === 'updatedAt') {
          aValue = convertToDate(a.updatedAt)?.getTime() || 0;
          bValue = convertToDate(b.updatedAt)?.getTime() || 0;
        } else {
          aValue = getNestedValue(a, sortConfig.key);
          bValue = getNestedValue(b, sortConfig.key);
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableDocuments;
  }, [documents, sortConfig]);

  // ✅ [CHANGE 1] ฟังก์ชันสำหรับเปลี่ยนการเรียงลำดับ
  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  // ✅ [CHANGE 1] Component สำหรับแสดงไอคอนการเรียงลำดับ
  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (!sortConfig || sortConfig.key !== columnKey) {
      return <span className="w-4 h-4 ml-2"></span>;
    }
    return (
      <span className="ml-2">
        {sortConfig.direction === 'ascending' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
      </span>
    );
  };


  if (isLoading) {
    return (
      <div className="w-full h-96 flex justify-center items-center bg-white rounded-lg shadow">
        <Spinner />
      </div>
    );
  }

  if (!sortedDocuments || sortedDocuments.length === 0) {
    return (
      <div className="w-full h-96 flex flex-col justify-center items-center bg-white rounded-lg shadow text-center">
        <FileText className="w-16 h-16 text-gray-300 mb-4" />
        <h3 className="text-xl font-semibold text-gray-700">ไม่พบเอกสาร</h3>
        <p className="text-gray-500 mt-1">ลองเปลี่ยนตัวกรองหรือสร้างเอกสารใหม่</p>
      </div>
    );
  }

  const formatDate = (date: any) => {
    const d = convertToDate(date);
    if (!d) return 'Invalid Date';
    return d.toLocaleDateString('th-TH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }


  // Mobile View (Card)
  if (isMobile) {
    return (
      <div className="space-y-4">
        {documents.map((doc) => {
          const responsible = getResponsibleParty(doc);
          const pendingDays = calculatePendingDays(doc);
          return (
            <div
              key={doc.id}
              onClick={() => onDocumentClick(doc)}
              className={`rounded-lg shadow border p-4 cursor-pointer transition-all ${
                doc.supersededStatus === 'SUSPENDED' ? 'bg-red-50 border-red-300'
                : 'bg-white'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getRFATypeColor(doc.rfaType)}`}>
                      {doc.rfaType}
                    </span>
                    <span className="inline-flex items-center px-2 py-1 bg-gray-200 text-gray-800 rounded-full text-xs font-semibold">
                      REV-{String(doc.revisionNumber).padStart(2, '0')}
                      {!!doc.supersededComment && (
                        <span className="ml-1 text-[10px] text-orange-600 font-bold" title="ต้องการ Rev. ใหม่">⚠️</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-medium text-gray-900 text-sm truncate">
                      {doc.documentNumber}
                    </h3>
                    {doc.supersededStatus === 'SUSPENDED' && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white flex-shrink-0">
                        <Lock className="w-2.5 h-2.5 mr-0.5" />ห้ามใช้
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2">
                    {doc.title}
                  </p>
                </div>
                <div className="flex flex-col items-end space-y-1 flex-shrink-0 ml-2">
                  <span className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(doc.status)}`}>
                    {statusLabels[doc.status] || doc.status}
                  </span>
                </div>
              </div>
              <div className="space-y-2 text-xs text-gray-600">
                <div className="flex items-center">
                  <Building className="w-3 h-3 mr-2" />
                  <span>{doc.site?.name || 'N/A'}</span>
                </div>
                <div className="flex items-center">
                  <Tag className="w-3 h-3 mr-2" />
                  <span>{doc.category?.categoryCode || 'N/A'}</span>
                </div>
                <div className="flex items-center">
                  <User className="w-3 h-3 mr-2" />
                  <span>ผู้รับผิดชอบ: {responsible.name}</span>
                </div>
                <div className="flex items-center">
                  <Calendar className="w-3 h-3 mr-2" />
                  <span>อัปเดต: {formatDate(doc.updatedAt)}</span>
                </div>
                {ACTIVE_STATUSES_FOR_PENDING_DAYS.includes(doc.status) && pendingDays > 0 && (
                  <div className="flex items-center text-orange-600">
                    <Clock className="w-3 h-3 mr-2" />
                    <span>ค้างดำเนินการ: {pendingDays} วัน</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // Desktop View (Hybrid Data Grid)
  return (
    <div className="sticky top-16 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-[calc(100vh-12rem)] flex flex-col">
      <div className="overflow-auto flex-1 scroll-locked-when-modal">
        {/* Header Grid */}
        <div className="sticky top-0 z-10 grid items-center px-6 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider select-none min-w-[900px]"
          style={{ gridTemplateColumns: '2fr 1.1fr 1fr auto' }}>
          
          <div className="flex items-center gap-1 pl-2">
            <button onClick={() => requestSort('documentNumber')} className="flex items-center gap-1 hover:text-slate-800 transition-colors shrink-0">
              เอกสาร <SortIcon columnKey='documentNumber' />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => requestSort('category.categoryCode')} className="flex items-center gap-1 hover:text-slate-800 transition-colors">
              หมวดงาน <SortIcon columnKey='category.categoryCode' />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => requestSort('pendingDays')} className="flex items-center gap-1 hover:text-slate-800 transition-colors">
              สถานะ <SortIcon columnKey='pendingDays' />
            </button>
          </div>

          <div className="text-right pr-6">
            <button onClick={() => requestSort('updatedAt')} className="flex items-center justify-end w-full gap-1 hover:text-slate-800 transition-colors">
              อัปเดตล่าสุด <SortIcon columnKey='updatedAt' />
            </button>
          </div>
        </div>

        {/* Rows Grid */}
        <div className="divide-y divide-slate-100 min-w-[900px]">
          {sortedDocuments.map((doc) => {
            const responsible = getResponsibleParty(doc);
            const pendingDays = calculatePendingDays(doc);
            const isSuspended = doc.supersededStatus === 'SUSPENDED';

            const statusClasses = getStatusColor(doc.status);
            // Dynamic spine color
            let spineColor = 'bg-slate-200';
            if (isSuspended) spineColor = 'bg-red-500';
            else if (statusClasses.includes('emerald') || statusClasses.includes('green')) spineColor = 'bg-emerald-500';
            else if (statusClasses.includes('amber') || statusClasses.includes('yellow')) spineColor = 'bg-amber-500';
            else if (statusClasses.includes('orange')) spineColor = 'bg-orange-500';
            else if (statusClasses.includes('blue')) spineColor = 'bg-blue-500';

            return (
              <div 
                key={doc.id} 
                onClick={() => onDocumentClick(doc)}
                className={`relative grid items-center px-6 py-5 cursor-pointer transition-colors hover:bg-slate-50 ${isSuspended ? 'bg-red-50/40' : 'bg-white'}`}
                style={{ gridTemplateColumns: '2fr 1.1fr 1fr auto' }}
              >
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${spineColor}`} />

                {/* Col 1: ข้อมูลเอกสาร */}
                <div className="pl-2 pr-4 min-w-0 flex flex-col items-start">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-base font-bold text-slate-900 tracking-tight">
                      {doc.documentNumber || doc.runningNumber}
                    </span>
                    <span className="text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 flex-shrink-0">
                      Rev.{String(doc.revisionNumber).padStart(2, '0')}
                    </span>
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${getRFATypeColor(doc.rfaType)}`}>
                      {doc.rfaType?.replace('RFA-', '')}
                    </span>
                    {isSuspended && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white flex-shrink-0">
                        <Lock className="w-2.5 h-2.5 mr-0.5" />ห้ามใช้
                      </span>
                    )}
                  </div>

                  <p className="text-base text-slate-700 line-clamp-2 leading-snug" title={doc.title}>
                    {doc.title}
                  </p>

                  {/* runningNumber ย้ายมาอยู่ล่าง title */}
                  <p className="text-xs text-slate-400 mt-1 font-medium select-all" title="System No.">
                    {doc.runningNumber}
                  </p>

                  {/* Revision comment inline — แสดงเมื่อมี supersededComment */}
                  {!!doc.supersededComment && (
                    <div className="flex items-start gap-1 mt-2 bg-orange-50 p-2 rounded-md border border-orange-100 w-full md:w-fit">
                      <AlertTriangle className="w-3.5 h-3.5 text-orange-500 flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-orange-700 leading-snug">{doc.supersededComment}</span>
                    </div>
                  )}
                </div>

                {/* Col 2: หมวดงาน / โครงการ */}
                <div className="pr-4 min-w-0">
                  <p className="text-base font-medium text-slate-700 truncate" title={doc.category?.categoryCode || 'N/A'}>{doc.category?.categoryCode || 'N/A'}</p>
                  <p className="text-sm text-slate-400 truncate mt-0.5" title={doc.site?.name || 'N/A'}>{doc.site?.name || 'N/A'}</p>
                </div>

                {/* Col 3: สถานะ / ผู้รับผิดชอบ */}
                <div className="pr-4 min-w-0 flex flex-col items-start gap-1.5">
                  {/* บรรทัด 1: Status badge */}
                  <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-semibold ${statusClasses}`}>
                    {statusLabels[doc.status] || doc.status}
                  </span>
                  
                  {/* บรรทัด 2: Pending chip — แสดงเฉพาะเมื่อ status active และ > 0 วัน */}
                  {ACTIVE_STATUSES_FOR_PENDING_DAYS.includes(doc.status) && pendingDays > 0 && (
                    <span className="text-xs font-medium text-orange-600 flex items-center gap-1 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-100">
                      <Clock className="w-3 h-3" /> ค้าง {pendingDays} วัน
                    </span>
                  )}

                  {/* บรรทัด 3: ผู้รับผิดชอบ */}
                  <div className="flex items-center text-xs text-slate-500 mt-0.5">
                    <User className="w-3.5 h-3.5 mr-1 opacity-60 flex-shrink-0" />
                    <span className="truncate">{responsible.name}</span>
                  </div>
                </div>

                {/* Col 4: อัปเดตล่าสุด */}
                <div className="text-right pr-6 min-w-0">
                  <span className="text-base text-slate-500 whitespace-nowrap">{formatDate(doc.updatedAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}