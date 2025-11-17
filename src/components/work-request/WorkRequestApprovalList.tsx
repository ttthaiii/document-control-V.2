// src/components/work-request/WorkRequestApprovalList.tsx (New Component)
'use client';

import React from 'react';
import { WorkRequest } from '@/types/work-request';
import Spinner from '@/components/shared/Spinner';
import { FileText, Calendar, Building, UserCheck } from 'lucide-react';
import { WR_STATUSES, STATUS_LABELS, STATUS_COLORS } from '@/lib/config/workflow';

interface WorkRequestApprovalListProps {
  documents: WorkRequest[];
  isLoading: boolean;
  onDocumentClick: (document: WorkRequest) => void;
}

// Helper to format date (เหมือนเดิม)
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

// Helper to get status styles (เหมือนเดิม)
const getStatusStyles = (status: string) => {
    const label = STATUS_LABELS[status] || status;
    const color = STATUS_COLORS[status] || '#6c757d';
    let textColor = 'text-gray-800';
    let bgColor = 'bg-gray-100';
    // Mapping colors... (same as in WorkRequestListTable)
    if (color === '#6c757d') { bgColor = 'bg-yellow-100'; textColor = 'text-yellow-800'; } // Draft specifically yellow/orange
    // ... other color mappings if needed ...

    return { text: label, colorClasses: `${bgColor} ${textColor}` };
};

export default function WorkRequestApprovalList({
  documents,
  isLoading,
  onDocumentClick,
}: WorkRequestApprovalListProps) {

  // กรองเฉพาะสถานะ DRAFT
  const draftDocuments = documents.filter(doc => doc.status === WR_STATUSES.DRAFT);

  if (isLoading) {
    return (
      <div className="w-full h-64 flex justify-center items-center bg-white rounded-lg shadow">
        <Spinner />
      </div>
    );
  }

  if (!isLoading && draftDocuments.length === 0) {
    return (
      <div className="w-full h-64 flex flex-col justify-center items-center bg-white rounded-lg shadow text-center border-2 border-dashed border-gray-300">
        <UserCheck className="w-12 h-12 text-green-400 mb-4" />
        <h3 className="text-lg font-semibold text-gray-700">ไม่มีคำร้องขอรอการอนุมัติ</h3>
        <p className="text-gray-500 mt-1">ไม่มี Work Request ในสถานะ Draft ที่รอการดำเนินการ</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden h-full flex flex-col">
      <div className="p-4 border-b bg-yellow-50">
           <h2 className="text-lg font-bold text-yellow-800">รายการ Work Request รออนุมัติ</h2>
      </div>
      <div className="overflow-auto flex-1 relative">
        <table className="min-w-full divide-y divide-gray-200">
          {/* Header อาจจะปรับเปลี่ยนเล็กน้อย */}
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">เลขที่เอกสาร</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">หัวข้อเรื่อง</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">โครงการ</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">ผู้สร้าง</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">วันที่สร้าง</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">กำหนดส่ง</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {draftDocuments.map((doc) => {
              const creatorInfo = doc.usersInfo ? doc.usersInfo[doc.createdBy] : null;
              const statusStyle = getStatusStyles(doc.status); // Should always be DRAFT here
              return (
                <tr
                  key={doc.id}
                  className="hover:bg-yellow-50 cursor-pointer" // Highlight on hover
                  onClick={() => onDocumentClick(doc)}
                >
                  <td className="px-6 py-4">
                    <p className="text-sm font-semibold text-blue-600">{doc.documentNumber}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-800 line-clamp-2">{doc.taskName}</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <p className="text-sm text-gray-600">{doc.site?.name || 'N/A'}</p>
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-gray-600">
                     {creatorInfo ? `${creatorInfo.email} (${creatorInfo.role})` : doc.createdBy}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-sm text-gray-600">{formatDate(doc.createdAt)}</span>
                  </td>
                   <td className="px-6 py-4 text-center">
                    <span className="text-sm text-gray-600">{formatDate(doc.dueDate)}</span>
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