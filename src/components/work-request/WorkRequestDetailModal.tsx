// src/components/work-request/WorkRequestDetailModal.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/auth/useAuth';
import { WorkRequest, WorkRequestWorkflowStep } from '@/types/work-request';
import { WorkRequestStatus } from '@/lib/config/workflow';
import Spinner from '@/components/shared/Spinner';
import { RFAFile } from '@/types/rfa';
import {
    X, Paperclip, Send, Upload, FileText, Check, AlertTriangle,
    Download, CornerUpLeft, History, Edit, Edit2, ThumbsUp, ThumbsDown,
    Eye, Trash2
} from 'lucide-react'; // ✅ ใช้ Edit2 แทน Pencil, เพิ่ม Trash2
import { ROLES, REVIEWER_ROLES, WR_STATUSES, WR_APPROVER_ROLES, STATUS_LABELS, STATUS_COLORS } from '@/lib/config/workflow';
import { useNotification } from '@/lib/context/NotificationContext';
import PDFPreviewModal from '@/components/rfa/PDFPreviewModal';
import { storage } from '@/lib/firebase/client';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

// --- Helper Functions ---
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
    if (date && typeof date === 'object' && '_seconds' in date) {
        d = new Date(date._seconds * 1000);
    } else {
        d = new Date(date);
    }
    if (isNaN(d.getTime())) return 'Invalid Date';
    const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
    if (includeTime) {
        options.hour = '2-digit';
        options.minute = '2-digit';
    }
    return d.toLocaleString('th-TH', options);
};

const getStatusStyles = (status: WorkRequestStatus | string) => {
    const label = STATUS_LABELS[status] || status;
    const color = STATUS_COLORS[status] || '#6c757d';
    return { text: label, color: color };
};

const WorkflowHistoryModal = ({ workflow, onClose }: { workflow: WorkRequestWorkflowStep[], onClose: () => void }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center p-4 border-b">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center"><History size={20} className="mr-2" />ประวัติ Work Request</h3>
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
    customName?: string;
}

interface WorkRequestDetailModalProps {
    documentId: string | null; onClose: () => void; onUpdate: () => void;
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
    const [revisionComment, setRevisionComment] = useState('');
    const [revisionFiles, setRevisionFiles] = useState<UploadedFile[]>([]);
    const [isVerifyingTask, setIsVerifyingTask] = useState(false);
    const [isTaskVerified, setIsTaskVerified] = useState(false);
    const [verificationError, setVerificationError] = useState<string | null>(null);
    const [verifiedTaskId, setVerifiedTaskId] = useState<string | null>(null);
    const [rejectComment, setRejectComment] = useState('');

    // State สำหรับ PDF Viewer (single mode)
    const [pdfFile, setPdfFile] = useState<RFAFile | null>(null);

    // State สำหรับการแก้ไขชื่อไฟล์
    const [editingFileId, setEditingFileId] = useState<string | null>(null);
    const [tempFileName, setTempFileName] = useState('');

    const canSubmitWork = user?.role === ROLES.BIM && document?.status === WR_STATUSES.IN_PROGRESS;
    const canSiteReview = user && REVIEWER_ROLES.includes(user.role) && document?.status === WR_STATUSES.PENDING_ACCEPTANCE;
    const isRevisionFlow = user?.role === ROLES.BIM && document?.status === WR_STATUSES.REVISION_REQUESTED;
    const canPmApprove = user && WR_APPROVER_ROLES.includes(user.role) && document?.status === WR_STATUSES.DRAFT;

    const newRevisionNumber = useMemo(() => (document?.revisionNumber || 0) + 1, [document]);
    const newDocumentNumber = useMemo(() => {
        if (!document) return '';
        return `${document.documentNumber.split('-REV')[0]}-REV${String(newRevisionNumber).padStart(2, '0')}`;
    }, [document, newRevisionNumber]);

    const currentStepFiles = useMemo(() => {
        if (!document || !document.workflow) return [];
        const currentStep = document.workflow.find(step => step.status === document.status);
        return currentStep?.files || [];
    }, [document]);

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

    useEffect(() => {
        if (isRevisionFlow && firebaseUser && document) {
            const verifyTask = async () => {
                if (!document.site?.name || !document.documentNumber || !document.taskData?.taskName) {
                    setVerificationError("ข้อมูลเอกสารไม่สมบูรณ์ ไม่สามารถตรวจสอบ Task ได้");
                    return;
                }
                setIsVerifyingTask(true);
                setIsTaskVerified(false);
                setVerificationError(null);
                setVerifiedTaskId(null);
                try {
                    const token = await firebaseUser.getIdToken();
                    const response = await fetch('/api/bim-tracking/verify-task', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            documentNumber: document.documentNumber.split('-REV')[0],
                            projectName: document.site.name,
                            rev: newRevisionNumber,
                            taskName: document.taskData.taskName,
                        }),
                    });
                    const result = await response.json();
                    if (response.ok && result.success) {
                        if (result.exists) {
                            setIsTaskVerified(true);
                            setVerifiedTaskId(result.taskId);
                        } else {
                            setVerificationError('กรุณาสร้าง Task สำหรับ Revision นี้ในระบบ BIM Tracking ก่อน');
                        }
                    } else {
                        throw new Error(result.error || 'ไม่สามารถตรวจสอบ Task ได้');
                    }
                } catch (error: any) {
                    setVerificationError(error.message);
                } finally {
                    setIsVerifyingTask(false);
                }
            };
            verifyTask();
        }
    }, [isRevisionFlow, document, firebaseUser, newRevisionNumber]);

    const uploadTempFile = (fileObj: UploadedFile, target: 'action' | 'revision') => {
        return new Promise<void>((resolve, reject) => {
            if (!user?.id) {
                reject(new Error('User ID not found for upload.'));
                return;
            }

            const timestamp = Date.now();
            const originalName = fileObj.file.name || "file";
            const tempPath = `temp/${user.id}/${timestamp}_${originalName}`;
            const storageRef = ref(storage, tempPath);

            const uploadTask = uploadBytesResumable(storageRef, fileObj.file, {
                contentType: fileObj.file.type || "application/octet-stream",
            });

            const setFiles = target === 'revision' ? setRevisionFiles : setActionFiles;

            uploadTask.on(
                'state_changed',
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setFiles(prev => prev.map(f => f.id === fileObj.id ? { ...f, progress, status: 'uploading' } : f));
                },
                (error) => {
                    console.error("Storage upload error:", error);
                    setFiles(prev => prev.map(f => f.id === fileObj.id ? { ...f, status: 'error', error: error.message } : f));
                    reject(error);
                },
                async () => {
                    try {
                        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);

                        const uploadedData: RFAFile = {
                            fileName: originalName,
                            fileUrl: downloadUrl,
                            filePath: tempPath,
                            size: fileObj.file.size,
                            contentType: fileObj.file.type,
                            fileSize: fileObj.file.size,
                            uploadedAt: new Date().toISOString(),
                            uploadedBy: user.email || 'Unknown User'
                        };

                        setFiles(prev => prev.map(f => f.id === fileObj.id ? { ...f, status: 'success', progress: 100, uploadedData } : f));
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                }
            );
        });
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, target: 'action' | 'revision') => {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;
        processFiles(files, target);
        event.target.value = '';
    };

    const startRenaming = (fileObj: UploadedFile) => {
        setEditingFileId(fileObj.id);
        const currentName = fileObj.customName || fileObj.uploadedData?.fileName || fileObj.file.name;
        setTempFileName(currentName);
    };

    const saveRename = (fileId: string, target: 'action' | 'revision') => {
        const setFiles = target === 'revision' ? setRevisionFiles : setActionFiles;
        setFiles(prev => prev.map(f => {
            if (f.id === fileId) {
                const updatedData = f.uploadedData ? { ...f.uploadedData, fileName: tempFileName } : undefined;
                return { ...f, customName: tempFileName, uploadedData: updatedData };
            }
            return f;
        }));
        setEditingFileId(null);
    };

    const cancelRename = () => {
        setEditingFileId(null);
        setTempFileName('');
    };

    const handleLocalPreview = (fileObj: UploadedFile) => {
        const objectUrl = URL.createObjectURL(fileObj.file);
        const isPdf = fileObj.file.type === 'application/pdf' || fileObj.file.name.toLowerCase().endsWith('.pdf');

        if (isPdf) {
            const mockFile: RFAFile = {
                fileName: fileObj.customName || fileObj.uploadedData?.fileName || fileObj.file.name,
                fileUrl: objectUrl,
                filePath: '',
                size: fileObj.file.size,
                fileSize: fileObj.file.size,
                contentType: fileObj.file.type,
                uploadedAt: new Date().toISOString(),
                uploadedBy: user?.id || ''
            };
            setPdfFile(mockFile);
        } else {
            window.open(objectUrl, '_blank');
        }
    };

    const processFiles = (files: File[], target: 'action' | 'revision') => {
        const newUploads: UploadedFile[] = files.map(file => ({ id: `${file.name}-${Date.now()}`, file, status: 'pending' }));
        const setFiles = target === 'revision' ? setRevisionFiles : setActionFiles;

        // Add pending files to state first
        setFiles(prev => [...prev, ...newUploads]);

        // Start upload for each file
        newUploads.forEach(fileObj => {
            uploadTempFile(fileObj, target).catch(err => console.error("Upload failed for", fileObj.file.name, err));
        });
    }

    const removeFile = async (fileId: string, target: 'action' | 'revision') => {
        const files = target === 'revision' ? revisionFiles : actionFiles;
        const setFiles = target === 'revision' ? setRevisionFiles : setActionFiles;
        const fileToRemove = files.find(f => f.id === fileId);

        if (fileToRemove?.status === 'success' && fileToRemove.uploadedData?.filePath) {
            try {
                // Delete from Firebase Storage directly
                const fileRef = ref(storage, fileToRemove.uploadedData.filePath);
                await deleteObject(fileRef);
            } catch (error) {
                console.error("Failed to delete temp file from storage:", error);
            }
        }
        setFiles(prev => prev.filter(f => f.id !== fileId));
    };

    const handleAnnotateSave = async (editedFile: File) => {
        console.log("Annotated File Received:", editedFile);
        let target: 'action' | 'revision' = 'action';
        if (isRevisionFlow) target = 'revision';

        await processFiles([editedFile], target);
        showNotification('success', 'บันทึกและแนบไฟล์เรียบร้อย', 'ไฟล์ที่คุณแก้ไขถูกแนบในรายการเตรียมส่งแล้ว');
        setPdfFile(null);
    };

    const handleBimAction = async (action: any) => {
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

    const handleSiteAction = async (action: any) => {
        if (!document || !firebaseUser) return;
        setIsSubmitting(true);
        try {
            const token = await firebaseUser.getIdToken();
            const successfulFiles = actionFiles.filter(f => f.status === 'success');

            const response = await fetch(`/api/work-request/${document.id}/update`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action,
                    payload: {
                        comments: actionComment,
                        files: successfulFiles.map(f => f.uploadedData)
                    }
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

    const handleCreateRevision = async () => {
        const successfulUploads = revisionFiles.filter(f => f.status === 'success');
        if (successfulUploads.length === 0) {
            showNotification('warning', 'กรุณาแนบไฟล์', 'ต้องแนบไฟล์ฉบับแก้ไขอย่างน้อย 1 ไฟล์');
            return;
        }
        if (!verifiedTaskId) {
            showNotification('error', 'Task ไม่ถูกต้อง', 'ไม่พบ Task ID ที่ตรวจสอบแล้ว');
            return;
        }
        setIsSubmitting(true);
        try {
            const token = await firebaseUser?.getIdToken();
            const payload = {
                originalDocId: document!.id,
                uploadedFiles: successfulUploads.map(f => f.uploadedData),
                comments: revisionComment,
                verifiedTaskId: verifiedTaskId,
            };
            const response = await fetch(`/api/work-request/create_revision`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const result = await response.json();
            if (result.success) {
                showNotification('success', 'สร้าง Revision สำเร็จ!', `เอกสารฉบับใหม่ ${result.newDocumentNumber} ถูกส่งให้ Site ตรวจสอบแล้ว`);
                onUpdate();
                onClose();
            } else {
                throw new Error(result.error || 'เกิดข้อผิดพลาดในการสร้าง Revision');
            }
        } catch (error) {
            showNotification('error', 'เกิดข้อผิดพลาด', error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePmAction = async (action: any) => {
        if (!document || !firebaseUser) return;
        if (action === 'REJECT_DRAFT' && !rejectComment.trim()) {
            showNotification('warning', 'กรุณากรอกเหตุผล', 'ต้องระบุเหตุผลในการไม่อนุมัติ');
            return;
        }
        setIsSubmitting(true);
        try {
            const token = await firebaseUser.getIdToken();
            const response = await fetch(`/api/work-request/${document.id}/update`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action,
                    payload: { comments: rejectComment }
                }),
            });
            const result = await response.json();
            if (result.success) {
                showNotification('success', 'ดำเนินการสำเร็จ', `สถานะถูกเปลี่ยนเป็น: ${getStatusStyles(result.newStatus).text}`);
                onUpdate();
                onClose();
            } else {
                throw new Error(result.error || 'เกิดข้อผิดพลาดในการดำเนินการ');
            }
        } catch (error) {
            showNotification('error', 'เกิดข้อผิดพลาด', error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"><Spinner className="w-12 h-12 text-white" /></div>;
    if (!document) return null;

    const statusStyle = getStatusStyles(document.status);

    const renderEditableFileList = (files: UploadedFile[], target: 'action' | 'revision') => (
        <div className="mt-2 space-y-2">
            {files.map((fileObj) => (
                <div key={fileObj.id} className="flex items-center text-sm p-2 bg-gray-100 rounded border border-gray-200 group">
                    <FileText className="w-4 h-4 mr-3 text-gray-500 flex-shrink-0" />

                    {/* --- โหมดแก้ไขชื่อ (Editing Mode) --- */}
                    {editingFileId === fileObj.id ? (
                        <div className="flex-1 flex items-center gap-2 min-w-0 bg-white p-1 rounded border border-blue-300 ring-2 ring-blue-100">
                            <input
                                type="text"
                                value={tempFileName}
                                onChange={(e) => setTempFileName(e.target.value)}
                                className="flex-1 p-1 text-sm outline-none bg-white text-gray-900"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') { e.preventDefault(); saveRename(fileObj.id, target); }
                                    if (e.key === 'Escape') cancelRename();
                                }}
                            />
                            <div className="flex items-center border-l pl-1 space-x-1">
                                <button
                                    onClick={() => saveRename(fileObj.id, target)}
                                    className="p-1 hover:bg-green-100 text-green-600 rounded transition-colors"
                                    title="บันทึกชื่อ"
                                >
                                    <Check size={16} />
                                </button>
                                <button
                                    onClick={cancelRename}
                                    className="p-1 hover:bg-red-100 text-red-500 rounded transition-colors"
                                    title="ยกเลิก"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* --- โหมดแสดงผลปกติ (View Mode) --- */
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span
                                onClick={() => handleLocalPreview(fileObj)}
                                className="truncate cursor-pointer text-blue-600 hover:underline font-medium"
                                title="คลิกเพื่อดูตัวอย่าง"
                            >
                                {fileObj.customName || fileObj.uploadedData?.fileName || fileObj.file.name}
                            </span>

                            <button
                                onClick={() => startRenaming(fileObj)}
                                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-blue-600 rounded transition-all"
                                title="เปลี่ยนชื่อไฟล์"
                            >
                                <Edit2 size={14} />
                            </button>
                        </div>
                    )}

                    {/* 🔥 ส่วนสถานะและปุ่มลบไฟล์ */}
                    {editingFileId !== fileObj.id && (
                        <div className="flex items-center ml-3 space-x-3">
                            <div className="flex items-center">
                                {fileObj.status === 'uploading' && <Spinner className="w-4 h-4 text-blue-500" />}
                                {fileObj.status === 'success' && <Check className="w-4 h-4 text-green-500" />}
                                {fileObj.status === 'error' && <span title={fileObj.error}><AlertTriangle className="w-4 h-4 text-red-500" /></span>}
                            </div>

                            <button
                                type="button"
                                onClick={() => removeFile(fileObj.id, target)}
                                className="text-gray-400 hover:text-red-600 transition-colors p-1 hover:bg-red-50 rounded"
                                title="ลบไฟล์"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );

    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                    {/* Header & Info */}
                    <div className="flex justify-between items-start p-4 border-b">
                        <div>
                            <h3 className="text-lg font-bold text-blue-600">{document.documentNumber}</h3>
                            <h2 className="text-xl font-semibold text-gray-800">{document.taskName}</h2>
                        </div>
                        <div className="flex items-center space-x-4">
                            <button onClick={() => setShowHistory(true)} className="flex items-center text-sm text-gray-500 hover:text-blue-600"><History size={16} className="mr-1" /> ดูประวัติ</button>
                            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
                        </div>
                    </div>

                    <div className="p-6 overflow-y-auto space-y-6">
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                {/* 👇 ไล่เปลี่ยน strong ทั้งหมดเป็น text-gray-700 */}
                                <div><strong className="text-gray-700 font-semibold block mb-1">สถานะ:</strong><span className="px-3 py-1 text-xs font-bold text-white rounded-full shadow-sm" style={{ backgroundColor: statusStyle.color }}>{statusStyle.text}</span></div>
                                <div><strong className="text-gray-700 font-semibold block">โครงการ:</strong><span className="text-gray-900">{document.site?.name || 'N/A'}</span></div>
                                <div><strong className="text-gray-700 font-semibold block">วันที่เริ่ม (แผน):</strong><span className="text-gray-900">{formatDate(document.planStartDate, false)}</span></div>
                                <div><strong className="text-gray-700 font-semibold block">วันที่กำหนดส่ง:</strong><span className="text-gray-900">{formatDate(document.dueDate, false)}</span></div>
                            </div>
                            {document.description && <div className='mt-4'><strong className="text-gray-700 font-semibold block text-sm">รายละเอียด:</strong><div className="text-gray-900 whitespace-pre-wrap bg-white p-3 rounded-md mt-1 border border-gray-300 shadow-sm"><p>"{document.description}"</p></div></div>}
                        </div>

                        {/* Files Section (View Only - Latest Step) */}
                        <div>
                            <h4 className="text-md font-semibold mb-2 flex items-center text-slate-800"><Paperclip size={16} className="mr-2" /> ไฟล์แนบ</h4>
                            <ul className="space-y-2">
                                {currentStepFiles.length > 0 ? currentStepFiles.map((file, index) => {
                                    const isPdf = file.fileName.toLowerCase().endsWith('.pdf') || file.contentType === 'application/pdf';

                                    return (
                                        <li key={index}>
                                            <div className="flex items-center justify-between p-2 bg-slate-100 border border-slate-200 rounded-md hover:bg-slate-200 transition-colors group">
                                                <div className="flex items-center min-w-0 flex-1 cursor-pointer" onClick={() => isPdf ? setPdfFile(file) : window.open(file.fileUrl)}>
                                                    <FileText className="w-5 h-5 text-gray-500 mr-3 flex-shrink-0" />
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-sm font-medium text-blue-600 group-hover:underline truncate">{file.fileName}</span>
                                                        <span className="text-xs text-gray-500">{formatFileSize(file.fileSize || file.size)}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center space-x-2 ml-2">
                                                    {isPdf && (
                                                        <button
                                                            onClick={() => setPdfFile(file)}
                                                            className="p-1 text-gray-400 hover:text-blue-600"
                                                            title="ดู/แก้ไข PDF"
                                                        >
                                                            <Eye size={18} />
                                                        </button>
                                                    )}
                                                    {!isPdf && (
                                                        <a href={file.fileUrl} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-400 hover:text-gray-600">
                                                            <Download size={18} />
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    );
                                }) : <p className="text-sm text-gray-500 italic">ไม่มีไฟล์แนบ</p>}
                            </ul>
                        </div>
                    </div>

                    <div className="p-4 border-t bg-slate-50">
                        {canPmApprove && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-bold text-slate-800">ดำเนินการ (สำหรับ PM/PD)</h3>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">เหตุผลในการไม่อนุมัติ (ถ้ามี)</label>
                                    <textarea value={rejectComment} onChange={(e) => setRejectComment(e.target.value)} rows={3} placeholder="กรอกเหตุผลที่ไม่อนุมัติ..." className="w-full p-2 border rounded-md bg-white text-gray-900" />
                                </div>
                                <div className="flex justify-end gap-3 pt-2">
                                    <button onClick={() => handlePmAction('REJECT_DRAFT')} disabled={isSubmitting} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed">
                                        <ThumbsDown size={16} className="mr-2" /> {isSubmitting ? 'กำลังดำเนินการ...' : 'ไม่อนุมัติ'}
                                    </button>
                                    <button onClick={() => handlePmAction('APPROVE_DRAFT')} disabled={isSubmitting} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed">
                                        <ThumbsUp size={16} className="mr-2" /> {isSubmitting ? 'กำลังอนุมัติ...' : 'อนุมัติ (ส่งให้ BIM)'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {canSiteReview && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-bold text-slate-800">ดำเนินการ (สำหรับ Site)</h3>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">แนบไฟล์เพิ่มเติม (ถ้ามี)</label>
                                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-500 transition-colors">
                                        <input type="file" multiple onChange={(e) => handleFileUpload(e, 'action')} id="site-file-upload" className="hidden" />
                                        <label htmlFor="site-file-upload" className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center">
                                            <Upload size={16} className="mr-2" /> คลิกเพื่อเลือกไฟล์
                                        </label>
                                    </div>

                                    {/* ✅ ใช้ Render Function ใหม่ */}
                                    {actionFiles.length > 0 && renderEditableFileList(actionFiles, 'action')}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ / คอมเมนต์ (ถ้ามี)</label>
                                    <textarea value={actionComment} onChange={(e) => setActionComment(e.target.value)} rows={3} placeholder="หากต้องการให้แก้ไข กรุณาใส่รายละเอียด..." className="w-full p-2 border rounded-md bg-white text-gray-900" />
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
                                        <input type="file" multiple onChange={(e) => handleFileUpload(e, 'action')} id="submit-file-upload" className="hidden" />
                                        <label htmlFor="submit-file-upload" className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center"><Upload size={16} className="mr-2" /> คลิกเพื่อเลือกไฟล์</label>
                                    </div>

                                    {/* ✅ ใช้ Render Function ใหม่ */}
                                    {actionFiles.length > 0 && renderEditableFileList(actionFiles, 'action')}

                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ / คอมเมนต์ (ถ้ามี)</label>
                                    <textarea value={actionComment} onChange={(e) => setActionComment(e.target.value)} rows={3} placeholder="อธิบายรายละเอียดการทำงาน..." className="w-full p-2 border rounded-md bg-white text-gray-900" />
                                </div>
                                <div className="flex justify-end pt-2">
                                    <button onClick={() => handleBimAction('SUBMIT_WORK')} disabled={actionFiles.filter(f => f.status === 'success').length === 0 || isSubmitting} className="flex items-center px-6 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-green-300">{isSubmitting ? <Spinner className="w-5 h-5 mr-2" /> : <Send size={16} className="mr-2" />}{isSubmitting ? 'กำลังส่งงาน...' : 'ส่งงานให้ Site ตรวจรับ'}</button>
                                </div>
                            </div>
                        )}

                        {isRevisionFlow && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-bold text-slate-800">สร้างเอกสารฉบับแก้ไข (Create Revision)</h3>

                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <p><strong>เอกสารเดิม:</strong> {document.documentNumber}</p>
                                    <p><strong>เอกสารใหม่:</strong> {newDocumentNumber}</p>
                                </div>

                                {(isVerifyingTask || verificationError) && (
                                    <div className="mb-4 p-3 rounded-md text-sm font-medium flex items-center border bg-white">
                                        {isVerifyingTask && (
                                            <>
                                                <Spinner className="w-4 h-4 mr-3 text-gray-500" />
                                                <span className="text-gray-600">กำลังตรวจสอบ Task ในระบบ BIM Tracking...</span>
                                            </>
                                        )}
                                        {verificationError && (
                                            <span className="text-red-600 font-semibold">{verificationError}</span>
                                        )}
                                    </div>
                                )}

                                {isTaskVerified && (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">แนบไฟล์ที่แก้ไขแล้ว <span className="text-red-700">*</span></label>
                                            <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center hover:border-blue-500 transition-colors">
                                                <input type="file" multiple onChange={(e) => handleFileUpload(e, 'revision')} id="revision-file-upload" className="hidden" />
                                                <label htmlFor="revision-file-upload" className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center">
                                                    <Upload size={16} className="mr-2" />
                                                    คลิกเพื่อเลือกไฟล์
                                                </label>
                                            </div>

                                            {/* ✅ ใช้ Render Function ใหม่ */}
                                            {revisionFiles.length > 0 && renderEditableFileList(revisionFiles, 'revision')}

                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-gray-700 mb-1 block">หมายเหตุการแก้ไข (Optional)</label>
                                            <textarea
                                                value={revisionComment}
                                                onChange={(e) => setRevisionComment(e.target.value)}
                                                placeholder="เช่น แก้ไขตาม Comment จาก CM..."
                                                className="w-full p-2 border rounded-md text-sm bg-white text-gray-900"
                                                rows={2}
                                            />
                                        </div>
                                        <div className="flex justify-end">
                                            <button
                                                onClick={handleCreateRevision}
                                                disabled={isSubmitting || revisionFiles.filter(f => f.status === 'success').length === 0 || !isTaskVerified}
                                                className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                            >
                                                {isSubmitting ? <Spinner className="w-4 h-4 mr-2" /> : <Send size={16} className="mr-2" />}
                                                ส่งเอกสารฉบับแก้ไข
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {showHistory && <WorkflowHistoryModal workflow={document.workflow || []} onClose={() => setShowHistory(false)} />}

            <PDFPreviewModal
                isOpen={!!pdfFile}
                file={pdfFile}
                allowEdit={canSiteReview || canSubmitWork || isRevisionFlow}
                onClose={() => setPdfFile(null)}
                onSave={handleAnnotateSave}
            />
        </>
    );
}