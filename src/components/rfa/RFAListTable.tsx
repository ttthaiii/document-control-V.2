'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { FileText, Calendar, User, Clock, Building, Tag, ArrowUp, ArrowDown } from 'lucide-react'
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

  // ✅ [CHANGE 1] เพิ่ม useMemo สำหรับเรียงลำดับข้อมูลก่อนแสดงผล
  const sortedDocuments = useMemo(() => {
    let sortableDocuments = [...documents];
    if (sortConfig !== null) {
      sortableDocuments.sort((a, b) => {
        const getNestedValue = (obj: any, path: string) => path.split('.').reduce((o, p) => (o ? o[p] : undefined), obj);
        
        let aValue: any;
        let bValue: any;

        // --- 👇 2. เพิ่ม Logic การเรียงลำดับสำหรับ pendingDays ---
        if (sortConfig.key === 'pendingDays') {
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
              className="bg-white rounded-lg shadow border p-4 cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getRFATypeColor(doc.rfaType)}`}>
                      {doc.rfaType}
                    </span>
                    <span className="inline-flex items-center px-2 py-1 bg-gray-200 text-gray-800 rounded-full text-xs font-semibold">
                        REV-{String(doc.revisionNumber).padStart(2, '0')}
                    </span>
                  </div>
                  <h3 className="font-medium text-gray-900 text-sm mb-1 truncate">
                    {doc.documentNumber}
                  </h3>
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

  // Desktop View (Table)
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                 <button onClick={() => requestSort('runningNumber')} className="flex items-center justify-center w-full">
                    System No.
                    <SortIcon columnKey='runningNumber' />
                 </button>
              </th>
              {/* ✅ [CHANGE 2] เพิ่มหัวตาราง "โครงการ" */}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                 <button onClick={() => requestSort('site.name')} className="flex items-center w-full">
                    โครงการ
                    <SortIcon columnKey='site.name' />
                 </button>
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                 <button onClick={() => requestSort('category.categoryCode')} className="flex items-center justify-center w-full">
                    หมวดหมู่
                    <SortIcon columnKey='category.categoryCode' />
                 </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">เอกสาร</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Rev.</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                 <button onClick={() => requestSort('pendingDays')} className="flex items-center justify-center w-full">
                    สถานะ
                    <SortIcon columnKey='pendingDays' />
                 </button>
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                 <button onClick={() => requestSort('responsibleParty')} className="flex items-center justify-center w-full">
                    ผู้รับผิดชอบ
                    <SortIcon columnKey='responsibleParty' />
                 </button>
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                 <button onClick={() => requestSort('updatedAt')} className="flex items-center justify-center w-full">
                    วันที่อัปเดตล่าสุด
                    <SortIcon columnKey='updatedAt' />
                 </button>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedDocuments.map((doc) => {
              const responsible = getResponsibleParty(doc);
              const pendingDays = calculatePendingDays(doc);
              return (
                <tr
                  key={doc.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => onDocumentClick(doc)}
                >
                  <td className="px-6 py-4">
                    <p className="text-sm font-semibold text-blue-600 text-center">{doc.runningNumber || 'N/A'}</p>
                  </td>
                  {/* ✅ [CHANGE 2] เพิ่ม Cell แสดงข้อมูล "โครงการ" */}
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-800">{doc.site?.name || 'N/A'}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm">
                      <p className="text-gray-600 text-center">{doc.category?.categoryCode || 'N/A'}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{doc.documentNumber}</p>
                      <p className="text-sm text-gray-600 line-clamp-2">{doc.title}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-200 text-gray-800">
                      {String(doc.revisionNumber).padStart(2, '0')}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col space-y-1 items-center">
                      <span className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(doc.status)}`}>
                        {statusLabels[doc.status] || doc.status}
                      </span>
                      {/* ✅ [FIX 3] เปลี่ยนไปใช้ Array ใหม่ที่ครอบคลุมทุกสถานะ */}
                      {ACTIVE_STATUSES_FOR_PENDING_DAYS.includes(doc.status) && pendingDays > 0 && (
                        <span className="text-xs text-orange-600 text-center">{`ค้าง ${pendingDays} วัน`}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center">
                      <User className="w-4 h-4 text-gray-400 mr-2" />
                      <div className="text-sm">
                        <p className="text-gray-900">{responsible.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-600 text-center">
                        <span>{formatDate(doc.updatedAt)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}