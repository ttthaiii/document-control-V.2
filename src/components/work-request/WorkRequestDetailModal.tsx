'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/auth/useAuth';
import { WorkRequest, WorkRequestStatus } from '@/types/work-request';
import Spinner from '@/components/shared/Spinner';
import { RFAFile } from '@/types/rfa';
import { X, Paperclip, ThumbsUp, Send, Upload, FileText, Check, AlertTriangle, Download, CornerUpLeft } from 'lucide-react';
import { ROLES, REVIEWER_ROLES } from '@/lib/config/workflow';
import { useNotification } from '@/lib/context/NotificationContext';

// --- Helper Functions ---

const formatFileSize = (bytes: number): string => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatDate = (date: any) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const getStatusStyles = (status: WorkRequestStatus) => {
    switch (status) {
        case WorkRequestStatus.PENDING_BIM: return { text: 'รอ BIM รับงาน', color: 'bg-blue-100 text-blue-800' };
        case WorkRequestStatus.IN_PROGRESS: return { text: 'กำลังดำเนินการ', color: 'bg-yellow-100 text-yellow-800' };
        case WorkRequestStatus.PENDING_ACCEPTANCE: return { text: 'รอ Site ตรวจรับ', color: 'bg-purple-100 text-purple-800' };
        case WorkRequestStatus.REVISION_REQUESTED: return { text: 'ขอแก้ไข', color: 'bg-orange-100 text-orange-800' };
        case WorkRequestStatus.COMPLETED: return { text: 'เสร็จสิ้น', color: 'bg-green-100 text-green-800' };
        default: return { text: status, color: 'bg-gray-100 text-gray-800' };
    }
};

// --- Interfaces ---

interface UploadedFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  uploadedData?: RFAFile;
  error?: string;
}

interface WorkRequestDetailModalProps {
  documentId: string | null;
  onClose: () => void;
  onUpdate: () => void;
}

// --- Main Component ---

export default function WorkRequestDetailModal({ documentId, onClose, onUpdate }: WorkRequestDetailModalProps) {
    const { user, firebaseUser } = useAuth();
    const { showNotification } = useNotification();
    const [document, setDocument] = useState<WorkRequest | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // States for various action panels
    const [actionComment, setActionComment] = useState('');
    const [actionFiles, setActionFiles] = useState<UploadedFile[]>([]);

    // Determine user permissions based on role and document status
    const canSubmitWork = user?.role === ROLES.BIM && (document?.status === WorkRequestStatus.IN_PROGRESS || document?.status === WorkRequestStatus.REVISION_REQUESTED);
    const canSiteReview = user && REVIEWER_ROLES.includes(user.role) && document?.status === WorkRequestStatus.PENDING_ACCEPTANCE;

    // Memoize the latest files from the workflow
    const latestFiles = useMemo(() => {
        if (!document?.workflow || document.workflow.length === 0) {
            return [];
        }
        const reversedWorkflow = [...document.workflow].reverse();
        const latestStepWithFiles = reversedWorkflow.find(step => step.files && step.files.length > 0);
        
        return latestStepWithFiles?.files || [];
    }, [document]);

    // Fetch full document details on mount
    useEffect(() => {
        const fetchDocument = async () => {
            if (!documentId || !firebaseUser) return;
            setLoading(true);
            try {
                const token = await firebaseUser.getIdToken();
                const response = await fetch(`/api/work-request/${documentId}`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                const result = await response.json();
                if (result.success) setDocument(result.document);
                else throw new Error(result.error);
            } catch (error) {
                showNotification('error', 'เกิดข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลเอกสารได้');
                onClose();
            } finally {
                setLoading(false);
            }
        };
        fetchDocument();
    }, [documentId, firebaseUser, showNotification, onClose]);

    // Generic file upload handler
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
                return { status: 'success', uploadedData: result.fileData };
            } else {
                throw new Error(result.error || 'อัปโหลดล้มเหลว');
            }
        } catch (err) {
            return { status: 'error', error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' };
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;
        const newUploads: UploadedFile[] = files.map(file => ({
          id: `${file.name}-${Date.now()}`,
          file,
          status: 'pending',
        }));
        setActionFiles(prev => [...prev, ...newUploads]);
        for (const fileObj of newUploads) {
          setActionFiles(prev => prev.map(f => f.id === fileObj.id ? { ...f, status: 'uploading' } : f));
          const result = await uploadTempFile(fileObj.file);
          setActionFiles(prev => prev.map(f => f.id === fileObj.id ? { ...f, ...result } : f));
        }
        event.target.value = '';
    };

    const removeFile = (fileId: string) => {
        setActionFiles(prev => prev.filter(f => f.id !== fileId));
    };

    // Action Handlers
    const handleBimAction = async (action: 'SUBMIT_WORK') => { // เอา 'ACCEPT_WORK' ออก
        if (!document || !firebaseUser) return;
        setIsSubmitting(true);
        
        let endpoint = `/api/work-request/${document.id}/update`;
        let payload: any = { action };

        // ลบเงื่อนไข if (action === 'ACCEPT_WORK') ออกทั้งหมด
        if (action === 'SUBMIT_WORK') {
            const successfulFiles = actionFiles.filter(f => f.status === 'success');
            if (successfulFiles.length === 0) {
                alert("กรุณาแนบไฟล์ผลงานอย่างน้อย 1 ไฟล์");
                setIsSubmitting(false);
                return;
            }
            payload.payload = {
                comments: actionComment,
                files: successfulFiles.map(f => f.uploadedData)
            };
        }

        try {
            // ... (Logic การยิง API ที่เหลือเหมือนเดิม) ...
        } catch (error) {
            // ...
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSiteAction = async (action: 'COMPLETE' | 'REQUEST_REVISION') => {
        if (!document || !firebaseUser) return;
        setIsSubmitting(true);
        try {
            const token = await firebaseUser.getIdToken();
            const response = await fetch(`/api/work-request/${document.id}/update`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action,
                    payload: { comments: actionComment }
                }),
            });
            const result = await response.json();
            if (result.success) {
                showNotification('success', 'ดำเนินการสำเร็จ', `สถานะถูกเปลี่ยนเป็น: ${getStatusStyles(result.newStatus).text}`);
                onUpdate();
                onClose();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            showNotification('error', 'เกิดข้อผิดพลาด', error instanceof Error ? error.message : 'Failed to perform action');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Render Logic
    if (loading) {
        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
            <Spinner className="w-12 h-12 text-white" />
          </div>
        );
    }

    if (!document) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-50 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-start p-4 border-b bg-white">
                    <div>
                        <h3 className="text-lg font-bold text-blue-600">{document.documentNumber}</h3>
                        <h2 className="text-xl font-semibold text-gray-800">{document.taskName}</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
                </div>
                <div className="p-6 overflow-y-auto space-y-6 flex-1">
                    <div className="p-4 bg-white rounded-lg border">
                        <p><strong>รายละเอียด:</strong> {document.description || '-'}</p>
                    </div>
                    <div>
                        <h4 className="text-md font-semibold mb-2 flex items-center text-slate-800">
                            <Paperclip size={16} className="mr-2"/> ไฟล์แนบ (ล่าสุด)
                        </h4>
                        <ul className="space-y-2">
                            {latestFiles.length > 0 ? (
                                latestFiles.map((file, index) => (
                                    <li key={index}>
                                        <a
                                            href={file.fileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-between p-2 bg-slate-100 border border-slate-200 rounded-md hover:bg-slate-200 transition-colors group"
                                        >
                                            <div className="flex items-center min-w-0">
                                                <FileText className="w-5 h-5 text-gray-500 mr-3 flex-shrink-0" />
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-sm font-medium text-blue-600 group-hover:underline truncate">{file.fileName}</span>
                                                    <span className="text-xs text-gray-500">{formatFileSize(file.fileSize || file.size)}</span>
                                                </div>
                                            </div>
                                            <Download className="w-5 h-5 text-gray-400 group-hover:text-gray-600 ml-4 flex-shrink-0" />
                                        </a>
                                    </li>
                                ))
                            ) : (
                                <p className="text-sm text-gray-500 italic">ไม่มีไฟล์แนบในขั้นตอนล่าสุด</p>
                            )}
                        </ul>
                    </div>
                </div>

                {/* --- Action Panels --- */}

                {canSiteReview && (
                    <div className="p-6 border-t bg-white rounded-b-lg space-y-4">
                        <h3 className="text-lg font-bold text-slate-800">ดำเนินการ (สำหรับ Site)</h3>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ / คอมเมนต์ (ถ้ามี)</label>
                            <textarea value={actionComment} onChange={(e) => setActionComment(e.target.value)} rows={3} placeholder="หากต้องการให้แก้ไข กรุณาใส่รายละเอียด..." className="w-full p-2 border rounded-md" />
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                onClick={() => handleSiteAction('REQUEST_REVISION')}
                                disabled={isSubmitting}
                                className="flex items-center px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:bg-orange-300"
                            >
                                <CornerUpLeft size={16} className="mr-2" />
                                {isSubmitting ? 'กำลังส่ง...' : 'ส่งกลับให้แก้ไข'}
                            </button>
                            <button
                                onClick={() => handleSiteAction('COMPLETE')}
                                disabled={isSubmitting}
                                className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-green-300"
                            >
                                <Check size={16} className="mr-2" />
                                {isSubmitting ? 'กำลังปิดงาน...' : 'ตรวจรับและปิดงาน'}
                            </button>
                        </div>
                    </div>
                )}

                {canSubmitWork && (
                    <div className="p-6 border-t bg-white rounded-b-lg space-y-4">
                        <h3 className="text-lg font-bold text-slate-800">ส่งมอบงาน (Submit Work)</h3>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">แนบไฟล์ผลงาน <span className="text-red-500">*</span></label>
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-500 transition-colors">
                                <input type="file" multiple onChange={handleFileUpload} id="submit-file-upload" className="hidden"/>
                                <label htmlFor="submit-file-upload" className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center">
                                    <Upload size={16} className="mr-2"/> คลิกเพื่อเลือกไฟล์
                                </label>
                            </div>
                            {actionFiles.length > 0 && (
                                <div className="mt-2 space-y-2">
                                    {actionFiles.map((fileObj) => (
                                    <div key={fileObj.id} className="flex items-center text-sm p-2 bg-gray-100 rounded">
                                        <FileText className="w-4 h-4 mr-3 text-gray-500" />
                                        <span className="flex-1 truncate">{fileObj.file.name}</span>
                                        <div className="flex items-center ml-3">
                                            {fileObj.status === 'uploading' && <Spinner className="w-4 h-4" />}
                                            {fileObj.status === 'success' && <Check className="w-4 h-4 text-green-500" />}
                                            {fileObj.status === 'error' && ( <span title={fileObj.error}><AlertTriangle className="w-4 h-4 text-red-500" /></span> )}
                                            <button type="button" onClick={() => removeFile(fileObj.id)} className="ml-3 text-gray-500 hover:text-red-600"><X size={16} /></button>
                                        </div>
                                    </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ / คอมเมนต์ (ถ้ามี)</label>
                            <textarea value={actionComment} onChange={(e) => setActionComment(e.target.value)} rows={3} placeholder="อธิบายรายละเอียดการทำงาน..." className="w-full p-2 border rounded-md" />
                        </div>
                        <div className="flex justify-end pt-2">
                            <button
                                onClick={() => handleBimAction('SUBMIT_WORK')}
                                disabled={actionFiles.filter(f => f.status === 'success').length === 0 || isSubmitting}
                                className="flex items-center px-6 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-green-300"
                            >
                                {isSubmitting ? <Spinner className="w-5 h-5 mr-2" /> : <Send size={16} className="mr-2" />}
                                {isSubmitting ? 'กำลังส่งงาน...' : 'ส่งงานให้ Site ตรวจรับ'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}