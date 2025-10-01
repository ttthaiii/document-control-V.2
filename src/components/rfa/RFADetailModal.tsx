'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { RFADocument, RFAPermissions, RFAWorkflowStep, RFAFile, RFASite } from '@/types/rfa' // 👈 1. เพิ่ม RFASite
import { X, Paperclip, Clock, User, Check, Send, AlertTriangle, FileText, Download, History, MessageSquare, Edit3, Upload, ThumbsUp, ThumbsDown, Eye } from 'lucide-react'
import Spinner from '@/components/shared/Spinner';
import { useAuth } from '@/lib/auth/useAuth'
import { STATUS_LABELS, STATUSES, CREATOR_ROLES, REVIEWER_ROLES, APPROVER_ROLES, STATUS_COLORS } from '@/lib/config/workflow'
import PDFPreviewModal from './PDFPreviewModal'

// --- (Helper Functions: formatDate, formatFileSize, WorkflowHistoryModal ไม่มีการเปลี่ยนแปลง) ---
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
const WorkflowHistoryModal = ({ workflow, onClose, userRole }: { workflow: RFAWorkflowStep[], onClose: () => void, userRole?: string }) => {
    const filteredWorkflow = useMemo(() => {
        if (userRole && APPROVER_ROLES.includes(userRole)) {
            const statusesToHide = [STATUSES.PENDING_REVIEW, STATUSES.REVISION_REQUIRED];
            return workflow.filter(item => !statusesToHide.includes(item.status));
        }
        return workflow;
    }, [workflow, userRole]);

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
                        {filteredWorkflow.length > 0 ? (
                            filteredWorkflow.map((item, index) => (
                            <div key={index} className="relative pl-6 pb-8 last:pb-0">
                                <div className="absolute -left-[9px] top-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-white"></div>
                                <p className="font-semibold text-gray-800">{STATUS_LABELS[item.status] || item.status}</p>
                                <p className="text-sm text-gray-600">โดย: {item.userName} ({item.role})</p>
                                <time className="text-xs text-gray-400">{formatDate(item.timestamp)}</time>
                                {item.comments && (
                                    <div className="mt-2 p-2 bg-gray-50 rounded-md text-xs italic">
                                        <p className="text-gray-600">"{item.comments}"</p>
                                    </div>
                                )}
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

interface RFADetailModalProps {
  document: RFADocument | null
  onClose: () => void
  onUpdate: (updatedDocument: RFADocument) => void
  showOverlay?: boolean
}
interface UploadedFile {
    id: string;
    file: File;
    status: 'pending' | 'uploading' | 'success' | 'error';
    progress: number;
    uploadedData?: RFAFile;
    error?: string;
}

// 👇 เพิ่ม type สำหรับ site ที่มีข้อมูล cmSystemType
interface SiteWithSystemType extends RFASite {
    cmSystemType?: 'INTERNAL' | 'EXTERNAL';
}
// 👇 เพิ่ม type สำหรับ document ที่มีข้อมูลใหม่
interface FullRFADocument extends RFADocument {
    site: SiteWithSystemType;
    creatorRole?: 'BIM' | 'ME' | 'SN';
}


export default function RFADetailModal({ document: initialDoc, onClose, onUpdate,showOverlay = true}: RFADetailModalProps) {
  const { user, firebaseUser } = useAuth();
  const [document, setDocument] = useState<FullRFADocument | null>(initialDoc as FullRFADocument); // 👈 2. กำหนด Type ใหม่
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [comment, setComment] = useState('');
  const [newFiles, setNewFiles] = useState<UploadedFile[]>([]);
  const [revisionComment, setRevisionComment] = useState('');
  const [revisionFiles, setRevisionFiles] = useState<UploadedFile[]>([]);
  const [previewFile, setPreviewFile] = useState<RFAFile | null>(null);

  useEffect(() => {
    const fetchFullDocument = async () => {
      if (!initialDoc || !firebaseUser) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const token = await firebaseUser.getIdToken();
        const response = await fetch(`/api/rfa/${initialDoc.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (result.success) {
          setDocument(result.document); // 👈 3. API จะส่งข้อมูล cmSystemType และ creatorRole กลับมาด้วย
        } else {
          setDocument(initialDoc as FullRFADocument);
        }
      } catch (error) {
        setDocument(initialDoc as FullRFADocument);
      } finally {
        setIsLoading(false);
      }
    };
    fetchFullDocument();
  }, [initialDoc, firebaseUser]);


  // --- (useMemo, Loading/Error states, Helper functions: upload, remove, handleAction etc. ไม่มีการเปลี่ยนแปลง) ---
  const latestCommentItem = useMemo(() => {
    if (!document?.workflow || document.workflow.length === 0) return null;
    return [...document.workflow].reverse().find(step => step.comments && step.comments.trim() !== '');
  }, [document?.workflow]);

  if (isLoading) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
            <Spinner className="h-12 w-12 text-white" />
        </div>
    );
  }

  if (!document) return null;

  const permissions = document.permissions || {} as RFAPermissions;
  const latestFiles = document.files || [];
  const isCreator = document.createdBy === user?.id;
  
  const isResubmissionFlow = document.status === STATUSES.REVISION_REQUIRED && isCreator;
  const isRevisionFlow = document.status === STATUSES.REJECTED && isCreator && document.isLatest;
  
  const newRevisionNumber = (document.revisionNumber || 0) + 1;
  const newDocumentNumber = `${document.documentNumber.split('-REV')[0]}-REV${String(newRevisionNumber).padStart(2, '0')}`;
  const displayDetailOrComment = latestCommentItem?.comments || document.description;
  const displayLabel = latestCommentItem ? `ความคิดเห็นล่าสุด` : 'รายละเอียดเพิ่มเติม';
  
  const uploadTempFile = async (file: File): Promise<Partial<UploadedFile>> => {
    try {
        if (!firebaseUser) throw new Error('กรุณาล็อกอินก่อนอัปโหลดไฟล์');
        const token = await firebaseUser.getIdToken();
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch('/api/rfa/upload-temp-file', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const result = await response.json();
        if (result.success) {
            return { status: 'success', progress: 100, uploadedData: result.fileData };
        } else {
            throw new Error(result.error || 'อัปโหลดล้มเหลว');
        }
    } catch (err) {
        return { status: 'error', error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' };
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, target: 'action' | 'revision' | 'resubmission') => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const uploadedFileObjects: UploadedFile[] = files.map(file => ({
      id: `${file.name}-${Date.now()}`,
      file,
      status: 'pending',
      progress: 0
    }));
    
    const setFiles = target === 'revision' ? setRevisionFiles : setNewFiles;
    
    setFiles(prev => [...prev, ...uploadedFileObjects]);
    
    uploadedFileObjects.forEach(async (fileObj) => {
        setFiles(prev => prev.map(f => f.id === fileObj.id ? { ...f, status: 'uploading' } : f));
        const result = await uploadTempFile(fileObj.file);
        setFiles(prev => prev.map(f => f.id === fileObj.id ? { ...f, ...result } : f));
    });
    event.target.value = '';
  };
  
  const removeFile = async (index: number, target: 'action' | 'revision' | 'resubmission') => {
    const files = target === 'revision' ? revisionFiles : newFiles;
    const setFiles = target === 'revision' ? setRevisionFiles : setNewFiles;
    
    const fileToRemove = files[index];
    if (fileToRemove.status === 'success' && fileToRemove.uploadedData?.filePath) {
        try {
            const token = await firebaseUser?.getIdToken();
            await fetch('/api/rfa/delete-temp-file', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath: fileToRemove.uploadedData.filePath })
            });
        } catch (error) {
            console.error("Failed to delete temp file:", error);
        }
    }
    setFiles(prev => prev.filter((_, i) => i !== index));
  };


  const handleAction = async (action: string) => {
    // สำหรับ action ที่ไม่ต้องแนบไฟล์ใหม่
    const noFileActions = ['APPROVE', 'APPROVE_WITH_COMMENTS', 'REJECT', 'APPROVE_REVISION_REQUIRED'];
    if (!noFileActions.includes(action)) {
        const successfulUploads = newFiles.filter(f => f.status === 'success');
        if (successfulUploads.length === 0) {
            alert('กรุณาแนบไฟล์ใหม่สำหรับขั้นตอนนี้ก่อนดำเนินการ');
            return;
        }
    }

    setIsSubmitting(true);
    try {
      const token = await firebaseUser?.getIdToken();
      const payload = {
          action,
          comments: comment,
          newFiles: newFiles.filter(f => f.status === 'success').map(f => f.uploadedData)
      };

      const response = await fetch(`/api/rfa/${document.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (result.success) {
        alert(`ดำเนินการ "${action}" สำเร็จ!`);
        onClose();
      } else {
        throw new Error(result.error || 'เกิดข้อผิดพลาด');
      }
    } catch (error) {
      alert(`เกิดข้อผิดพลาด: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleCreateRevision = async () => {
    const successfulUploads = revisionFiles.filter(f => f.status === 'success');
    if (successfulUploads.length === 0) {
      alert('กรุณาแนบไฟล์ฉบับแก้ไขอย่างน้อย 1 ไฟล์');
      return;
    }
    setIsSubmitting(true);
    try {
      const token = await firebaseUser?.getIdToken();
      const payload = {
        originalDocId: document.id,
        uploadedFiles: successfulUploads.map(f => f.uploadedData),
        comments: revisionComment
      };

      const response = await fetch(`/api/rfa/create_revision`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (result.success) {
        alert(`สร้างเอกสารฉบับแก้ไข ${newDocumentNumber} สำเร็จ!`);
        onClose();
      } else {
        throw new Error(result.error || 'เกิดข้อผิดพลาดในการสร้าง Revision');
      }
    } catch (error) {
      alert(`เกิดข้อผิดพลาด: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResubmitRevision = async () => {
    await handleAction('SUBMIT_REVISION');
  };
  
  // --- 👇 4. สร้างตัวแปรเงื่อนไข (Conditional Flags) ---
  const { role: userRole } = user || {};
  const { status, creatorRole } = document;
  const cmSystemType = document.site?.cmSystemType || 'INTERNAL';

  // เงื่อนไขสำหรับ Site Admin
  const isSiteReviewing = userRole === 'Site Admin' && status === STATUSES.PENDING_REVIEW;
  const isSiteFinalApproving_BimFlow = userRole === 'Site Admin' && creatorRole === 'BIM' && status === STATUSES.PENDING_FINAL_APPROVAL;
  const isSiteForExternalCmFlow = userRole === 'Site Admin' && cmSystemType === 'EXTERNAL' && creatorRole === 'BIM' && status === STATUSES.SENT_TO_EXTERNAL_CM;

  // เงื่อนไขสำหรับ CM
  const isCmApproving_BimFlow = userRole === 'CM' && creatorRole === 'BIM' && status === STATUSES.PENDING_CM_APPROVAL && cmSystemType === 'INTERNAL';
  const isCmApproving_MeSnFlow = userRole === 'CM' && (creatorRole === 'ME' || creatorRole === 'SN') && status === STATUSES.PENDING_CM_APPROVAL;


  const overlayClasses = showOverlay ? 'bg-black bg-opacity-50' : ''  
 
  return (
    <>
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${overlayClasses}`}>
        {/* --- (ส่วน Header และ Content ด้านบน ไม่มีการเปลี่ยนแปลง) --- */}
        <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
          <div className="flex justify-between items-start p-4 border-b">
            {/* Left Side: Document Info */}
            <div>
              <div className="flex items-baseline space-x-3">
                <h3 className="text-lg font-bold text-blue-600">{document.documentNumber}</h3>
                <h2 className="text-xl font-semibold text-gray-800">{document.title}</h2>
              </div>
              <p className="text-xs text-gray-500 mt-1">{document.runningNumber || 'RFA Document'}</p>
            </div>

            {/* Right Side: Actions */}
            <div className="flex items-center space-x-4">
              <button
                  onClick={() => setShowHistory(true)}
                  className="flex items-center text-sm text-gray-500 hover:text-blue-600"
              >
                  <History size={16} className="mr-1"/> ดูประวัติ
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
          </div>

          <div className="p-6 overflow-y-auto space-y-6">
            <div className="bg-gray-50 p-4 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                      <strong className="text-gray-500 block mb-1">สถานะ:</strong>
                      <span 
                        className="px-3 py-1 text-xs font-bold text-white rounded-full"
                        style={{ backgroundColor: STATUS_COLORS[document.status] || '#6c757d' }}
                      >
                        {STATUS_LABELS[document.status] || document.status}
                      </span>
                  </div>
                    <div>
                        <strong className="text-gray-500 block">หมวดงาน:</strong>
                        <span>{document.category.categoryCode}</span>
                    </div>
                    {/* ✅ [ADD] เพิ่มการแสดงผลชื่อโครงการ */}
                    <div>
                        <strong className="text-gray-500 block">โครงการ:</strong>
                        <span>{document.site?.name || 'N/A'}</span>
                    </div>
                </div>

                {(displayDetailOrComment && displayDetailOrComment.trim() !== '') && (
                <div className='mt-4'>
                    <strong className="text-gray-500 block text-sm">{displayLabel}:</strong>
                    <div className="text-gray-700 whitespace-pre-wrap bg-white p-3 rounded-md mt-1 border">
                      <p className="italic">"{displayDetailOrComment}"</p>
                    </div>
                </div>
                )}
            </div>
            
            <div>
              <h4 className="text-md font-semibold mb-2 flex items-center">
                <Paperclip size={16} className="mr-2"/> ไฟล์แนบ (ฉบับล่าสุด) ({latestFiles.length})
              </h4>
              <ul className="space-y-2">
                {latestFiles.length > 0 ? (
                  latestFiles.map((file, index) => {
                    const isPdf = file.contentType === 'application/pdf' || file.fileName.toLowerCase().endsWith('.pdf');
                    const FileContent = () => (
                      <div className="flex items-center min-w-0">
                        <FileText className="w-5 h-5 text-gray-500 mr-3 flex-shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium text-blue-600 group-hover:text-blue-800 group-hover:underline truncate">{file.fileName}</span>
                          <span className="text-xs text-gray-500">{formatFileSize(file.fileSize)}</span>
                        </div>
                      </div>
                    );

                    return (
                      <li key={index} className="bg-gray-50 rounded-md">
                        {isPdf ? (
                          <button 
                            onClick={() => setPreviewFile(file)}
                            className="w-full text-left p-2 rounded-md hover:bg-blue-100 group transition-colors duration-200"
                            title={`ดูตัวอย่างไฟล์ ${file.fileName}`}
                          >
                            <FileContent />
                          </button>
                        ) : (
                          <a 
                            href={file.fileUrl} 
                            download={file.fileName}
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="w-full text-left p-2 rounded-md hover:bg-blue-100 group transition-colors duration-200 flex"
                            title={`ดาวน์โหลด ${file.fileName}`}
                          >
                            <FileContent />
                          </a>
                        )}
                      </li>
                    )
                  })
                ) : (
                  <p className="text-sm text-gray-500">ไม่มีไฟล์แนบในฉบับล่าสุด</p>
                )}
              </ul>
            </div>
          </div>
          
          {/* --- 👇 5. Action Buttons (UI ที่แก้ไขใหม่ทั้งหมด) 👇 --- */}
          <div className="p-4 border-t bg-gray-50 rounded-b-lg">
            
            {/* --- Flow: Creator (BIM/ME/SN) --- */}
            {isResubmissionFlow && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-blue-800">ส่งเอกสารที่แก้ไข (Submit Revision)</h3>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">แสดงความคิดเห็น (Optional)</label>
                  <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="เพิ่มความคิดเห็น/เหตุผลประกอบ..." className="w-full p-2 border rounded-md text-sm" rows={2}/>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">แนบไฟล์ที่แก้ไขแล้ว (จำเป็น)</label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-500 transition-colors">
                      <input type="file" multiple onChange={(e) => handleFileUpload(e, 'resubmission')} className="hidden" id="resubmit-file-upload" />
                      <label htmlFor="resubmit-file-upload" className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center">
                          <Upload size={16} className="mr-2"/>
                          คลิกเพื่อเลือกไฟล์
                      </label>
                  </div>
                  <div className="mt-2 space-y-2">
                      {newFiles.map((fileObj, index) => (
                          <div key={fileObj.id} className="flex items-center text-sm p-2 bg-gray-100 rounded">
                              <FileText className="w-4 h-4 mr-2 text-gray-500" />
                              <span className="flex-1 truncate">{fileObj.file.name}</span>
                              {fileObj.status === 'uploading' && <Spinner className="w-4 h-4 mr-2" /> }
                              {fileObj.status === 'success' && <Check className="w-4 h-4 text-green-500" />}
                              {fileObj.status === 'error' && <span title={fileObj.error}><AlertTriangle className="w-4 h-4 text-red-500" /></span>}
                              <button onClick={() => removeFile(index, 'resubmission')} className="ml-2 text-gray-500 hover:text-red-600"><X size={16} /></button>
                          </div>
                      ))}
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                      onClick={handleResubmitRevision}
                      disabled={isSubmitting || newFiles.filter(f => f.status === 'success').length === 0}
                      className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
                  >
                      {isSubmitting ? <Spinner className="w-4 h-4 mr-2" /> : <Send size={16} className="mr-2" />}
                      ส่งกลับไปตรวจสอบ
                  </button>
                </div>
              </div>
            )}

            {document.status === STATUSES.REJECTED && !document.isLatest && (
              <div className="p-4 bg-red-50 text-red-800 rounded-lg flex items-center">
                <AlertTriangle size={24} className="mr-3 flex-shrink-0 text-red-600" />
                <div>
                  <h4 className="font-bold">เอกสารฉบับนี้ถูกแทนที่แล้ว</h4>
                  <p className="text-sm text-red-700">
                    ได้มีการสร้างเอกสารฉบับใหม่ <strong>(REV-{String((document.revisionNumber || 0) + 1).padStart(2, '0')})</strong> จากเอกสารฉบับนี้แล้ว
                  </p>
                </div>
              </div>
            )}

            {isRevisionFlow && (
              <div className="p-4 border-t bg-yellow-50 rounded-b-lg">
                  <h3 className="text-lg font-bold text-yellow-800 mb-4">สร้างเอกสารฉบับแก้ไข (Create New Revision)</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <p><strong>เอกสารเดิม:</strong> {document.documentNumber}</p>
                        <p><strong>เอกสารใหม่:</strong> {newDocumentNumber}</p>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">แนบไฟล์ที่แก้ไขแล้ว (จำเป็น)</label>
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-500 transition-colors">
                            <input type="file" multiple onChange={(e) => handleFileUpload(e, 'revision')} className="hidden" id="revision-file-upload" />
                            <label htmlFor="revision-file-upload" className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center">
                                <Upload size={16} className="mr-2"/>
                                คลิกเพื่อเลือกไฟล์
                            </label>
                        </div>
                        <div className="mt-2 space-y-2">
                            {revisionFiles.map((fileObj, index) => (
                                <div key={fileObj.id} className="flex items-center text-sm p-2 bg-gray-100 rounded">
                                    <FileText className="w-4 h-4 mr-2 text-gray-500" />
                                    <span className="flex-1 truncate">{fileObj.file.name}</span>
                                    {fileObj.status === 'uploading' && <Spinner className="w-4 h-4 mr-2" /> }
                                    {fileObj.status === 'success' && <Check className="w-4 h-4 text-green-500" />}
                                    {fileObj.status === 'error' && (
                                      <span title={fileObj.error}>
                                        <AlertTriangle className="w-4 h-4 text-red-500" />
                                      </span>
                                    )}
                                    <button onClick={() => removeFile(index, 'revision')} className="ml-2 text-gray-500 hover:text-red-600"><X size={16} /></button>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">หมายเหตุการแก้ไข (Optional)</label>
                        <textarea
                            value={revisionComment}
                            onChange={(e) => setRevisionComment(e.target.value)}
                            placeholder="เช่น แก้ไขตาม Comment จาก CM..."
                            className="w-full p-2 border rounded-md text-sm"
                            rows={2}
                        />
                    </div>
                    <div className="flex justify-end">
                        <button
                            onClick={handleCreateRevision}
                            disabled={isSubmitting || revisionFiles.filter(f => f.status === 'success').length === 0}
                            className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
                        >
                            {isSubmitting ? <Spinner className="w-4 h-4 mr-2" /> : <Send size={16} className="mr-2" />}
                            ส่งเอกสารฉบับแก้ไข
                        </button>
                    </div>
                </div>
              </div>
            )}

            {/* --- Flow: Site Admin --- */}
            {(isSiteReviewing || isSiteFinalApproving_BimFlow || isSiteForExternalCmFlow) && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-blue-800">ดำเนินการ (Site Admin)</h3>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">แสดงความคิดเห็น (Optional)</label>
                  <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="เพิ่มความคิดเห็น/เหตุผลประกอบ..." className="w-full p-2 border rounded-md text-sm" rows={2}/>
                </div>
                {/* ปุ่มสำหรับ Site Admin */}
                <div className="flex flex-wrap justify-end gap-3">
                  {isSiteReviewing && (
                    <>
                      <button onClick={() => handleAction('REQUEST_REVISION')} disabled={isSubmitting} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-yellow-500 rounded-lg hover:bg-yellow-600 disabled:bg-gray-300">
                        <Edit3 size={16} className="mr-2" /> ขอแก้ไข
                      </button>
                      {cmSystemType === 'INTERNAL' ? (
                        <button onClick={() => handleAction('SEND_TO_CM')} disabled={isSubmitting} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300">
                          <Send size={16} className="mr-2" /> ส่งให้ CM
                        </button>
                      ) : (
                        <button onClick={() => handleAction('SEND_TO_EXTERNAL_CM')} disabled={isSubmitting} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 disabled:bg-gray-300">
                          <Send size={16} className="mr-2" /> ส่งให้ CM (ภายนอก)
                        </button>
                      )}
                    </>
                  )}
                  {(isSiteFinalApproving_BimFlow || isSiteForExternalCmFlow) && (
                     <>
                        <button onClick={() => handleAction('APPROVE')} disabled={isSubmitting} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-gray-300">
                          <ThumbsUp size={16} className="mr-2" /> อนุมัติ
                        </button>
                        <button onClick={() => handleAction('APPROVE_WITH_COMMENTS')} disabled={isSubmitting} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:bg-gray-300">
                          <MessageSquare size={16} className="mr-2" /> อนุมัติตามคอมเมนต์ (ไม่แก้ไข)
                        </button>
                        <button onClick={() => handleAction('APPROVE_REVISION_REQUIRED')} disabled={isSubmitting} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:bg-gray-300">
                          <Edit3 size={16} className="mr-2" /> อนุมัติตามคอมเมนต์ (ต้องแก้ไข)
                        </button>
                        <button onClick={() => handleAction('REJECT')} disabled={isSubmitting} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:bg-gray-300">
                          <ThumbsDown size={16} className="mr-2" /> ไม่อนุมัติ
                        </button>
                     </>
                  )}
                </div>
              </div>
            )}

            {/* --- Flow: CM --- */}
            {(isCmApproving_BimFlow || isCmApproving_MeSnFlow) && (
               <div className="space-y-4">
                <h3 className="text-lg font-bold text-green-800">ดำเนินการ (CM)</h3>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">แสดงความคิดเห็น (Optional)</label>
                  <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="เพิ่มความคิดเห็น/เหตุผลประกอบ..." className="w-full p-2 border rounded-md text-sm" rows={2}/>
                </div>
                <div className="flex flex-wrap justify-end gap-3">
                    <button onClick={() => handleAction('APPROVE')} disabled={isSubmitting} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-gray-300">
                      <ThumbsUp size={16} className="mr-2" /> อนุมัติ
                    </button>
                    <button onClick={() => handleAction('APPROVE_WITH_COMMENTS')} disabled={isSubmitting} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:bg-gray-300">
                      <MessageSquare size={16} className="mr-2" /> อนุมัติตามคอมเมนต์
                    </button>
                    <button onClick={() => handleAction('REJECT')} disabled={isSubmitting} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:bg-gray-300">
                      <ThumbsDown size={16} className="mr-2" /> ไม่อนุมัติ
                    </button>
                </div>
              </div>
            )}
            
          </div>
        </div>
      </div>
      {showHistory && (
        <WorkflowHistoryModal 
            workflow={document.workflow || []} 
            onClose={() => setShowHistory(false)} 
            userRole={user?.role}
        />
      )}
       <PDFPreviewModal
            isOpen={!!previewFile}
            file={previewFile}
            onClose={() => setPreviewFile(null)}
        />
    </>
  )
}