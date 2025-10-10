// src/components/work-request/WorkRequestDetailModal.tsx (UI ปรับปรุงใหม่)
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/auth/useAuth';
import { WorkRequest, WorkRequestStatus, WorkRequestWorkflowStep } from '@/types/work-request';
import Spinner from '@/components/shared/Spinner';
import { RFAFile } from '@/types/rfa';
import { X, Paperclip, Send, Upload, FileText, Check, AlertTriangle, Download, CornerUpLeft, History } from 'lucide-react';
import { ROLES, REVIEWER_ROLES } from '@/lib/config/workflow';
import { useNotification } from '@/lib/context/NotificationContext';

// --- Helper Functions (ปรับปรุงเล็กน้อย) ---
const formatFileSize = (bytes: number): string => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatDate = (date: any, includeTime = true) => {
    if (!date) return 'N/A';

    let d: Date;
    // ตรวจสอบว่า date เป็น Object ที่มี _seconds (รูปแบบจาก Firestore) หรือไม่
    if (date && typeof date === 'object' && '_seconds' in date) {
        d = new Date(date._seconds * 1000);
    } else {
        d = new Date(date);
    }

    if (isNaN(d.getTime())) {
        return 'Invalid Date';
    }

    const options: Intl.DateTimeFormatOptions = {
        day: '2-digit', month: 'short', year: 'numeric',
    };
    if (includeTime) {
        options.hour = '2-digit';
        options.minute = '2-digit';
    }
    return d.toLocaleString('th-TH', options);
};

const getStatusStyles = (status: WorkRequestStatus) => {
    switch (status) {
        case WorkRequestStatus.PENDING_BIM: return { text: 'รอ BIM รับงาน', color: '#0088FE' };
        case WorkRequestStatus.IN_PROGRESS: return { text: 'กำลังดำเนินการ', color: '#FFBB28' };
        case WorkRequestStatus.PENDING_ACCEPTANCE: return { text: 'รอ Site ตรวจรับ', color: '#AF19FF' };
        case WorkRequestStatus.REVISION_REQUESTED: return { text: 'ขอแก้ไข', color: '#FF8042' };
        case WorkRequestStatus.COMPLETED: return { text: 'เสร็จสิ้น', color: '#28A745' };
        default: return { text: status, color: '#6c757d' };
    }
};

const WorkflowHistoryModal = ({ workflow, onClose }: { workflow: WorkRequestWorkflowStep[], onClose: () => void }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center p-4 border-b">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center">
                        <History size={20} className="mr-2"/>
                        ประวัติ Work Request
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
                </div>
                <div className="p-6 overflow-y-auto">
                    <div className="border-l-2 border-gray-200 ml-2">
                        {workflow.length > 0 ? (
                            workflow.map((item, index) => (
                            <div key={index} className="relative pl-6 pb-8 last:pb-0">
                                <div className="absolute -left-[9px] top-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-white"></div>
                                <p className="font-semibold text-gray-800">{getStatusStyles(item.status).text}</p>
                                <p className="text-sm text-gray-600">โดย: {item.userName} ({item.role})</p>
                                <time className="text-xs text-gray-400">{formatDate(item.timestamp)}</time>
                                {item.comments && (
                                    <div className="mt-2 p-2 bg-gray-50 rounded-md text-xs italic">
                                        <p className="text-gray-600">"{item.comments}"</p>
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
    const [actionComment, setActionComment] = useState('');
    const [actionFiles, setActionFiles] = useState<UploadedFile[]>([]);
    const [showHistory, setShowHistory] = useState(false);

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
    const handleBimAction = async (action: 'SUBMIT_WORK') => {
        if (!document || !firebaseUser) return;
        setIsSubmitting(true);
        try {
            const token = await firebaseUser.getIdToken();
            const successfulFiles = actionFiles.filter(f => f.status === 'success');
            if (successfulFiles.length === 0) {
                showNotification('warning', 'กรุณาแนบไฟล์', 'ต้องแนบไฟล์ผลงานอย่างน้อย 1 ไฟล์');
                setIsSubmitting(false);
                return;
            }
            const payload = {
                action,
                payload: {
                    comments: actionComment,
                    files: successfulFiles.map(f => f.uploadedData)
                }
            };
            const response = await fetch(`/api/work-request/${document.id}/update`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
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
            showNotification('error', 'เกิดข้อผิดพลาด', error instanceof Error ? error.message : 'Unknown error');
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

    if (loading) {
        return <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"><Spinner className="w-12 h-12 text-white" /></div>;
    }
    if (!document) return null;

    const statusStyle = getStatusStyles(document.status);

    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                    {/* Header */}
                    <div className="flex justify-between items-start p-4 border-b">
                        <div>
                            <div className="flex items-baseline space-x-3">
                                <h3 className="text-lg font-bold text-blue-600">{document.documentNumber}</h3>
                                <h2 className="text-xl font-semibold text-gray-800">{document.taskName}</h2>
                            </div>
                        </div>
                        <div className="flex items-center space-x-4">
                            <button onClick={() => setShowHistory(true)} className="flex items-center text-sm text-gray-500 hover:text-blue-600"><History size={16} className="mr-1"/> ดูประวัติ</button>
                            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="p-6 overflow-y-auto space-y-6">
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                    <strong className="text-gray-500 block mb-1">สถานะ:</strong>
                                    <span className="px-3 py-1 text-xs font-bold text-white rounded-full" style={{ backgroundColor: statusStyle.color }}>{statusStyle.text}</span>
                                </div>
                                <div><strong className="text-gray-500 block">โครงการ:</strong><span>{document.site?.name || 'N/A'}</span></div>
                                <div><strong className="text-gray-500 block">วันที่เริ่ม (แผน):</strong><span>{formatDate(document.planStartDate, false)}</span></div>
                                <div><strong className="text-gray-500 block">วันที่กำหนดส่ง:</strong><span>{formatDate(document.dueDate, false)}</span></div>
                            </div>
                            {document.description && (
                            <div className='mt-4'>
                                <strong className="text-gray-500 block text-sm">รายละเอียด:</strong>
                                <div className="text-gray-700 whitespace-pre-wrap bg-white p-3 rounded-md mt-1 border"><p className="italic">"{document.description}"</p></div>
                            </div>
                            )}
                        </div>
                        
                        <div>
                            <h4 className="text-md font-semibold mb-2 flex items-center text-slate-800"><Paperclip size={16} className="mr-2"/> ไฟล์แนบ</h4>
                            <ul className="space-y-2">
                                {document.files.length > 0 ? document.files.map((file, index) => (
                                    <li key={index}>
                                        <a href={file.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-2 bg-slate-100 border border-slate-200 rounded-md hover:bg-slate-200 transition-colors group">
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
                                )) : <p className="text-sm text-gray-500 italic">ไม่มีไฟล์แนบ</p>}
                            </ul>
                        </div>
                    </div>
                    
                    {/* Action Panels */}
                    {(canSiteReview || canSubmitWork) && (
                    <div className="p-4 border-t bg-slate-50">
                        {canSiteReview && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-bold text-slate-800">ดำเนินการ (สำหรับ Site)</h3>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ / คอมเมนต์ (ถ้ามี)</label>
                                    <textarea value={actionComment} onChange={(e) => setActionComment(e.target.value)} rows={3} placeholder="หากต้องการให้แก้ไข กรุณาใส่รายละเอียด..." className="w-full p-2 border rounded-md" />
                                </div>
                                <div className="flex justify-end gap-3 pt-2">
                                    <button onClick={() => handleSiteAction('REQUEST_REVISION')} disabled={isSubmitting} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:bg-orange-300"><CornerUpLeft size={16} className="mr-2" />{isSubmitting ? 'กำลังส่ง...' : 'ส่งกลับให้แก้ไข'}</button>
                                    <button onClick={() => handleSiteAction('COMPLETE')} disabled={isSubmitting} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-green-300"><Check size={16} className="mr-2" />{isSubmitting ? 'กำลังปิดงาน...' : 'ตรวจรับและปิดงาน'}</button>
                                </div>
                            </div>
                        )}
                        {canSubmitWork && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-bold text-slate-800">ส่งมอบงาน (Submit Work)</h3>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">แนบไฟล์ผลงาน <span className="text-red-500">*</span></label>
                                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-500 transition-colors">
                                        <input type="file" multiple onChange={handleFileUpload} id="submit-file-upload" className="hidden"/>
                                        <label htmlFor="submit-file-upload" className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center"><Upload size={16} className="mr-2"/> คลิกเพื่อเลือกไฟล์</label>
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
                                    <button onClick={() => handleBimAction('SUBMIT_WORK')} disabled={actionFiles.filter(f => f.status === 'success').length === 0 || isSubmitting} className="flex items-center px-6 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-green-300">{isSubmitting ? <Spinner className="w-5 h-5 mr-2" /> : <Send size={16} className="mr-2" />}{isSubmitting ? 'กำลังส่งงาน...' : 'ส่งงานให้ Site ตรวจรับ'}</button>
                                </div>
                            </div>
                        )}
                    </div>
                    )}
                </div>
            </div>
            {showHistory && <WorkflowHistoryModal workflow={document.workflow || []} onClose={() => setShowHistory(false)} />}
        </>
    );
}