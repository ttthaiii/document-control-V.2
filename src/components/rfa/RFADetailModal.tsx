// src/components/rfa/RFADetailModal.tsx
'use client'

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { RFADocument, RFAPermissions, RFAWorkflowStep, RFAFile, RFASite } from '@/types/rfa'
import { X, Paperclip, Clock, User, Check, Send, AlertTriangle, FileText, Download, History, MessageSquare, Edit3, Upload, ThumbsUp, ThumbsDown, Eye, CornerUpLeft, RefreshCw, EyeOff, Lock, CheckCircle2, XCircle, RotateCcw, Hourglass } from 'lucide-react'
import Spinner from '@/components/shared/Spinner';
import { useAuth } from '@/lib/auth/useAuth'
import { Role, STATUS_LABELS, STATUSES, CREATOR_ROLES, REVIEWER_ROLES, APPROVER_ROLES, STATUS_COLORS, ROLES } from '@/lib/config/workflow'
import PDFPreviewModal from './PDFPreviewModal'
import { useNotification } from '@/lib/context/NotificationContext';
import { useLogActivity } from '@/lib/hooks/useLogActivity';
import { storage } from '@/lib/firebase/client';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { getFileUrl } from '@/lib/utils/storage';
import { useScrollLock } from '@/hooks/useScrollLock';

// --- Helper Functions ---
const formatDate = (dateString: string | undefined): string => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// C2: Status icon map for color-blind accessibility
const getStatusIcon = (status: string) => {
  const cls = 'w-3.5 h-3.5 mr-1.5 flex-shrink-0';
  switch (status) {
    case 'PENDING_REVIEW':          return <Hourglass className={cls} aria-hidden="true" />;
    case 'PENDING_CM_APPROVAL':     return <Send className={cls} aria-hidden="true" />;
    case 'PENDING_FINAL_APPROVAL':  return <Hourglass className={cls} aria-hidden="true" />;
    case 'APPROVED':                return <CheckCircle2 className={cls} aria-hidden="true" />;
    case 'APPROVED_WITH_COMMENTS':  return <MessageSquare className={cls} aria-hidden="true" />;
    case 'APPROVED_REVISION_REQUIRED': return <RotateCcw className={cls} aria-hidden="true" />;
    case 'REVISION_REQUIRED':       return <RotateCcw className={cls} aria-hidden="true" />;
    case 'REJECTED':                return <XCircle className={cls} aria-hidden="true" />;
    default:                        return null;
  }
};

// --- Component: Workflow History Modal ---
const WorkflowHistoryModal = ({
  workflow,
  onClose,
  userRole,
  cmSystemType = 'INTERNAL', // Default as internal
  docId,
  docNumber,
  siteId,
  siteName
}: {
  workflow: RFAWorkflowStep[],
  onClose: () => void,
  userRole?: string,
  cmSystemType?: 'INTERNAL' | 'EXTERNAL',
  docId?: string,
  docNumber?: string,
  siteId?: string,
  siteName?: string
}) => {
  const { logActivity } = useLogActivity();
  const filteredWorkflow = useMemo(() => {
    // Hide internal drafting steps ONLY for CM, and ONLY if it's an INTERNAL system type.
    // PMs and all Reviewers (Site Admin, PE, OE) should see everything.
    // If it's an EXTERNAL CM system, the CM is part of the system and needs to see everything.
    if (userRole === ROLES.CM && cmSystemType === 'INTERNAL') {
      const statusesToHide = [STATUSES.PENDING_REVIEW, STATUSES.REVISION_REQUIRED];
      return workflow.filter(item => !statusesToHide.includes(item.status));
    }
    return workflow;
  }, [workflow, userRole, cmSystemType]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-bold text-gray-800 flex items-center">
            <History size={20} className="mr-2" />
            ประวัติการดำเนินงาน
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-blue-500 rounded outline-none"
            aria-label="\u0e1b\u0e34\u0e14"
          >
            <X size={24} aria-hidden="true" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          <div className="border-l-2 border-gray-200 ml-2">
            {filteredWorkflow.length > 0 ? (
              filteredWorkflow.map((item, index) => (
                <div key={index} className="relative pl-6 pb-8 last:pb-0">
                  <div
                    className="absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white z-10"
                    style={{ backgroundColor: STATUS_COLORS[item.status] || '#3B82F6' }}
                  ></div>
                  <p className="font-semibold text-gray-800">
                    {item.revisionNumber !== undefined && (
                      <span className="text-blue-600 mr-2 font-bold">[Rev.{item.revisionNumber}]</span>
                    )}
                    {STATUS_LABELS[item.status] || item.status}
                  </p>
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
                              onClick={() => {
                                const isPdf = file.contentType === 'application/pdf' || file.fileName.toLowerCase().endsWith('.pdf');
                                logActivity({
                                  action: isPdf ? 'PREVIEW_FILE' : 'DOWNLOAD_FILE',
                                  resourceType: 'RFA',
                                  resourceId: docId,
                                  resourceName: docNumber,
                                  siteId: siteId,
                                  siteName: siteName,
                                  description: `${isPdf ? 'เปิดดูไฟล์' : 'ดาวน์โหลดไฟล์'} "${file.fileName}" (จากประวัติ)`,
                                  metadata: { revisionNumber: item.revisionNumber }
                                });
                              }}
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

// --- Interfaces ---
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
interface SiteWithSystemType extends RFASite {
  cmSystemType?: 'INTERNAL' | 'EXTERNAL';
}
interface FullRFADocument extends RFADocument {
  isFromSupersedeRequest?: boolean;
  site: SiteWithSystemType;
  creatorRole?: 'BIM' | 'ME' | 'SN'; // Note: Usually fallback to document.createdByInfo?.role
  taskData?: {
    projectId?: string;
    taskName?: string;
    [key: string]: any;
  };
}

const renameFileObj = (file: File, newName: string) => {
  return new File([file], newName, { type: file.type, lastModified: file.lastModified });
}

// --- Main Component ---
export default function RFADetailModal({ document: initialDoc, onClose, onUpdate, showOverlay = true }: RFADetailModalProps) {
  const { user, firebaseUser } = useAuth();
  const { showNotification } = useNotification();
  const { logActivity } = useLogActivity();

  const [document, setDocument] = useState<FullRFADocument | null>(initialDoc as FullRFADocument);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false); // [NEW] สำหรับ Animate ตอนปิด Modal

  // Modal Close Animation helper
  const triggerClose = () => {
    setIsClosing(true);
    setTimeout(() => onClose(), 200); // รอ animation fade out จบ 200ms
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !isSubmitting && !isSupersedeSubmitting) {
      triggerClose();
    }
  };

  // UI States
  const [showHistory, setShowHistory] = useState(false);
  const [comment, setComment] = useState('');
  const [newFiles, setNewFiles] = useState<UploadedFile[]>([]);
  const [revisionComment, setRevisionComment] = useState('');
  const [revisionFiles, setRevisionFiles] = useState<UploadedFile[]>([]);
  const [resubmissionFiles, setResubmissionFiles] = useState<UploadedFile[]>([]);
  const [previewFile, setPreviewFile] = useState<RFAFile | null>(null);
  const [suspendOldDocForRevision, setSuspendOldDocForRevision] = useState(false);

  // Supersede Modal States (Modal #1 — ขอแก้ไข)
  const [showSupersedeModal, setShowSupersedeModal] = useState(false);
  const [supersedeComment, setSupersedeComment] = useState('');
  const [supersedeFiles, setSupersedeFiles] = useState<UploadedFile[]>([]);
  const [suspendOldDoc, setSuspendOldDoc] = useState(false); // default = ไม่ระงับ
  const [isSupersedeSubmitting, setIsSupersedeSubmitting] = useState(false);

  // Pending Review States (Site Review)
  const [suspendPreviousRevision, setSuspendPreviousRevision] = useState(false);

  // SupersedeComplete Modal States removed: auto-supersede is now done by the backend on approval

  // State for Rename File Modal
  const [renameState, setRenameState] = useState<{
    isOpen: boolean;
    index: number;
    target: 'action' | 'revision' | 'resubmission';
    currentName: string;
    newName: string;
  }>({ isOpen: false, index: -1, target: 'action', currentName: '', newName: '' });

  // Revision & Verification States
  const [isVerifyingTask, setIsVerifyingTask] = useState(false);
  const [isTaskVerified, setIsTaskVerified] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verifiedTaskId, setVerifiedTaskId] = useState<string | null>(null);
  const [newDocumentNumberInput, setNewDocumentNumberInput] = useState('');

  // 0. Prevent Body Scroll — use shared hook to avoid race condition with stacked modals
  useScrollLock(true);

  // 1. Fetch Full Document Data
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
          setDocument(result.document);
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

  // 2. Memoized Values (Hooks)
  const latestFiles = useMemo(() => {
    if (!document) return [];
    if (!document.workflow || document.workflow.length === 0) return document.files || [];

    const reversedWorkflow = [...document.workflow].reverse();
    const latestStepWithFiles = reversedWorkflow.find(step => step.files && step.files.length > 0);

    return latestStepWithFiles?.files || document.files || [];
  }, [document]);

  const latestCommentItem = useMemo(() => {
    if (!document?.workflow || document.workflow.length === 0) return null;
    // Only look at the LAST workflow step — if it has no comment, return null.
    // We intentionally do NOT scan older steps to avoid surfacing stale comments.
    const lastStep = document.workflow[document.workflow.length - 1];
    if (lastStep?.comments && lastStep.comments.trim() !== '') return lastStep;
    return null;
  }, [document?.workflow]);

  // --- Logic สิทธิ์การแก้ไข PDF & Revision ---
  const isCreator = document?.createdBy === user?.id;

  // To enforce BIM tracking checks, we verify both that the document was created by a BIM user
  // and that the current user viewing it is also a BIM user.
  // Note: createdByInfo is sometimes undefined if accessed via direct URL, so fallback to workflow[0].role
  const isBimDocument = document?.workflow?.[0]?.role === 'BIM' || document?.createdByInfo?.role === 'BIM';
  const isBimUser = user?.role === 'BIM';
  const requiresBimVerification = isBimUser && isBimDocument;

  // การอนุญาตให้สร้าง Revision ใหม่ (Team-based permissions)
  // 1. ถ้าเป็นเอกสาร BIM (requiresBimVerification = true) -> ทีม BIM ทุกคนสร้าง Rev ได้
  // 2. ถ้าเป็นเอกสาร Non-BIM -> ทุกคนที่ไม่ใช่ BIM สามารถสร้าง Rev ได้
  const canReviseBimDoc = requiresBimVerification;
  const canReviseNonBimDoc = !isBimDocument && !isBimUser;

  const canRevise = isCreator || user?.role === ROLES.ADMIN || canReviseBimDoc || canReviseNonBimDoc;
  const hasRequestedRevision = !!document?.supersededComment;
  const isRevisionFlow = (
    document?.status === STATUSES.REJECTED ||
    hasRequestedRevision ||
    document?.status === STATUSES.APPROVED_REVISION_REQUIRED
  ) && canRevise && document?.isLatest;

  // --- สิทธิ์ขอแก้ไข Rev. ใหม่จากเอกสาร "อนุมัติ" (Supersede Flow) ---
  const APPROVED_STATUSES = [STATUSES.APPROVED, STATUSES.APPROVED_WITH_COMMENTS];
  const isApprovedStatus = document ? APPROVED_STATUSES.includes(document.status) : false;
  const isApprover = APPROVER_ROLES.includes(user?.role as Role);
  const isAdmin = user?.role === ROLES.ADMIN;
  const canRequestSupersede =
    isApprovedStatus &&
    document?.supersededStatus !== 'SUSPENDED' && // ยังไม่ได้ขอแก้ไขอยู่
    (
      isAdmin ||
      isApprover
    );

  const canEditPDF = useMemo(() => {
    if (!document || !user) return false;

    const { status } = document;
    const permissions = document.permissions || {} as RFAPermissions;
    const userRole = user.role;

    const isSiteReviewing = REVIEWER_ROLES.includes(userRole as Role) && status === STATUSES.PENDING_REVIEW;
    const isApproving = permissions.canApprove;
    const isResubmissionFlow = status === STATUSES.REVISION_REQUIRED && document.createdBy === user.id;
    const isDocRevisionFlow = (status === STATUSES.REJECTED || !!document.supersededComment) && canRevise && document.isLatest;

    if (isDocRevisionFlow) return true;
    if (status === STATUSES.APPROVED || status === STATUSES.APPROVED_WITH_COMMENTS || status === STATUSES.APPROVED_REVISION_REQUIRED) return false;
    if (isSiteReviewing) return true;
    if (isApproving) return true;
    if (isResubmissionFlow) return true;

    return false;
  }, [document, user]);

  // 3. Task Verification Logic (for Revision)
  // 3. Task Verification Logic (for Revision)
  const verifyBimTask = useCallback(async () => {
    if (!document?.site?.name || !document?.documentNumber || !document?.taskData?.taskName) {
      setVerificationError("ข้อมูลเอกสารไม่สมบูรณ์ ไม่สามารถตรวจสอบ Task ได้");
      return;
    }

    setIsVerifyingTask(true);
    setIsTaskVerified(false);
    setVerificationError(null);
    setVerifiedTaskId(null);

    try {
      const token = await firebaseUser?.getIdToken();
      if (!token) throw new Error("Authentication failed");
      const newRevNumber = (document.revisionNumber || 0) + 1;

      const response = await fetch('/api/bim-tracking/verify-task', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentNumber: document.documentNumber.split('-REV')[0],
          projectName: document.site.name,
          rev: newRevNumber,
          taskName: document.taskData.taskName,
        }),
      });

      const result = await response.json();
      if (response.ok && result.success) {
        if (result.exists) {
          setIsTaskVerified(true);
          setVerifiedTaskId(result.taskId);
        } else {
          setVerificationError(`กรุณาสร้าง Task สำหรับ Rev.${String(newRevNumber).padStart(2, '0')} ในระบบ BIM Tracking ก่อน`);
        }
      } else {
        throw new Error(result.error || 'ไม่สามารถตรวจสอบ Task ได้');
      }
    } catch (error: any) {
      setVerificationError(error.message);
    } finally {
      setIsVerifyingTask(false);
    }
  }, [document, firebaseUser]);

  useEffect(() => {
    if (isRevisionFlow && requiresBimVerification && firebaseUser && document) {
      verifyBimTask();
    }
  }, [isRevisionFlow, requiresBimVerification, firebaseUser, document, verifyBimTask]);

  // 4. Loading State — Skeleton instead of black overlay
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 z-modal flex items-center justify-center p-4">
        <div className="bg-surface rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-pulse">
          {/* Skeleton Header */}
          <div className="flex justify-between items-start p-4 border-b border-border-subtle">
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="h-6 w-32 bg-surface-muted rounded" />
                <div className="h-6 w-16 bg-surface-muted rounded" />
              </div>
              <div className="h-5 w-64 bg-surface-muted rounded" />
              <div className="h-3 w-24 bg-surface-muted rounded" />
            </div>
            <div className="h-8 w-8 bg-surface-muted rounded-full" />
          </div>
          {/* Skeleton Content */}
          <div className="flex-1 p-6 space-y-6 overflow-hidden">
            <div className="bg-surface-raised rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div className="h-12 bg-surface-muted rounded" />
                <div className="h-12 bg-surface-muted rounded" />
                <div className="h-12 bg-surface-muted rounded" />
              </div>
            </div>
            <div className="space-y-3">
              <div className="h-4 w-32 bg-surface-muted rounded" />
              <div className="h-10 bg-surface-muted rounded" />
              <div className="h-10 bg-surface-muted rounded" />
              <div className="h-10 w-3/4 bg-surface-muted rounded" />
            </div>
          </div>
          {/* Skeleton Action Panel */}
          <div className="p-6 border-t bg-surface-raised">
            <div className="h-4 w-32 bg-surface-muted rounded mb-4" />
            <div className="flex gap-3 justify-end">
              <div className="h-9 w-24 bg-surface-muted rounded-lg" />
              <div className="h-9 w-28 bg-surface-muted rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!document) return null;

  // 5. Variable Assignments
  const permissions = document.permissions || {} as RFAPermissions;
  const isResubmissionFlow = document.status === STATUSES.REVISION_REQUIRED && isCreator;
  const newRevisionNumber = (document.revisionNumber || 0) + 1;
  const newDocumentNumber = `${document.documentNumber.split('-REV')[0]}-REV${String(newRevisionNumber).padStart(2, '0')}`;
  const displayDetailOrComment = latestCommentItem?.comments || document.description;
  const displayLabel = latestCommentItem ? `ความคิดเห็นล่าสุด` : 'รายละเอียดเพิ่มเติม';

  const { role: userRole } = user || {};
  const { status } = document;

  const isSiteReviewing = REVIEWER_ROLES.includes(userRole as Role) && status === STATUSES.PENDING_REVIEW;
  const isApproving = permissions.canApprove;

  // 6. File Handling Functions
  const uploadTempFile = (fileObj: UploadedFile, target: 'action' | 'revision' | 'resubmission' | 'supersede') => {
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

      const setFiles = target === 'revision' ? setRevisionFiles
        : target === 'supersede' ? setSupersedeFiles
          : setNewFiles;

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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, target: 'action' | 'revision' | 'resubmission') => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const uploadedFileObjects: UploadedFile[] = files.map(file => ({
      id: `${file.name}-${Date.now()}`, file, status: 'pending', progress: 0
    }));
    const setFiles = target === 'revision' ? setRevisionFiles : setNewFiles;

    // Add pending files to state first
    setFiles(prev => [...prev, ...uploadedFileObjects]);

    // Start upload for each file
    uploadedFileObjects.forEach(fileObj => {
      uploadTempFile(fileObj, target).catch(err => console.error("Upload failed for", fileObj.file.name, err));
    });
    event.target.value = '';
  };

  const handleAnnotateSave = async (editedFile: File) => {
    let target: 'action' | 'revision' | 'resubmission' = 'action';
    if (isResubmissionFlow) target = 'resubmission';
    else if (isRevisionFlow) target = 'revision';

    const setFiles = target === 'revision' ? setRevisionFiles : setNewFiles;

    const newFileObj: UploadedFile = {
      id: `edited-${Date.now()}`,
      file: editedFile,
      status: 'pending',
      progress: 0
    };

    setFiles(prev => [...prev, newFileObj]);

    try {
      await uploadTempFile(newFileObj, target);
      showNotification('success', 'บันทึกไฟล์สำเร็จ', 'ไฟล์ที่แก้ไขถูกแนบเรียบร้อยแล้ว');
      setPreviewFile(null);
    } catch (error) {
      showNotification('error', 'บันทึกไฟล์ล้มเหลว', 'ไม่สามารถอัปโหลดไฟล์ที่แก้ไขได้');
    }
  };

  const handleRenameFile = (index: number, target: 'action' | 'revision' | 'resubmission') => {
    const files = target === 'revision' ? revisionFiles : target === 'resubmission' ? resubmissionFiles : newFiles;
    const fileObj = files[index];

    setRenameState({
      isOpen: true,
      index,
      target,
      currentName: fileObj.file.name,
      newName: fileObj.file.name
    });
  };

  const confirmRenameFile = () => {
    const { index, target, newName, currentName } = renameState;
    if (!newName || newName.trim() === "" || newName.trim() === currentName) {
      setRenameState(prev => ({ ...prev, isOpen: false }));
      return;
    }

    const setFiles = target === 'revision' ? setRevisionFiles : target === 'resubmission' ? setResubmissionFiles : setNewFiles;

    // Check if user forgot to keep .pdf/.dwg extension, append original extension if needed
    let finalName = newName.trim();
    const originalExt = currentName.substring(currentName.lastIndexOf('.'));
    const newExt = finalName.includes('.') ? finalName.substring(finalName.lastIndexOf('.')) : '';

    // Automatically add extension if missing
    if (!newExt && originalExt) {
      finalName += originalExt;
    }

    const files = target === 'revision' ? revisionFiles : target === 'resubmission' ? resubmissionFiles : newFiles;
    const fileObj = files[index];
    const updatedFile = renameFileObj(fileObj.file, finalName);

    setFiles(prev => prev.map((f, i) => i === index ? { ...f, file: updatedFile } : f));
    setRenameState(prev => ({ ...prev, isOpen: false }));
  };

  const handlePreviewLocalFile = (fileObj: UploadedFile) => {
    if (fileObj.file.type === 'application/pdf') {
      const objectUrl = URL.createObjectURL(fileObj.file);
      const tempRFAFile: RFAFile = {
        fileName: fileObj.file.name,
        fileUrl: objectUrl,
        contentType: fileObj.file.type,
        fileSize: fileObj.file.size,
        uploadedAt: new Date().toISOString(),
        // [FIXED] ใช้ email แทน name ที่ไม่มีอยู่
        uploadedBy: user?.email || 'Unknown User',
        filePath: 'temp/local-preview',
        size: fileObj.file.size
      };
      setPreviewFile(tempRFAFile);
    }
  };

  const removeFile = async (index: number, target: 'action' | 'revision' | 'resubmission') => {
    const files = target === 'revision' ? revisionFiles : newFiles;
    const setFiles = target === 'revision' ? setRevisionFiles : setNewFiles;
    const fileToRemove = files[index];

    if (fileToRemove.status === 'success' && fileToRemove.uploadedData?.filePath) {
      try {
        // Delete from Firebase Storage directly
        const fileRef = ref(storage, fileToRemove.uploadedData.filePath);
        await deleteObject(fileRef);
      } catch (error) {
        console.error("Failed to delete temp file from storage:", error);
      }
    }
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  // [NEW] Helper function for rendering file lists with consistent UI
  const renderFileList = (files: UploadedFile[], target: 'action' | 'revision' | 'resubmission') => (
    <div className="mt-2 space-y-2">
      {files.map((fileObj, index) => (
        <div key={fileObj.id} className="flex flex-col gap-2 p-2 bg-slate-100 rounded group transition-colors">
          {renameState.isOpen && renameState.index === index && renameState.target === target ? (
            <div className="flex items-center w-full gap-2">
              <input
                type="text"
                value={renameState.newName}
                onChange={(e) => setRenameState({ ...renameState, newName: e.target.value })}
                className="flex-1 p-1 text-sm outline-none border rounded border-blue-400 bg-white text-gray-900"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); confirmRenameFile(); }
                  if (e.key === 'Escape') setRenameState({ isOpen: false, index: -1, target: 'action', currentName: '', newName: '' });
                }}
              />
              <div className="flex items-center border-l pl-2 space-x-1">
                <button type="button" onClick={confirmRenameFile} className="p-1 hover:bg-green-100 text-green-600 rounded" title="บันทึกชื่อ">
                  <Check size={16} />
                </button>
                <button type="button" onClick={() => setRenameState({ isOpen: false, index: -1, target: 'action', currentName: '', newName: '' })} className="p-1 hover:bg-red-100 text-red-500 rounded" title="ยกเลิก">
                  <X size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center text-sm w-full">
              <div className="mr-3 flex-shrink-0" title={fileObj.status}>
                {fileObj.status === 'uploading' ? (
                  <Spinner className="w-4 h-4 text-blue-500" />
                ) : fileObj.status === 'success' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : fileObj.status === 'error' ? (
                  <div title={fileObj.error}>
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  </div>
                ) : (
                  <FileText className="w-4 h-4 text-slate-500" />
                )}
              </div>
              <span
                onClick={() => handlePreviewLocalFile(fileObj)}
                className={`flex-1 truncate cursor-pointer mr-2 transition-colors ${fileObj.status === 'error' ? 'text-red-600' : 'text-gray-700 hover:text-blue-600 hover:underline'}`}
                title={fileObj.status === 'error' ? fileObj.error : "คลิกเพื่อดูตัวอย่างไฟล์"}
              >
                {fileObj.file.name}
              </span>
              <div className="flex items-center flex-shrink-0 gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                {!fileObj.status || fileObj.status === 'pending' || fileObj.status === 'success' ? (
                  <button
                    onClick={() => handleRenameFile(index, target)}
                    className="p-1.5 text-gray-500 hover:text-blue-600 rounded-md hover:bg-white transition-colors"
                    title="เปลี่ยนชื่อไฟล์"
                    type="button"
                  >
                    <Edit3 size={16} />
                  </button>
                ) : null}
                <button
                  onClick={() => removeFile(index, target)}
                  className="p-1.5 text-gray-500 hover:text-red-600 rounded-md hover:bg-white transition-colors"
                  title="ลบไฟล์"
                  type="button"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  // 7. Action Handlers
  const handleAction = async (action: string) => {
    const actionsRequiringFile = [
      'REQUEST_REVISION',
      'SEND_TO_CM',
      'SUBMIT_REVISION',
      'APPROVE',
      'APPROVE_WITH_COMMENTS',
      'APPROVE_REVISION_REQUIRED',
      'REJECT'
    ];

    if (actionsRequiringFile.includes(action) && newFiles.filter(f => f.status === 'success').length === 0) {
      showNotification('warning', 'คำเตือน', 'กรุณาแนบไฟล์ประกอบการดำเนินการ');
      return;
    }

    setIsSubmitting(true);
    setLoadingAction(action);
    try {
      const token = await firebaseUser?.getIdToken();

      const payload: {
        action: string;
        comments: string;
        newFiles: any[];
        documentNumber?: string;
        suspendPreviousRevision?: boolean;
      } = {
        action,
        comments: comment,
        newFiles: newFiles.filter(f => f.status === 'success').map(f => f.uploadedData),
        suspendPreviousRevision
      };

      if (needsDocNumber && newDocumentNumberInput.trim()) {
        payload.documentNumber = newDocumentNumberInput.trim();
      }

      const response = await fetch(`/api/rfa/${document.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (result.success) {
        showNotification('success', 'ดำเนินการสำเร็จ!', result.message);

        // Fire-and-forget: extract CAD files in background
        const isFinalApprovalAction = ['APPROVE', 'APPROVE_WITH_COMMENTS', 'APPROVE_REVISION_REQUIRED'].includes(action);
        if (isFinalApprovalAction && result.newStatus && ['APPROVED', 'APPROVED_WITH_COMMENTS', 'APPROVED_REVISION_REQUIRED'].includes(result.newStatus)) {
          fetch('/api/rfa/extract-cad', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ docId: document.id }),
          }).catch(() => { /* silent fail — non-critical */ });
        }

        triggerClose();
      } else {
        throw new Error(result.error || 'เกิดข้อผิดพลาด');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      showNotification('error', 'เกิดข้อผิดพลาด', message);
    } finally {
      setIsSubmitting(false);
      setLoadingAction(null);
    }
  };

  const handleCreateRevision = async () => {
    const successfulUploads = revisionFiles.filter(f => f.status === 'success');
    if (successfulUploads.length === 0) {
      showNotification('warning', 'คำเตือน', 'กรุณาแนบไฟล์ฉบับแก้ไขอย่างน้อย 1 ไฟล์');
      return;
    }
    setIsSubmitting(true);
    try {
      const token = await firebaseUser?.getIdToken();
      const payload = {
        originalDocId: document.id,
        uploadedFiles: successfulUploads.map(f => f.uploadedData),
        comments: revisionComment,
        verifiedTaskId: verifiedTaskId,
        suspendOldDoc: document.status === STATUSES.APPROVED_REVISION_REQUIRED
          ? suspendOldDocForRevision
          : document.supersededStatus === 'SUSPENDED',
      };
      const response = await fetch(`/api/rfa/create_revision`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (result.success) {
        showNotification('success', 'สร้าง Revision สำเร็จ!', `เอกสารฉบับใหม่ ${newDocumentNumber} ถูกสร้างแล้ว`);
        triggerClose();
      } else {
        throw new Error(result.error || 'เกิดข้อผิดพลาดในการสร้าง Revision');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      showNotification('error', 'เกิดข้อผิดพลาด', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Supersede Flow Handlers ---
  const handleSupersedeFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const uploadedFileObjects: UploadedFile[] = files.map(file => ({
      id: `${file.name}-${Date.now()}`, file, status: 'pending', progress: 0
    }));
    setSupersedeFiles(prev => [...prev, ...uploadedFileObjects]);
    uploadedFileObjects.forEach(fileObj => {
      uploadTempFile(fileObj, 'supersede').catch(err => console.error('Supersede upload failed', err));
    });
    event.target.value = '';
  };

  const handleSupersedeRequest = async () => {
    if (!supersedeComment.trim()) {
      showNotification('warning', 'คำเตือน', 'กรุณาระบุเหตุผล/คำสั่งก่อนขอแก้ไข');
      return;
    }
    const successfulUploads = supersedeFiles.filter(f => f.status === 'success');
    if (successfulUploads.length === 0) {
      showNotification('warning', 'คำเตือน', 'กรุณาแนบไฟล์หลักฐานคำสั่งอย่างน้อย 1 ไฟล์');
      return;
    }
    setIsSupersedeSubmitting(true);
    try {
      const token = await firebaseUser?.getIdToken();
      const response = await fetch('/api/rfa/request-supersede', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docId: document.id,
          comment: supersedeComment,
          uploadedFiles: successfulUploads.map(f => f.uploadedData),
          suspendOldDoc,
        }),
      });
      const result = await response.json();
      if (result.success) {
        setShowSupersedeModal(false);
        setSupersedeComment('');
        setSupersedeFiles([]);
        const isBimDoc = result.data?.originalDocument?.isBimDocument;
        if (isBimDoc) {
          // BIM: ระบบส่ง Signal ไป BIM Tracking แล้ว ให้แสดง message รอ BIM มาส่งใหม่
          showNotification('success', 'ส่งคำขอแก้ไขสำเร็จ', 'รอทาง BIM สร้าง Task ใหม่ใน BIM Tracking และส่งเอกสาร Rev. ใหม่');
        } else {
          // Non-BIM: ให้ผู้ใช้กลับไปแนบ Rev ใหม่เองเมื่อพร้อม
          showNotification('success', 'ส่งคำขอแก้ไขสำเร็จ', 'ตั้งสถานะเป็นรอแก้ไขแล้ว สามารถนำส่ง Rev. ใหม่ได้จากหน้ารายการ');
        }
        triggerClose();
      } else {
        throw new Error(result.error || 'เกิดข้อผิดพลาด');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      showNotification('error', 'เกิดข้อผิดพลาด', message);
    } finally {
      setIsSupersedeSubmitting(false);
    }
  };

  const handleResubmitRevision = async () => {
    await handleAction('SUBMIT_REVISION');
  };

  const overlayClasses = showOverlay ? 'bg-black bg-opacity-50' : ''
  const isActionDisabled = isSubmitting || newFiles.filter(f => f.status === 'success').length === 0;
  const needsDocNumber = isSiteReviewing && !document.documentNumber;

  return (
    <>
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${isClosing ? 'opacity-0' : 'opacity-100'
          } ${overlayClasses}`}
        onClick={handleBackdropClick}
      >
        <div
          className={`rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col transition-all duration-200 relative transform ${isClosing ? 'scale-95 translate-y-2 opacity-0' : 'scale-100 translate-y-0 opacity-100'
            } ${document.supersededStatus === 'SUSPENDED' ? 'bg-red-50' : 'bg-white'
            }`}
          onClick={(e) => e.stopPropagation()} // ป้องกันการคลิกทะลุไปถึง backdrop
        >

          {/* 🔒 Loading Overlay ตอนกด Submit เพื่อบังไม่ให้เห็น UI กระพริบตอน Firestore อัปเดต */}
          {(isSubmitting || isSupersedeSubmitting) && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-[100] flex items-center justify-center rounded-lg">
              <div className="flex flex-col items-center bg-white p-6 rounded-xl shadow-lg border border-gray-100">
                <Spinner className="w-10 h-10 text-blue-600 mb-4" />
                <p className="text-gray-800 font-semibold text-lg">กำลังดำเนินการ...</p>
                <p className="text-gray-500 text-sm mt-1">กรุณารอสักครู่ ระบบกำลังบันทึกข้อมูลและไฟล์</p>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="flex justify-between items-start p-4 border-b border-gray-200/50">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="text-lg font-bold text-blue-600">{document.documentNumber}</h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  Rev.{String(document.revisionNumber || 0).padStart(2, '0')}
                </span>
                {document.supersededStatus === 'SUSPENDED' && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white flex-shrink-0">
                    <Lock className="w-2.5 h-2.5 mr-0.5" />ห้ามใช้
                  </span>
                )}
                {document.supersededStatus !== 'SUSPENDED' && !!document.supersededComment && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500 text-white flex-shrink-0">
                    <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />กำลังสร้าง Rev. ใหม่
                  </span>
                )}
              </div>
              <h2 className="text-xl font-semibold text-gray-800">{document.title}</h2>
              <p className="text-xs text-gray-500 mt-1">{document.runningNumber || 'RFA Document'}</p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowHistory(true)}
                className="flex items-center text-sm text-text-secondary hover:text-blue-600 focus-visible:ring-2 focus-visible:ring-brand rounded outline-none"
                aria-label="ดูประวัติการดำเนินงาน"
              >
                <History size={16} className="mr-1" /> ดูประวัติการดำเนินงาน
              </button>
              <button
                onClick={triggerClose}
                className="text-text-secondary hover:text-text-body focus-visible:ring-2 focus-visible:ring-brand rounded outline-none"
                aria-label="ปิด"
              >
                <X size={24} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Scrollable Container for both Content and Action Panels */}
          <div className="flex-1 overflow-y-auto min-h-0 w-full">

            <div className="p-6 space-y-6">
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <strong className="text-gray-700 font-semibold block mb-1">สถานะ:</strong>
                    <span
                      className="inline-flex items-center px-3 py-1 text-xs font-bold text-white rounded-full shadow-sm"
                      style={{ backgroundColor: STATUS_COLORS[document.status] || '#6c757d' }}
                    >
                      {getStatusIcon(document.status)}
                      {STATUS_LABELS[document.status] || document.status}
                    </span>
                  </div>
                  <div>
                    <strong className="text-gray-700 font-semibold block">หมวดงาน:</strong>
                    <span className="text-gray-900 font-medium">{document.category.categoryCode}</span>
                  </div>
                  <div>
                    <strong className="text-gray-700 font-semibold block">โครงการ:</strong>
                    <span className="text-gray-900 font-medium">{document.site?.name || 'N/A'}</span>
                  </div>
                </div>
                {(displayDetailOrComment && displayDetailOrComment.trim() !== '') && (
                  <div className='mt-4'>
                    <strong className="text-gray-700 font-semibold block text-sm">{displayLabel}:</strong>
                    <div className="text-gray-900 whitespace-pre-wrap bg-white p-3 rounded-md mt-1 border border-gray-300 shadow-sm">
                      <p className="">"{displayDetailOrComment}"</p>
                    </div>
                  </div>
                )}
              </div>

              {document.status === STATUSES.REJECTED && !document.isLatest && (
                <div className="p-4 bg-red-50 text-red-800 rounded-lg flex items-center">
                  <AlertTriangle size={24} className="mr-3 flex-shrink-0 text-red-600" />
                  <div>
                    <h4 className="font-bold">เอกสารฉบับนี้ถูกแทนที่แล้ว</h4>
                    <p className="text-sm text-red-700">
                      ได้มีการสร้างเอกสารฉบับใหม่ <strong>(Rev.{String((document.revisionNumber || 0) + 1).padStart(2, '0')})</strong> จากเอกสารฉบับนี้แล้ว
                    </p>
                  </div>
                </div>
              )}


              {/* Revision Visual Banner Removed As Per User Request */}

              <div>
                <h4 className="text-md font-semibold mb-2 flex items-center text-slate-800">
                  <Paperclip size={16} className="mr-2" /> ไฟล์แนบ (ฉบับล่าสุด)
                </h4>
                <ul className="space-y-2">
                  {latestFiles.length > 0 ? (
                    latestFiles.map((file, index) => {
                      const isPdf = file.contentType === 'application/pdf' || file.fileName.toLowerCase().endsWith('.pdf');
                      const isSuspended = document.supersededStatus === 'SUSPENDED';
                      const FileContent = () => (
                        <div className={`flex items-center min-w-0 ${isSuspended ? 'text-red-600 font-medium' : ''}`}>
                          {isSuspended ? (
                            <Lock className="w-5 h-5 text-red-500 mr-3 flex-shrink-0" />
                          ) : (
                            <FileText className="w-5 h-5 text-gray-500 mr-3 flex-shrink-0" />
                          )}
                          <div className="flex flex-col min-w-0">
                            <span className={`text-sm font-medium truncate ${isSuspended ? 'text-red-500 group-hover:text-red-700 group-hover:underline' : 'text-blue-600 group-hover:text-blue-800 group-hover:underline'
                              }`}>{file.fileName}</span>
                            <span className="text-xs text-gray-500">{formatFileSize(file.fileSize)}</span>
                          </div>
                        </div>
                      );
                      return (
                        <li key={index} className={`border rounded-md ${isSuspended ? 'bg-red-50 border-red-200 hover:bg-red-100' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}>
                          {isPdf ? (
                            <button
                              onClick={() => {
                                logActivity({
                                  action: 'PREVIEW_FILE',
                                  resourceType: 'RFA',
                                  resourceId: document.id,
                                  resourceName: document.documentNumber || document.runningNumber,
                                  siteId: document.site.id,
                                  siteName: document.site.name,
                                  description: `เปิดดูไฟล์เอกสาร "${file.fileName}"`
                                });
                                setPreviewFile(file);
                              }}
                              className="w-full text-left p-2 rounded-md group transition-colors duration-200"
                              title={isSuspended ? `[ระงับการใช้งาน] ดูตัวอย่างไฟล์ ${file.fileName}` : `ดูตัวอย่างไฟล์ ${file.fileName}`}
                            >
                              <FileContent />
                            </button>
                          ) : (
                            <a
                              href={file.fileUrl}
                              download={file.fileName}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => {
                                logActivity({
                                  action: 'DOWNLOAD_FILE',
                                  resourceType: 'RFA',
                                  resourceId: document.id,
                                  resourceName: document.documentNumber || document.runningNumber,
                                  siteId: document.site.id,
                                  siteName: document.site.name,
                                  description: `ดาวน์โหลดไฟล์เอกสาร "${file.fileName}"`
                                });
                              }}
                              className="w-full text-left p-2 rounded-md group transition-colors duration-200 flex"
                              title={isSuspended ? `[ระงับการใช้งาน] ดาวน์โหลด ${file.fileName}` : `ดาวน์โหลด ${file.fileName}`}
                            >
                              <FileContent />
                            </a>
                          )}
                        </li>
                      );
                    })
                  ) : (
                    <p className="text-sm text-slate-500">ไม่มีไฟล์แนบในฉบับล่าสุด</p>
                  )}
                </ul>
              </div>
            </div>

            {/* Action Panels */}
            <div className="p-6 border-t bg-slate-50 relative mt-auto">

              {/* 1. Site Review Panel */}
              {isSiteReviewing && (
                <div className="space-y-6">
                  <div className="pb-3 border-b border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800">ดำเนินการ (Site)</h3>
                  </div>

                  {needsDocNumber && (
                    <div className="p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-r-md">
                      <label className="text-sm font-bold text-yellow-800 mb-2 block">
                        <AlertTriangle size={16} className="inline mr-2" />
                        กรุณาระบุเลขที่เอกสาร (Required)
                      </label>
                      <input
                        type="text"
                        value={newDocumentNumberInput}
                        onChange={(e) => setNewDocumentNumberInput(e.target.value)}
                        placeholder="กรอกเลขที่เอกสารที่นี่..."
                        className="w-full p-2 border rounded-md text-sm border-yellow-300 focus:ring-yellow-500 focus:border-yellow-500 bg-white text-gray-900"
                      />
                      <p className="text-xs text-yellow-700 mt-1">เอกสารนี้ยังไม่มีเลขที่เอกสาร คุณต้องกำหนดก่อนส่งต่อไปยัง CM</p>
                    </div>
                  )}

                  {/* Step 1: File Upload */}
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">1</span>
                      <h4 className="font-semibold text-slate-800 text-base">แนบไฟล์ประกอบการพิจารณา</h4>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">
                        แนบไฟล์ <span className="text-red-700">*</span>
                      </label>
                      <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center hover:border-blue-500 transition-colors">
                        <input type="file" multiple onChange={(e) => handleFileUpload(e, 'action')} className="hidden" id="action-file-upload" />
                        <label htmlFor="action-file-upload" className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center">
                          <Upload size={16} className="mr-2" />
                          คลิกเพื่อเลือกไฟล์
                        </label>
                      </div>

                      {renderFileList(newFiles, 'action')}

                    </div>
                  </div>

                  {/* Step 2 (Optional): Suspend Old Document */}
                  {document.previousRevisionId && !document.isFromSupersedeRequest && (
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                      <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">2</span>
                        <h4 className="font-semibold text-slate-800 text-base">จัดการเอกสารฉบับเดิม</h4>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                          <span className="text-blue-500 text-sm flex-shrink-0">ℹ️</span>
                          <p className="text-xs text-blue-700 leading-relaxed">
                            เอกสาร <span className="font-semibold">{document?.documentNumber}</span> เป็นฉบับแก้ไขจากฉบับเดิมที่เคยอนุมัติแล้ว และกำลังเผยแพร่ให้ใช้งานอยู่ในขณะนี้
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-gray-700">
                          กรุณาเลือกสถานะของเอกสาร (ฉบับเดิม) ในระหว่างดำเนินการตรวจสอบ
                        </p>

                        {/* Option 1: ยังใช้งานได้ */}
                        <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${!suspendPreviousRevision ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                          <input
                            type="radio"
                            name="suspend-prev-rev-option"
                            checked={!suspendPreviousRevision}
                            onChange={() => setSuspendPreviousRevision(false)}
                            className="mt-0.5 h-4 w-4 text-green-600 cursor-pointer flex-shrink-0"
                          />
                          <div>
                            <p className="text-sm font-semibold text-gray-800">✅ ยังให้ใช้งานฉบับเดิมได้ตามปกติ</p>
                            <p className="text-xs text-gray-500 mt-0.5">หน้างานยังดาวน์โหลดและใช้อ้างอิงฉบับเดิมได้ระหว่างรอฉบับแก้ไขนี้อนุมัติ</p>
                          </div>
                        </label>

                        {/* Option 2: ระงับทันที */}
                        <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${suspendPreviousRevision ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                          <input
                            type="radio"
                            name="suspend-prev-rev-option"
                            checked={suspendPreviousRevision}
                            onChange={() => setSuspendPreviousRevision(true)}
                            className="mt-0.5 h-4 w-4 text-red-600 cursor-pointer flex-shrink-0"
                          />
                          <div>
                            <p className="text-sm font-semibold text-gray-800">⛔ ระงับการใช้งานฉบับเดิมทันที</p>
                            <p className="text-xs text-gray-500 mt-0.5">หน้างานจะเปิดหรือดาวน์โหลดฉบับเดิมไม่ได้อีกต่อไป — ใช้เมื่อฉบับเดิมมีข้อผิดพลาดร้ายแรงและห้ามนำไปใช้งานต่อ</p>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Comments & Action */}
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">
                        {(document.previousRevisionId && !document.isFromSupersedeRequest) ? '3' : '2'}
                      </span>
                      <h4 className="font-semibold text-slate-800 text-base">ความคิดเห็น</h4>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">แสดงความคิดเห็น (Optional)</label>
                      <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="เพิ่มความคิดเห็น/เหตุผลประกอบ (Optional)..." className="w-full p-3 border border-slate-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-blue-500 focus:border-blue-500 transition-colors" rows={3} />
                    </div>
                    <div className="flex flex-wrap justify-end gap-3">
                      <button
                        onClick={() => handleAction('REQUEST_REVISION')}
                        disabled={isActionDisabled}
                        className="flex items-center px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:bg-slate-200 disabled:cursor-not-allowed"
                      >
                        {loadingAction === 'REQUEST_REVISION' ? <Spinner className="w-4 h-4 mr-2" /> : <Edit3 size={16} className="mr-2" />} ขอแก้ไข
                      </button>
                      <button
                        onClick={() => handleAction('SEND_TO_CM')}
                        disabled={isActionDisabled || (needsDocNumber && !newDocumentNumberInput.trim())}
                        className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed"
                      >
                        {loadingAction === 'SEND_TO_CM' ? <Spinner className="w-4 h-4 mr-2" /> : <Send size={16} className="mr-2" />} ส่งให้ CM
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. Resubmission Panel (Creator) */}
              {isResubmissionFlow && (
                <div className="space-y-6">
                  <div className="pb-3 border-b border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800">ส่งเอกสารฉบับแก้ไข</h3>
                  </div>

                  {/* Step 1: File Upload */}
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">1</span>
                      <h4 className="font-semibold text-slate-800 text-base">แนบไฟล์ที่แก้ไขแล้ว</h4>
                    </div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">แนบไฟล์ <span className="text-red-700">*</span></label>
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center hover:border-blue-500 transition-colors">
                      <input type="file" multiple onChange={(e) => handleFileUpload(e, 'resubmission')} className="hidden" id="resubmit-file-upload" />
                      <label htmlFor="resubmit-file-upload" className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center">
                        <Upload size={16} className="mr-2" />
                        คลิกเพื่อเลือกไฟล์
                      </label>
                    </div>
                    {renderFileList(newFiles, 'resubmission')}
                  </div>

                  {/* Step 2: Comment & Submit */}
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">2</span>
                      <h4 className="font-semibold text-slate-800 text-base">หมายเหตุการแก้ไข & ส่ง</h4>
                    </div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">หมายเหตุ (Optional)</label>
                    <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="เช่น แก้ไขตาม Comment จาก CM..." className="w-full p-3 border border-slate-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-blue-500 focus:border-blue-500" rows={3} />
                    <div className="flex justify-end">
                      <button
                        onClick={handleResubmitRevision}
                        disabled={isSubmitting || newFiles.filter(f => f.status === 'success').length === 0}
                        className="flex items-center px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed shadow-sm"
                      >
                        {loadingAction === 'SUBMIT_REVISION' ? <Spinner className="w-4 h-4 mr-2" /> : <Send size={16} className="mr-2" />}
                        ส่งให้ Site ตรวจสอบอีกครั้ง
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ✅ Supersede Request Button (สำหรับ Approved Docที่ยังไม่มีคำสั่งแก้) */}
              {(canRequestSupersede && !document.supersededComment) && (
                <div className="flex justify-end mb-4">
                  <button
                    onClick={() => setShowSupersedeModal(true)}
                    className="flex items-center px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors"
                  >
                    <RefreshCw size={16} className="mr-2" />
                    ขอสร้าง Revision ใหม่
                  </button>
                </div>
              )}

              {/* Warning Box (View Only) - สำหรับคนที่ไม่มีสิทธิ์สร้าง Rev ใหม่ แต่ต้องเห็นคำสั่ง */}
              {!!document.supersededComment && !isRevisionFlow && (
                <div className="bg-orange-50 p-6 rounded-lg border border-orange-200 shadow-sm space-y-4 mb-4">
                  <h3 className="text-lg font-bold text-orange-800 flex items-center border-b border-orange-200 pb-2">
                    <AlertTriangle className="mr-2" size={20} />
                    สิ่งที่ต้องแก้ไขใน Rev. ถัดไป
                  </h3>
                  <div className="bg-white p-4 rounded-md text-orange-900 border border-orange-100">
                    <p className="whitespace-pre-wrap text-base font-medium">{document.supersededComment}</p>
                  </div>
                </div>
              )}

              {/* 3. Revision Creation Panel */}
              {isRevisionFlow && (
                <div className="space-y-6">
                  <div className="pb-3 border-b border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800">สร้างเอกสารฉบับแก้ไข</h3>
                  </div>

                  {/* Supersede Comment Banner */}
                  {!!document.supersededComment && (
                    <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 shadow-sm">
                      <h4 className="text-sm font-bold text-orange-800 flex items-center mb-2">
                        <AlertTriangle className="mr-2" size={16} />
                        สิ่งที่ต้องแก้ไขใน Rev. นี้
                      </h4>
                      <p className="whitespace-pre-wrap text-sm text-orange-900 font-medium">{document.supersededComment}</p>
                    </div>
                  )}

                  {/* BIM Verification Status */}
                  {requiresBimVerification && (isVerifyingTask || verificationError) && (
                    <div className="p-3 rounded-lg text-sm font-medium flex items-center border bg-slate-50">
                      {isVerifyingTask && (
                        <>
                          <Spinner className="w-4 h-4 mr-3 text-gray-500" />
                          <span className="text-gray-600">กำลังตรวจสอบ Task ในระบบ BIM Tracking...</span>
                        </>
                      )}
                      {verificationError && (
                        <div className="flex items-center justify-between w-full">
                          <span className="text-red-600 font-semibold">{verificationError}</span>
                          <button onClick={verifyBimTask} className="ml-4 px-3 py-1 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-md transition-colors font-medium flex-shrink-0 flex items-center">
                            <RefreshCw size={14} className="mr-1.5" /> ลองใหม่
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {(!requiresBimVerification || isTaskVerified) && (
                    <>
                      {/* Step 1: File Upload */}
                      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">1</span>
                          <h4 className="font-semibold text-slate-800 text-base">แนบไฟล์ที่แก้ไขแล้ว</h4>
                        </div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">แนบไฟล์ <span className="text-red-700">*</span></label>
                        <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center hover:border-blue-500 transition-colors">
                          <input type="file" multiple onChange={(e) => handleFileUpload(e, 'revision')} className="hidden" id="revision-file-upload" />
                          <label htmlFor="revision-file-upload" className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center">
                            <Upload size={16} className="mr-2" />
                            คลิกเพื่อเลือกไฟล์
                          </label>
                        </div>
                        {renderFileList(revisionFiles, 'revision')}
                      </div>

                      {/* Step 2: Comment & Submit */}
                      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">2</span>
                          <h4 className="font-semibold text-slate-800 text-base">หมายเหตุการแก้ไข & ส่ง</h4>
                        </div>
                        <label className="text-sm font-medium text-gray-700 mb-1.5 block">หมายเหตุ (Optional)</label>
                        <textarea
                          value={revisionComment}
                          onChange={(e) => setRevisionComment(e.target.value)}
                          placeholder="เช่น แก้ไขตาม Comment จาก CM..."
                          className="w-full p-3 border border-slate-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                          rows={3}
                        />
                        <div className="flex justify-end">
                          <button
                            onClick={handleCreateRevision}
                            disabled={isSubmitting || revisionFiles.filter(f => f.status === 'success').length === 0}
                            className={`flex items-center px-6 py-2.5 text-sm font-medium text-white rounded-lg transition-colors shadow-sm disabled:cursor-not-allowed ${!!document.supersededComment
                                ? 'bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300'
                                : 'bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300'
                              }`}
                          >
                            {isSubmitting ? <Spinner className="w-4 h-4 mr-2" /> : <Send size={16} className="mr-2" />}
                            ส่งเอกสารฉบับแก้ไข (Rev.{String((document.revisionNumber || 0) + 1).padStart(2, '0')})
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}


              {isApproving && (
                <div className="space-y-6">
                  <div className="pb-3 border-b border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800">ดำเนินการ (อนุมัติ)</h3>
                  </div>

                  {/* Step 1: File Upload */}
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">1</span>
                      <h4 className="font-semibold text-slate-800 text-base">แนบไฟล์ประกอบการอนุมัติ</h4>
                    </div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">แนบไฟล์ <span className="text-red-700">*</span></label>
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center hover:border-blue-500 transition-colors">
                      <input type="file" multiple onChange={(e) => handleFileUpload(e, 'action')} className="hidden" id="action-file-upload-final" />
                      <label htmlFor="action-file-upload-final" className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center">
                        <Upload size={16} className="mr-2" />
                        คลิกเพื่อเลือกไฟล์
                      </label>
                    </div>
                    {renderFileList(newFiles, 'action')}
                  </div>

                  {/* Step 2: Comment & Decision */}
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">2</span>
                      <h4 className="font-semibold text-slate-800 text-base">ความคิดเห็น</h4>
                    </div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">แสดงความคิดเห็น (Optional)</label>
                    <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="เพิ่มความคิดเห็น/เหตุผลประกอบ..." className="w-full p-3 border border-slate-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-blue-500 focus:border-blue-500 transition-colors" rows={3} />

                    {/* H7: Improved button hierarchy — REJECT far left outline, approve actions far right solid */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
                      {/* Destructive action — left, outline style */}
                      <button
                        onClick={() => handleAction('REJECT')}
                        disabled={isActionDisabled}
                        className="flex items-center px-4 py-2 text-sm font-medium text-red-600 bg-white border-2 border-red-300 rounded-lg hover:bg-red-50 hover:border-red-500 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-red-500 outline-none transition-colors"
                      >
                        {loadingAction === 'REJECT' ? <Spinner className="w-4 h-4 mr-2" /> : <ThumbsDown size={16} className="mr-2" />} ไม่อนุมัติ
                      </button>
                      {/* Approval actions — right, solid (ascending visual weight) */}
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleAction('APPROVE_REVISION_REQUIRED')}
                          disabled={isActionDisabled}
                          className="flex items-center px-4 py-2 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-amber-400 outline-none transition-colors"
                        >
                          {loadingAction === 'APPROVE_REVISION_REQUIRED' ? <Spinner className="w-4 h-4 mr-2" /> : <Edit3 size={16} className="mr-2" />} อนุมัติ (ต้องแก้ไข)
                        </button>
                        <button
                          onClick={() => handleAction('APPROVE_WITH_COMMENTS')}
                          disabled={isActionDisabled}
                          className="flex items-center px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-teal-500 outline-none transition-colors"
                        >
                          {loadingAction === 'APPROVE_WITH_COMMENTS' ? <Spinner className="w-4 h-4 mr-2" /> : <MessageSquare size={16} className="mr-2" />} อนุมัติ (มีคอมเมนต์)
                        </button>
                        <button
                          onClick={() => handleAction('APPROVE')}
                          disabled={isActionDisabled}
                          className="flex items-center px-5 py-2 text-sm font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-green-500 outline-none transition-colors shadow-sm"
                        >
                          {loadingAction === 'APPROVE' ? <Spinner className="w-4 h-4 mr-2" /> : <ThumbsUp size={16} className="mr-2" />} อนุมัติ
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
      {showHistory && (
        <WorkflowHistoryModal
          workflow={document.workflow || []}
          onClose={() => setShowHistory(false)}
          userRole={user?.role}
          cmSystemType={document.site?.cmSystemType}
          docId={document.id}
          docNumber={document.documentNumber || document.runningNumber}
          siteId={document.site.id}
          siteName={document.site.name}
        />
      )}

      {/* Modal #1: ขอแก้ไข Rev. ใหม่ */}
      {showSupersedeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-bold text-orange-700 flex items-center">
                <RefreshCw size={18} className="mr-2" />
                ขอแก้ไขเอกสาร (สร้าง Rev. ใหม่)
              </h3>
              <button onClick={() => setShowSupersedeModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={22} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
                <strong>{document.documentNumber}</strong> Rev.{String(document.revisionNumber || 0).padStart(2, '0')} (อนุมัติ) จะถูกขอแก้ไข
              </div>

              {/* Comment — บังคับ */}
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1 block">
                  เหตุผล / คำสั่งแก้ไข <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={supersedeComment}
                  onChange={e => setSupersedeComment(e.target.value)}
                  placeholder="ระบุเหตุผลหรือคำสั่งจาก CM / ผู้มีอำนาจ..."
                  className="w-full p-2 border rounded-md text-sm bg-white text-gray-900"
                  rows={3}
                />
              </div>

              {/* File Upload — บังคับ */}
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1 block">
                  แนบไฟล์หลักฐานคำสั่ง <span className="text-red-600">*</span>
                </label>
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-3 text-center hover:border-orange-400 transition-colors">
                  <input
                    type="file"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (!files.length) return;
                      const fileObjs: UploadedFile[] = files.map(file => ({ id: `${file.name}-${Date.now()}`, file, status: 'pending', progress: 0 }));
                      setSupersedeFiles(prev => [...prev, ...fileObjs]);
                      fileObjs.forEach(fo => uploadTempFile(fo, 'supersede').catch(() => {
                        setSupersedeFiles(prev => prev.map(f => f.id === fo.id ? { ...f, status: 'error' } : f));
                      }));
                      e.target.value = '';
                    }}
                    className="hidden"
                    id="supersede-file-upload"
                  />
                  <label htmlFor="supersede-file-upload" className="cursor-pointer text-orange-600 hover:text-orange-800 font-medium flex items-center justify-center text-sm">
                    <Upload size={14} className="mr-2" />
                    คลิกเพื่อเลือกไฟล์
                  </label>
                </div>
                {supersedeFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {supersedeFiles.map((f, i) => (
                      <div key={f.id} className="flex items-center text-xs text-gray-700 bg-slate-50 rounded p-1.5">
                        {f.status === 'uploading' ? <Spinner className="w-3 h-3 mr-2 text-blue-500" /> :
                          f.status === 'success' ? <Check className="w-3 h-3 mr-2 text-green-500" /> :
                            f.status === 'error' ? <AlertTriangle className="w-3 h-3 mr-2 text-red-500" /> :
                              <FileText className="w-3 h-3 mr-2 text-slate-500" />}
                        <span className="flex-1 truncate">{f.file.name}</span>
                        <button onClick={() => setSupersedeFiles(prev => prev.filter((_, idx) => idx !== i))} className="ml-2 text-gray-400 hover:text-red-500" type="button">
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Suspend Option — Radio Buttons */}
              <div className="space-y-2">
                {/* Info Banner */}
                <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-md">
                  <span className="text-amber-500 text-sm flex-shrink-0">⚠️</span>
                  <p className="text-xs text-amber-700">
                    เอกสาร <span className="font-semibold">{document?.documentNumber}</span> ได้รับการอนุมัติและกำลังเผยแพร่ให้ใช้งานในโครงการอยู่ อาจมีผู้ใช้งานอ้างอิงฉบับนี้อยู่ในขณะนี้
                  </p>
                </div>
                <p className="text-sm font-semibold text-gray-700">
                  กรุณาเลือกสถานะของเอกสาร <span className="text-orange-600">{document?.documentNumber}</span> ในระหว่างดำเนินการขอแก้ไข
                </p>

                {/* Option 1: ยังใช้งานได้ */}
                <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${!suspendOldDoc ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                  <input
                    type="radio"
                    name="suspend-option"
                    checked={!suspendOldDoc}
                    onChange={() => setSuspendOldDoc(false)}
                    className="mt-0.5 h-4 w-4 text-green-600 cursor-pointer flex-shrink-0"
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">✅ ยังให้ใช้งานได้ตามปกติ</p>
                    <p className="text-xs text-gray-500 mt-0.5">หน้างานยังดาวน์โหลดและใช้เอกสารฉบับนี้ได้ระหว่างรอฉบับแก้ไข</p>
                  </div>
                </label>

                {/* Option 2: ระงับทันที */}
                <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${suspendOldDoc ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                  <input
                    type="radio"
                    name="suspend-option"
                    checked={suspendOldDoc}
                    onChange={() => setSuspendOldDoc(true)}
                    className="mt-0.5 h-4 w-4 text-red-600 cursor-pointer flex-shrink-0"
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">⛔ ระงับการใช้งานทันที</p>
                    <p className="text-xs text-gray-500 mt-0.5">หน้างานจะเปิดหรือดาวน์โหลดเอกสารฉบับนี้ไม่ได้ — ใช้เมื่อเอกสารมีข้อผิดพลาดร้ายแรงและห้ามนำไปใช้งานต่อ</p>
                  </div>
                </label>
              </div>

            </div>
            <div className="flex justify-end gap-3 p-4 border-t bg-slate-50">
              <button
                onClick={() => { setShowSupersedeModal(false); setSupersedeComment(''); setSupersedeFiles([]); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSupersedeRequest}
                disabled={isSupersedeSubmitting || !supersedeComment.trim() || supersedeFiles.filter(f => f.status === 'success').length === 0}
                className="flex items-center px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:bg-orange-300 disabled:cursor-not-allowed"
              >
                {isSupersedeSubmitting ? <Spinner className="w-4 h-4 mr-2" /> : <RefreshCw size={16} className="mr-2" />}
                ยืนยัน และสร้าง Rev. ใหม่
              </button>
            </div>
          </div>
        </div>
      )}

      <PDFPreviewModal
        isOpen={!!previewFile}
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        allowEdit={canEditPDF}
        onSave={handleAnnotateSave}
        onDownload={() => {
          logActivity({
            action: 'DOWNLOAD_FILE',
            resourceType: 'RFA',
            resourceId: document.id,
            resourceName: document.documentNumber || document.runningNumber,
            siteId: document.site?.id,
            siteName: document.site?.name,
            description: `ดาวน์โหลดไฟล์เอกสาร "${previewFile?.fileName}"`
          });
        }}
      />
    </>
  )
}