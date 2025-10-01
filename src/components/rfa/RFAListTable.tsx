'use client'

import React, { useState, useEffect } from 'react'
import { FileText, Calendar, User, Clock, Building, Tag, GitCommit } from 'lucide-react'
import { RFADocument } from '@/types/rfa'
import { STATUSES, CREATOR_ROLES, REVIEWER_ROLES, APPROVER_ROLES } from '@/lib/config/workflow'
import Spinner from '@/components/shared/Spinner'

interface RFAListTableProps {
  documents: RFADocument[]
  isLoading: boolean
  onDocumentClick: (document: RFADocument) => void
  getStatusColor: (status: string) => string
  statusLabels: { [key: string]: string }
  getRFATypeColor: (type: string) => string
}

const PENDING_STATUSES = [
  STATUSES.PENDING_REVIEW,
  STATUSES.PENDING_CM_APPROVAL,
  STATUSES.REVISION_REQUIRED,
  STATUSES.APPROVED_REVISION_REQUIRED,
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

export default function RFAListTable({
  documents,
  isLoading,
  onDocumentClick,
  getStatusColor,
  statusLabels,
  getRFATypeColor
}: RFAListTableProps) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth <= 768)
    checkIsMobile()
    window.addEventListener('resize', checkIsMobile)
    return () => window.removeEventListener('resize', checkIsMobile)
  }, [])

  if (isLoading) {
    return (
      <div className="w-full h-96 flex justify-center items-center bg-white rounded-lg shadow">
        <Spinner />
      </div>
    );
  }
  
  // เพิ่มเงื่อนไขสำหรับแสดงผลเมื่อไม่มีข้อมูล
  if (!documents || documents.length === 0) {
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

  /**
   * ✅ [แก้ไข] ปรับ Logic ให้แสดงผลเป็น Role ตามสถานะของเอกสาร
   */
  const getResponsibleParty = (doc: RFADocument): { name: string, role: string } => {
    switch (doc.status) {
      case STATUSES.PENDING_REVIEW:
        return { name: 'Site', role: 'Site' };

      // 👇 --- จุดที่แก้ไข --- 👇
      case STATUSES.SENT_TO_EXTERNAL_CM:
        return { name: 'CM (ภายนอก)', role: 'CM' };
      
      case STATUSES.PENDING_FINAL_APPROVAL:
        return { name: 'Site', role: 'Site' };
      // --- สิ้นสุดจุดที่แก้ไข ---

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
                {PENDING_STATUSES.includes(doc.status) && pendingDays > 0 && (
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
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">System No.</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">หมวดหมู่</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">เอกสาร</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Rev.</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">สถานะ</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">ผู้รับผิดชอบ</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">วันที่อัปเดตล่าสุด</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {documents.map((doc) => {
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
                      {PENDING_STATUSES.includes(doc.status) && pendingDays > 0 && (
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