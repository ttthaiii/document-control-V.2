'use client'

import { RFADocument, RFAPermissions, RFAWorkflowStep } from '@/types/rfa'
import { X, Paperclip, Clock, User, Check, Send, AlertTriangle, FileText, Download, History } from 'lucide-react'
import { useAuth } from '@/lib/auth/useAuth'
import { useState } from 'react'
import { STATUS_LABELS } from '@/lib/config/workflow'

// =========== Helper Functions ===========
const formatDate = (dateString: string | undefined): string => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleString('th-TH', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};


// =========== History Modal Component ===========
const WorkflowHistoryModal = ({ workflow, onClose }: { workflow: RFAWorkflowStep[], onClose: () => void }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center p-4 border-b">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center">
                        <History size={20} className="mr-2"/>
                        ประวัติการดำเนินงาน
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={24} />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto">
                    <div className="border-l-2 border-gray-200 ml-2">
                        {workflow.length > 0 ? (
                            workflow.map((item, index) => (
                            <div key={index} className="relative pl-6 pb-6">
                                <div className="absolute -left-[9px] top-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-white"></div>
                                <p className="font-semibold text-gray-800">{STATUS_LABELS[item.status] || item.status}</p>
                                <p className="text-sm text-gray-600">โดย: {item.userName} ({item.role})</p>
                                <time className="text-xs text-gray-400">{formatDate(item.timestamp)}</time>
                                
                                {item.files && item.files.length > 0 && (
                                    <div className="mt-2 pl-2 border-l-2 border-gray-100">
                                        <p className="text-xs font-semibold text-gray-500 mb-1">ไฟล์แนบ ณ ขั้นตอนนี้:</p>
                                        <ul className="space-y-1">
                                            {item.files.map((file, fileIndex) => (
                                                <li key={fileIndex} className="flex items-center text-xs text-gray-600">
                                                    <FileText size={12} className="mr-2 flex-shrink-0" />
                                                    <a 
                                                        href={file.fileUrl} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer" 
                                                        className="truncate hover:underline"
                                                        title={file.fileName}
                                                    >
                                                        {file.fileName}
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                            </div>
                            ))
                        ) : (
                            <p className="text-sm text-gray-500 pl-6">ไม่มีประวัติ</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};


// =========== Main Detail Modal Component ===========
interface RFADetailModalProps {
  document: RFADocument | null
  onClose: () => void
  onUpdate: (updatedDocument: RFADocument) => void
}

export default function RFADetailModal({ document, onClose, onUpdate }: RFADetailModalProps) {
  const { firebaseUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showHistory, setShowHistory] = useState(false); // <-- State ใหม่สำหรับเปิด/ปิด Modal ประวัติ

  if (!document) return null;

  const handleAction = async (action: string) => {
    // ... (Function นี้เหมือนเดิม)
  };

  const permissions = document.permissions || {} as RFAPermissions;

  // --- ✅ Logic ใหม่: กรองไฟล์ให้เหลือเฉพาะไฟล์ของสถานะล่าสุด ---
  // เราจะถือว่าไฟล์ใน document object คือไฟล์ล่าสุดที่ควรแสดงผล
  const latestFiles = document.files || [];

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b">
            <div className="flex items-center space-x-4">
                <div>
                    <h3 className="text-lg font-bold text-blue-600">{document.runningNumber || 'RFA Document'}</h3>
                    <p className="text-sm text-gray-500">{document.documentNumber}</p>
                </div>
                {/* --- ✅ ปุ่มใหม่สำหรับดูประวัติ --- */}
                <button 
                    onClick={() => setShowHistory(true)}
                    className="flex items-center text-sm text-gray-500 hover:text-blue-600"
                >
                    <History size={16} className="mr-1"/> ดูประวัติ
                </button>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto space-y-6">
            {/* Document Info */}
            <div className="bg-gray-50 p-4 rounded-lg">
                <h2 className="text-xl font-semibold text-gray-800 mb-2">{document.title}</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                        <strong className="text-gray-500 block">สถานะ:</strong>
                        <span className="font-semibold">{STATUS_LABELS[document.status] || document.status}</span>
                    </div>
                    <div>
                        <strong className="text-gray-500 block">หมวดงาน:</strong>
                        <span>{document.category.categoryCode}</span>
                    </div>
                    <div>
                        <strong className="text-gray-500 block">ผู้สร้าง:</strong>
                        <span>{document.createdByInfo.email}</span>
                    </div>
                </div>
                {document.description && (
                <div className='mt-4'>
                    <strong className="text-gray-500 block text-sm">รายละเอียดเพิ่มเติม:</strong>
                    <p className="text-gray-700 whitespace-pre-wrap">{document.description}</p>
                </div>
                )}
            </div>
            
            {/* --- ❌ ส่วนแสดงประวัติแบบ Timeline ถูกลบออกจากตรงนี้ --- */}

            {/* Attached Files (แสดงเฉพาะไฟล์ล่าสุด) */}
            <div>
              <h4 className="text-md font-semibold mb-2 flex items-center">
                <Paperclip size={16} className="mr-2"/> ไฟล์แนบ (ฉบับล่าสุด) ({latestFiles.length})
              </h4>
              <ul className="space-y-2">
                {latestFiles.length > 0 ? (
                   latestFiles.map((file, index) => (
                    <li key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded-md">
                      <div className="flex items-center">
                        <FileText className="w-5 h-5 text-gray-500 mr-3" />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-800">{file.fileName}</span>
                          <span className="text-xs text-gray-500">{formatFileSize(file.size)}</span>
                        </div>
                      </div>
                      <a href={file.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-blue-100">
                        <Download size={18} />
                      </a>
                    </li>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">ไม่มีไฟล์แนบในฉบับล่าสุด</p>
                )}
              </ul>
            </div>
          </div>
          
          {/* Footer with Action Buttons */}
          <div className="flex justify-end items-center p-4 border-t space-x-3 bg-gray-50 rounded-b-lg">
            {/* (ส่วนปุ่ม Action เหมือนเดิม) */}
          </div>
        </div>
      </div>

      {/* --- ✅ แสดง Modal ประวัติเมื่อ showHistory เป็น true --- */}
      {showHistory && (
        <WorkflowHistoryModal 
            workflow={document.workflow || []} 
            onClose={() => setShowHistory(false)} 
        />
      )}
    </>
  )
}