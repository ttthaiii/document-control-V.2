'use client';

import React from 'react';
import { WorkRequest, WorkRequestStatus } from '@/types/work-request';
import Spinner from '@/components/shared/Spinner';
import { FileText, Calendar, User, Clock, Building, Zap, AlertTriangle } from 'lucide-react';

interface WorkRequestListTableProps {
  documents: WorkRequest[];
  isLoading: boolean;
  onDocumentClick: (document: WorkRequest) => void;
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
const getStatusStyles = (status: WorkRequestStatus) => {
    switch (status) {
        case WorkRequestStatus.PENDING_BIM:
            return { text: 'รอ BIM รับงาน', color: 'bg-blue-100 text-blue-800' };
        case WorkRequestStatus.IN_PROGRESS:
            return { text: 'กำลังดำเนินการ', color: 'bg-yellow-100 text-yellow-800' };
        case WorkRequestStatus.PENDING_ACCEPTANCE:
            return { text: 'รอ Site ตรวจรับ', color: 'bg-purple-100 text-purple-800' };
        case WorkRequestStatus.REVISION_REQUESTED:
            return { text: 'ขอแก้ไข', color: 'bg-orange-100 text-orange-800' };
        case WorkRequestStatus.COMPLETED:
            return { text: 'เสร็จสิ้น', color: 'bg-green-100 text-green-800' };
        default:
            return { text: status, color: 'bg-gray-100 text-gray-800' };
    }
};


export default function WorkRequestListTable({
  documents,
  isLoading,
  onDocumentClick,
}: WorkRequestListTableProps) {
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
    // 1. ให้ Container หลักสูงเต็มพื้นที่ (h-full) และเป็น Flexbox แนวตั้ง
    <div className="bg-white rounded-lg shadow overflow-hidden h-full flex flex-col">
      {/* 2. ทำให้ส่วนนี้ (ที่ครอบตาราง) เป็นส่วนที่ Scroll ได้ และยืดเต็มที่ */}
      <div className="overflow-auto flex-1 relative">
        <table className="min-w-full divide-y divide-gray-200">
          {/* 3. ทำให้ Header ของตาราง "ติด" อยู่ที่ top-0 ของ container ที่ scroll ได้ */}
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">เลขที่เอกสาร</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">หัวข้อเรื่อง</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">โครงการ</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">สถานะ</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">อัปเดตล่าสุด</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {documents.map((doc) => {
              const status = getStatusStyles(doc.status);
              return (
                <tr
                  key={doc.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => onDocumentClick(doc)}
                >
                  <td className="px-6 py-4">
                    <p className="text-sm font-semibold text-blue-600">{doc.documentNumber}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-800 line-clamp-2">{doc.taskName}</p>
                  </td>
                   <td className="px-6 py-4 text-center">
                    <p className="text-sm text-gray-600">{doc.site?.name}</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-semibold ${status.color}`}>
                      {status.text}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-sm text-gray-600">{formatDate(doc.updatedAt)}</span>
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