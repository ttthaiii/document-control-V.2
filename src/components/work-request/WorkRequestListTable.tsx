// src/components/work-request/WorkRequestListTable.tsx
'use client';

import React, { useMemo } from 'react';
import { useAuth } from '@/lib/auth/useAuth'; 
import { WorkRequest, WorkRequestStatus } from '@/types/work-request';
import Spinner from '@/components/shared/Spinner';
// ✅ 1. เพิ่ม FileText กลับเข้ามาใน import
import { FileText, Calendar, Building, ThumbsUp, ThumbsDown, User } from 'lucide-react';
import { WR_STATUSES, WR_APPROVER_ROLES, WR_CREATOR_ROLES, ROLES, STATUS_LABELS } from '@/lib/config/workflow';

interface WorkRequestListTableProps {
  documents: WorkRequest[];
  isLoading: boolean;
  onDocumentClick: (document: WorkRequest) => void;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onApproveRejectClick?: (action: 'APPROVE_DRAFT' | 'REJECT_DRAFT', docId: string) => void;
}

const formatDate = (date: any) => {
  if (!date) return 'N/A';
  if (typeof date.toDate === 'function') {
    const d = date.toDate();
    return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Invalid Date';
  return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ✅ 2. แก้ไขฟังก์ชันเลือกสี: เช็คจาก Status Key โดยตรง (ชัวร์กว่าเช็ค Hex Code)
const getStatusStyles = (status: WorkRequestStatus | string) => {
    const label = STATUS_LABELS[status] || status;
    
    let textColor = 'text-gray-800';
    let bgColor = 'bg-gray-100';

    switch (status) {
        case WR_STATUSES.DRAFT:
            bgColor = 'bg-gray-200'; textColor = 'text-gray-700';
            break;
        case WR_STATUSES.REJECTED_BY_PM:
            bgColor = 'bg-red-100'; textColor = 'text-red-800';
            break;
        case WR_STATUSES.PENDING_BIM:
            bgColor = 'bg-blue-100'; textColor = 'text-blue-800';
            break;
        case WR_STATUSES.IN_PROGRESS:
            bgColor = 'bg-yellow-100'; textColor = 'text-yellow-800';
            break;
        case WR_STATUSES.PENDING_ACCEPTANCE:
            bgColor = 'bg-purple-100'; textColor = 'text-purple-800';
            break;
        case WR_STATUSES.REVISION_REQUESTED:
            bgColor = 'bg-orange-100'; textColor = 'text-orange-800';
            break;
        case WR_STATUSES.COMPLETED:
            bgColor = 'bg-green-100'; textColor = 'text-green-800';
            break;
        default:
            bgColor = 'bg-gray-100'; textColor = 'text-gray-800';
    }

    return { text: label, colorClasses: `${bgColor} ${textColor}` };
};

export default function WorkRequestListTable({
  documents,
  isLoading,
  onDocumentClick,
  selectedIds,
  onSelectionChange,
  onApproveRejectClick,
}: WorkRequestListTableProps) {
    const { user } = useAuth();
    const isApprover = user && WR_APPROVER_ROLES.includes(user.role);
    const handleCheckboxChange = (docId: string, isChecked: boolean) => {
        if (isChecked) {
            onSelectionChange([...selectedIds, docId]);
        } else {
            onSelectionChange(selectedIds.filter(id => id !== docId));
        }
    };

    const handleSelectAll = (isChecked: boolean) => {
        const draftIds = filteredDocuments
            .filter(doc => doc.status === WR_STATUSES.DRAFT)
            .map(doc => doc.id);
        
        if (isChecked) {
            const uniqueIds = Array.from(new Set([...selectedIds, ...draftIds]));
            onSelectionChange(uniqueIds);
        } else {
            onSelectionChange(selectedIds.filter(id => !draftIds.includes(id)));
        }
    };

    const filteredDocuments = useMemo(() => {
        if (!user) return [];
        const userRole = user.role;

        if (userRole === ROLES.ADMIN || WR_APPROVER_ROLES.includes(userRole)) {
            return documents;
        }
        else if (userRole === ROLES.BIM) {
            return documents.filter(doc =>
                doc.status !== WR_STATUSES.DRAFT &&
                doc.status !== WR_STATUSES.REJECTED_BY_PM
            );
        }
        else if (WR_CREATOR_ROLES.includes(userRole) && user.sites && user.sites.length > 0) {
             return documents.filter(doc =>
                doc.createdBy === user.id ||
                (doc.status !== WR_STATUSES.DRAFT && doc.status !== WR_STATUSES.REJECTED_BY_PM)
            );
        }
        else {
             return documents.filter(doc =>
                doc.status !== WR_STATUSES.DRAFT &&
                doc.status !== WR_STATUSES.REJECTED_BY_PM
            );
        }
    }, [documents, user]);

    const draftItems = useMemo(() => filteredDocuments.filter(doc => doc.status === WR_STATUSES.DRAFT), [filteredDocuments]);
    const isAllSelected = draftItems.length > 0 && draftItems.every(d => selectedIds.includes(d.id));

  if (isLoading) {
    return (
      <div className="w-full h-96 flex justify-center items-center bg-white rounded-lg shadow">
        <Spinner />
      </div>
    );
  }
  
  if (!documents || documents.length === 0) {
    return (
      <div className="w-full h-96 flex flex-col justify-center items-center bg-white rounded-lg shadow text-center border-2 border-dashed">
        <FileText className="w-16 h-16 text-gray-300 mb-4" />
        <h3 className="text-xl font-semibold text-gray-700">ไม่พบ Work Request</h3>
        <p className="text-gray-500 mt-1">ยังไม่มีการสร้างคำร้องของานในโครงการนี้</p>
      </div>
    );
  }
    
return (
        <div className="bg-white rounded-lg shadow overflow-hidden h-full flex flex-col">
          <div className="overflow-auto flex-1 relative">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  {isApprover && (
                      <th className="px-4 py-3 text-left w-[50px]">
                          <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              checked={isAllSelected}
                              onChange={(e) => handleSelectAll(e.target.checked)}
                              disabled={draftItems.length === 0}
                          />
                      </th>
                  )}            
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">เลขที่เอกสาร</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">หัวข้อเรื่อง</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">โครงการ</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">สถานะ</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">อัปเดตล่าสุด</th>
                  {isApprover && (
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                  )}               
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredDocuments.map((doc) => {
                  const statusStyle = getStatusStyles(doc.status);
                  const isDraft = doc.status === WR_STATUSES.DRAFT;
                  const isSelected = selectedIds.includes(doc.id);
                  return (
                    <tr
                      key={doc.id}
                      className={`hover:bg-gray-50 transition-colors ${isDraft ? 'bg-yellow-50/50 hover:bg-yellow-100/50' : ''}`}
                      onClick={(e) => {
                           const target = e.target as HTMLElement;
                          if (target.tagName !== 'INPUT' && !target.closest('button')) {
                              onDocumentClick(doc);
                           }
                      }}
                    >
                    {isApprover && (
                          <td className="px-4 py-4">
                              {isDraft ? (
                                  <input
                                      type="checkbox"
                                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                      checked={isSelected}
                                      onChange={(e) => handleCheckboxChange(doc.id, e.target.checked)}
                                      onClick={e => e.stopPropagation()} 
                                  />
                              ) : null} 
                          </td>
                      )}   

                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-blue-600">{doc.documentNumber}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-800 line-clamp-2 font-medium">{doc.taskName}</p>
                      </td>
                       <td className="px-6 py-4 text-center">
                        <p className="text-sm text-gray-600">{doc.site?.name || 'N/A'}</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {/* ✅ ใช้ class สีที่ได้จากฟังก์ชัน getStatusStyles */}
                        <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold shadow-sm ${statusStyle.colorClasses}`}>
                          {statusStyle.text}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-sm text-gray-600">{formatDate(doc.updatedAt)}</span>
                      </td>
                      {isApprover && (
                          <td className="px-4 py-4 text-center whitespace-nowrap">
                              {isDraft && onApproveRejectClick && (
                                  <>
                                  <button
                                      onClick={(e) => { e.stopPropagation(); onApproveRejectClick('APPROVE_DRAFT', doc.id); }}
                                      className="text-green-600 hover:text-green-800 p-1.5 rounded-md hover:bg-green-100 mx-1 disabled:opacity-50 transition-colors"
                                      title="อนุมัติ"
                                  >
                                      <ThumbsUp size={18} />
                                  </button>
                                  <button
                                      onClick={(e) => { e.stopPropagation(); onApproveRejectClick('REJECT_DRAFT', doc.id); }}
                                      className="text-red-600 hover:text-red-800 p-1.5 rounded-md hover:bg-red-100 mx-1 disabled:opacity-50 transition-colors"
                                      title="ไม่อนุมัติ"
                                  >
                                      <ThumbsDown size={18} />
                                  </button>
                                  </>
                              )}
                          </td>
                      )}                      
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );
}