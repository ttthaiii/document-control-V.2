'use client';

import React, { useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth/useAuth'; // Import useAuth
import { WorkRequest, WorkRequestStatus } from '@/types/work-request';
import Spinner from '@/components/shared/Spinner';
import { FileText, Calendar, Building, ThumbsUp, ThumbsDown } from 'lucide-react';
import { WR_STATUSES, WR_APPROVER_ROLES, WR_CREATOR_ROLES, ROLES, STATUS_LABELS, STATUS_COLORS } from '@/lib/config/workflow';

interface WorkRequestListTableProps {
  documents: WorkRequest[];
  isLoading: boolean;
  onDocumentClick: (document: WorkRequest) => void;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onApproveRejectClick?: (action: 'APPROVE_DRAFT' | 'REJECT_DRAFT', docId: string) => void; // Optional สำหรับปุ่มในแถว
}

// Helper to format date
const formatDate = (date: any) => {
  if (!date) return 'N/A';
  
  // ตรวจสอบว่า date ที่รับมาเป็น Timestamp object หรือไม่
  if (typeof date.toDate === 'function') {
    // ถ้าใช่, ให้แปลงด้วยเมธอด .toDate() ก่อน
    const d = date.toDate();
    return d.toLocaleDateString('th-TH', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
  
  // ถ้าไม่ใช่ ให้ใช้วิธีเดิมเป็น fallback
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Invalid Date'; // กัน Error เพิ่มเติม
  
  return d.toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

// Helper to get status styles
const getStatusStyles = (status: WorkRequestStatus | string) => {
    const label = STATUS_LABELS[status] || status; // ใช้ STATUS_LABELS
    const color = STATUS_COLORS[status] || '#6c757d'; // ใช้ STATUS_COLORS

    // แปลง hex color เป็น Tailwind class (ถ้าต้องการ) หรือใช้ style inline
    // ตัวอย่างการแปลงคร่าวๆ (อาจจะต้องปรับปรุง)
    let textColor = 'text-gray-800';
    let bgColor = 'bg-gray-100';

    if (color === '#0088FE') { bgColor = 'bg-blue-100'; textColor = 'text-blue-800'; } // PENDING_BIM
    else if (color === '#FFBB28') { bgColor = 'bg-yellow-100'; textColor = 'text-yellow-800'; } // IN_PROGRESS
    else if (color === '#AF19FF') { bgColor = 'bg-purple-100'; textColor = 'text-purple-800'; } // PENDING_ACCEPTANCE
    else if (color === '#FD7E14') { bgColor = 'bg-orange-100'; textColor = 'text-orange-800'; } // REVISION_REQUESTED
    else if (color === '#28A745') { bgColor = 'bg-green-100'; textColor = 'text-green-800'; } // COMPLETED
    else if (color === '#6c757d') { bgColor = 'bg-gray-100'; textColor = 'text-gray-800'; } // DRAFT
    else if (color === '#DC3545') { bgColor = 'bg-red-100'; textColor = 'text-red-800'; } // REJECTED_BY_PM

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
        if (isChecked) {
            const draftIds = filteredDocuments
                .filter(doc => doc.status === WR_STATUSES.DRAFT)
                .map(doc => doc.id);
            onSelectionChange(draftIds);
        } else {
            onSelectionChange([]);
        }
    };

      const filteredDocuments = useMemo(() => {
        if (!user) return [];

        const userRole = user.role;

        // 1. ถ้าเป็น Admin หรือ Approver (PD/PM): แสดงทั้งหมด
        if (userRole === ROLES.ADMIN || WR_APPROVER_ROLES.includes(userRole)) {
            return documents;
        }
        // 2. ถ้าเป็น BIM: ซ่อน DRAFT และ REJECTED_BY_PM
        else if (userRole === ROLES.BIM) {
            return documents.filter(doc =>
                doc.status !== WR_STATUSES.DRAFT &&
                doc.status !== WR_STATUSES.REJECTED_BY_PM
            );
        }
        // --- 👇 [แก้ไข] ตอนนี้ WR_CREATOR_ROLES ถูก Import แล้ว ---
        // 3. ถ้าเป็น Creator (PE/OE): แสดงที่ตัวเองสร้าง หรือที่ไม่ใช่ Draft/Rejected
        else if (WR_CREATOR_ROLES.includes(userRole) && user.sites && user.sites.length > 0) {
             return documents.filter(doc =>
                doc.createdBy === user.id ||
                (doc.status !== WR_STATUSES.DRAFT && doc.status !== WR_STATUSES.REJECTED_BY_PM)
            );
        }
        // --- 👆 สิ้นสุดการแก้ไข ---
        // 4. Role อื่นๆ ที่เหลือ: ซ่อน DRAFT และ REJECTED_BY_PM
        else {
             return documents.filter(doc =>
                doc.status !== WR_STATUSES.DRAFT &&
                doc.status !== WR_STATUSES.REJECTED_BY_PM
            );
        }

    }, [documents, user]);

    const draftItems = useMemo(() => filteredDocuments.filter(doc => doc.status === WR_STATUSES.DRAFT), [filteredDocuments]);
    const isAllSelected = draftItems.length > 0 && selectedIds.length === draftItems.length;

    // For mobile view, you might want to add a state like in RFAListTable
    const isMobile = false; // Simplified for now

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
                      <th className="px-4 py-3 text-left">
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
                  // --- 👇 [แก้ไข] ประกาศ isDraft และ isSelected ตรงนี้ ---
                  const isDraft = doc.status === WR_STATUSES.DRAFT;
                  const isSelected = selectedIds.includes(doc.id);
                  return (
                    <tr
                      key={doc.id}
                      className={`hover:bg-gray-50 ${isDraft ? 'bg-yellow-50 hover:bg-yellow-100' : ''}`}
                      // ทำให้กดทั้งแถวได้ ยกเว้นกดปุ่ม Action หรือ Checkbox
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
                                      onClick={e => e.stopPropagation()} // ป้องกันการ trigger onClick ของแถว
                                  />
                              ) : null} {/* ไม่แสดง Checkbox ถ้าไม่ใช่ Draft */}
                          </td>
                      )}   

                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-blue-600">{doc.documentNumber}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-800 line-clamp-2">{doc.taskName}</p>
                      </td>
                       <td className="px-6 py-4 text-center">
                        <p className="text-sm text-gray-600">{doc.site?.name || 'N/A'}</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {/* --- 👇 [แก้ไข] ใช้ statusStyle.colorClasses --- */}
                        <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusStyle.colorClasses}`}>
                          {statusStyle.text}
                        </span>
                        {/* --- 👆 สิ้นสุดการแก้ไข --- */}
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
                                      className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-100 mx-1 disabled:opacity-50"
                                      title="อนุมัติ"
                                  >
                                      <ThumbsUp size={16} />
                                  </button>
                                  <button
                                      onClick={(e) => { e.stopPropagation(); onApproveRejectClick('REJECT_DRAFT', doc.id); }}
                                      className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-100 mx-1 disabled:opacity-50"
                                      title="ไม่อนุมัติ"
                                  >
                                      <ThumbsDown size={16} />
                                  </button>
                                  </>
                              )}
                          </td>
                      )}                      
                    </tr>
                  );
                })}
                 {/* --- 👆 สิ้นสุดการแก้ไข --- */}
              </tbody>
            </table>
          </div>
        </div>
      );
}