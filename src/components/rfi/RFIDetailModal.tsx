'use client'

// src/components/rfi/RFIDetailModal.tsx
//
// The RFI action screen. Modelled on RFADetailModal, with three deliberate differences:
//
//   1. No revision / supersede / CAD-warning flows. An RFI is a question-and-answer
//      conversation, not a published document with revisions (see types/rfi.ts).
//   2. Six possible actions instead of RFA's approve/reject ladder, and every one of
//      them is read straight from `document.permissions` — never from `user.role` —
//      so the buttons shown can never disagree with what the API accepts.
//   3. Files carry an `audience` ('BIM' | 'CM' | null). ANSWER_AND_FORWARD uploads two
//      sets in one action, so uploads are tracked per UPLOAD TARGET ('bim' | 'cm' |
//      'action'), not in one shared list the way RFA does it.

import React, { useState, useMemo, useEffect } from 'react'
import { RFIDocument, RFIPermissions, RFIWorkflowStep, RFIFile } from '@/types/rfi'
import {
  X, Paperclip, Check, Send, AlertTriangle, FileText, History,
  Upload, CornerUpLeft, Hourglass, CalendarClock, Split,
} from 'lucide-react'
import Spinner from '@/components/shared/Spinner'
import LoadingOverlay from '@/components/shared/LoadingOverlay'
import { useAuth } from '@/lib/auth/useAuth'
import { useNotification } from '@/lib/context/NotificationContext'
import { useLogActivity } from '@/lib/hooks/useLogActivity'
import { useScrollLock } from '@/hooks/useScrollLock'
import { storage } from '@/lib/firebase/client'
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import {
  RFI_ACTIONS, RFI_ACTION_LABELS, RFI_STATUSES,
  RFI_PARTY_LABELS, RFI_PARTY_COLORS, RFI_AWAITING_CM_COLOR, RFI_AWAITING_CM_LABEL,
  RFI_TARGET_TO_AUDIENCE, RFIUploadTarget,
  getRfiStatusLabel, getRfiStatusColor, getResponsibleParties,
  isOverdue, toRfiDate, askerParty,
} from '@/lib/config/rfi-workflow'

// --- Helpers (identical to RFAListTable/RFIListTable so dates read the same everywhere) ---
const formatDateTime = (value: unknown): string => {
  const d = toRfiDate(value);
  if (!d) return '-';
  return d.toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const formatDate = (value: unknown): string => {
  const d = toRfiDate(value);
  if (!d) return '-';
  return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
};
const formatFileSize = (bytes: number): string => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const badgeStyle = (hex: string) => ({ backgroundColor: `${hex}1A`, color: hex });

const AUDIENCE_LABEL: Record<string, string> = { BIM: 'ส่งถึง BIM', CM: 'ส่งถึง CM' };

const SITE_MODE_META: Record<'answer' | 'forward' | 'both', {
  icon: typeof CornerUpLeft;
  label: string;
  activeClass: string;
  iconActiveClass: string;
  defaultClass: string;
  iconDefaultClass: string;
}> = {
  answer: {
    icon: CornerUpLeft,
    label: 'มีข้อมูล — ตอบกลับ BIM',
    activeClass: 'border-blue-600 bg-blue-600 text-white shadow-sm',
    iconActiveClass: 'text-white',
    defaultClass: 'border-slate-200 bg-white text-slate-800 hover:border-blue-300 hover:shadow-md',
    iconDefaultClass: 'text-blue-600',
  },
  forward: {
    icon: Send,
    label: 'ไม่มีข้อมูล — ต้องส่งต่อ CM',
    activeClass: 'border-orange-600 bg-orange-600 text-white shadow-sm',
    iconActiveClass: 'text-white',
    defaultClass: 'border-slate-200 bg-white text-slate-800 hover:border-orange-300 hover:shadow-md',
    iconDefaultClass: 'text-orange-600',
  },
  both: {
    icon: Split,
    label: 'บางส่วนมี บางส่วนไม่มี — ตอบกลับ + ส่งต่อ CM',
    activeClass: 'border-teal-600 bg-teal-600 text-white shadow-sm',
    iconActiveClass: 'text-white',
    defaultClass: 'border-slate-200 bg-white text-slate-800 hover:border-teal-300 hover:shadow-md',
    iconDefaultClass: 'text-teal-600',
  },
};

// --- Workflow history (timeline) ---
function WorkflowHistoryModal({
  workflow, origin, onClose,
}: {
  workflow: RFIWorkflowStep[];
  origin?: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-bold text-gray-800 flex items-center">
            <History size={20} className="mr-2" /> ประวัติการดำเนินงาน
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 outline-none" aria-label="ปิด">
            <X size={24} aria-hidden="true" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          <div className="border-l-2 border-gray-200 ml-2">
            {workflow.length > 0 ? (
              workflow.map((item, index) => (
                <div key={index} className="relative pl-6 pb-8 last:pb-0">
                  <div
                    className="absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white z-10"
                    style={{ backgroundColor: getRfiStatusColor({ status: item.status, origin }) }}
                  />
                  <p className="font-semibold text-gray-800">
                    {RFI_ACTION_LABELS[item.action as keyof typeof RFI_ACTION_LABELS] || item.action}
                  </p>
                  <p className="text-sm text-gray-600">โดย: {item.userName} ({item.role})</p>
                  <time className="text-xs text-gray-400">{formatDateTime(item.timestamp)}</time>
                  {item.comments && (
                    <div className="mt-2 p-2 bg-gray-50 rounded-md text-xs italic">
                      <p className="text-gray-600">&quot;{item.comments}&quot;</p>
                    </div>
                  )}
                  {item.files && item.files.length > 0 && (
                    <div className="mt-2 pl-2 border-l-2 border-gray-100">
                      <ul className="space-y-1">
                        {item.files.map((file, fi) => (
                          <li key={fi} className="flex items-center text-xs text-gray-600">
                            <FileText size={12} className="mr-2 flex-shrink-0" />
                            <a href={file.fileUrl} target="_blank" rel="noopener noreferrer" className="truncate hover:underline" title={file.fileName}>
                              {file.fileName}
                            </a>
                            {file.audience && (
                              <span className="ml-2 text-[10px] text-gray-400 flex-shrink-0">({AUDIENCE_LABEL[file.audience]})</span>
                            )}
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
}

// --- Interfaces ---
interface RFIDetailModalProps {
  document: RFIDocument | null;
  onClose: () => void;
  showOverlay?: boolean;
}
interface UploadedFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  uploadedData?: Omit<RFIFile, 'audience'>;
  error?: string;
}
type FilesByTarget = Record<RFIUploadTarget, UploadedFile[]>;
const EMPTY_FILES: FilesByTarget = { action: [], bim: [], cm: [] };

// --- Main component ---
export default function RFIDetailModal({ document: initialDoc, onClose, showOverlay = true }: RFIDetailModalProps) {
  const { user, firebaseUser } = useAuth();
  const { showNotification } = useNotification();
  const { logActivity } = useLogActivity();

  const [document, setDocument] = useState<RFIDocument | null>(initialDoc);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [comment, setComment] = useState('');
  const [docNumberInput, setDocNumberInput] = useState('');
  const [filesByTarget, setFilesByTarget] = useState<FilesByTarget>(EMPTY_FILES);
  // SITE picks HOW it's handling the question before any upload field appears — asking
  // for a BIM-reply file and a CM-forward file at once (the old layout) reads as "attach
  // both", which is wrong for the common case of only one applying.
  const [siteMode, setSiteMode] = useState<'answer' | 'forward' | 'both' | null>(null);

  useScrollLock(true);

  const isActionActiveRef = React.useRef(false);
  isActionActiveRef.current = isSubmitting || isClosing || !!successMessage;

  const triggerClose = () => {
    setIsClosing(true);
    setTimeout(() => onClose(), 200);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !isSubmitting) triggerClose();
  };

  // 1. Fetch the full document (permissions only exist on the API response, not on the
  //    summary object the list table passes in).
  useEffect(() => {
    if (isActionActiveRef.current) return;
    const fetchFullDocument = async () => {
      if (!initialDoc || !firebaseUser) { setIsLoading(false); return; }
      setIsLoading(true);
      try {
        const token = await firebaseUser.getIdToken();
        const response = await fetch(`/api/rfi/${initialDoc.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await response.json();
        if (result.success) setDocument(result.document);
        else setDocument(initialDoc);
      } catch {
        setDocument(initialDoc);
      } finally {
        setIsLoading(false);
      }
    };
    fetchFullDocument();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDoc, firebaseUser]);

  // Only the current step's files — full history lives in the "ประวัติ" modal (WorkflowHistoryModal).
  const currentStepFiles = useMemo(() => {
    const workflow = document?.workflow || [];
    return workflow[workflow.length - 1]?.files || [];
  }, [document]);

  // 2. Loading skeleton
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
          <div className="flex justify-between items-start p-4 border-b border-gray-200">
            <div className="space-y-2.5">
              <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
              <div className="h-5 w-64 bg-gray-200 rounded animate-pulse" />
            </div>
            <div className="h-8 w-8 bg-gray-200 rounded-full animate-pulse" />
          </div>
          <div className="flex-1 p-6 space-y-4">
            <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
            <div className="h-10 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!document) return null;

  const permissions = document.permissions || {} as RFIPermissions;
  const overdue = isOverdue(document);
  const responsibleParties = getResponsibleParties(document);
  const asker = askerParty(document.origin);

  const showSitePanel = permissions.canAnswer || permissions.canForwardToCm || permissions.canAnswerAndForward;
  const showCmPanel = permissions.canRecordCmReply;
  const showAskerPanel = permissions.canRequestMoreInfo;
  const needsDocNumber = !document.documentNumber && (permissions.canForwardToCm || permissions.canAnswerAndForward);

  // Mode-select-first: skip the selector entirely when SITE only has one option anyway.
  const allowedSiteModes: Array<'answer' | 'forward' | 'both'> = [
    ...(permissions.canAnswer ? (['answer'] as const) : []),
    ...(permissions.canForwardToCm ? (['forward'] as const) : []),
    ...(permissions.canAnswerAndForward ? (['both'] as const) : []),
  ];
  const effectiveSiteMode = siteMode ?? (allowedSiteModes.length === 1 ? allowedSiteModes[0] : null);

  // 3. File handling — one temp-upload path per target, tagged with its audience only
  //    when the action is actually submitted (see buildPayloadFiles).
  const uploadTempFile = (target: RFIUploadTarget, fileObj: UploadedFile) => {
    return new Promise<void>((resolve, reject) => {
      if (!user?.id) { reject(new Error('User ID not found for upload.')); return; }
      const tempPath = `temp/${user.id}/${Date.now()}_${fileObj.file.name}`;
      const storageRef = ref(storage, tempPath);
      const uploadTask = uploadBytesResumable(storageRef, fileObj.file, {
        contentType: fileObj.file.type || 'application/octet-stream',
      });
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setFilesByTarget(prev => ({
            ...prev,
            [target]: prev[target].map(f => f.id === fileObj.id ? { ...f, progress, status: 'uploading' } : f),
          }));
        },
        (error) => {
          setFilesByTarget(prev => ({
            ...prev,
            [target]: prev[target].map(f => f.id === fileObj.id ? { ...f, status: 'error', error: error.message } : f),
          }));
          reject(error);
        },
        async () => {
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            const uploadedData: Omit<RFIFile, 'audience'> = {
              fileName: fileObj.file.name,
              fileUrl: downloadUrl,
              filePath: tempPath,
              size: fileObj.file.size,
              fileSize: fileObj.file.size,
              contentType: fileObj.file.type,
              uploadedAt: new Date().toISOString(),
              uploadedBy: user.email || user.id,
            };
            setFilesByTarget(prev => ({
              ...prev,
              [target]: prev[target].map(f => f.id === fileObj.id ? { ...f, status: 'success', progress: 100, uploadedData } : f),
            }));
            resolve();
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, target: RFIUploadTarget) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const uploaded: UploadedFile[] = files.map(file => ({
      id: `${target}-${file.name}-${Date.now()}`, file, status: 'pending', progress: 0,
    }));
    setFilesByTarget(prev => ({ ...prev, [target]: [...prev[target], ...uploaded] }));
    uploaded.forEach(fileObj => {
      uploadTempFile(target, fileObj).catch(err => console.error('Upload failed for', fileObj.file.name, err));
    });
    event.target.value = '';
  };

  const removeFile = async (target: RFIUploadTarget, index: number) => {
    const fileToRemove = filesByTarget[target][index];
    if (fileToRemove.status === 'success' && fileToRemove.uploadedData?.filePath) {
      try { await deleteObject(ref(storage, fileToRemove.uploadedData.filePath)); } catch { /* best effort */ }
    }
    setFilesByTarget(prev => ({ ...prev, [target]: prev[target].filter((_, i) => i !== index) }));
  };

  const successCount = (target: RFIUploadTarget) =>
    filesByTarget[target].filter(f => f.status === 'success').length;

  const renderFileList = (target: RFIUploadTarget) => (
    <div className="mt-2 space-y-2">
      {filesByTarget[target].map((fileObj, index) => (
        <div key={fileObj.id} className="flex items-center text-sm p-2 bg-slate-100 rounded group">
          <div className="mr-3 flex-shrink-0" title={fileObj.status}>
            {fileObj.status === 'uploading' ? <Spinner className="w-4 h-4 text-blue-500" />
              : fileObj.status === 'success' ? <Check className="w-4 h-4 text-green-500" />
              : fileObj.status === 'error' ? <AlertTriangle className="w-4 h-4 text-red-500" />
              : <FileText className="w-4 h-4 text-slate-500" />}
          </div>
          <span className={`flex-1 truncate mr-2 ${fileObj.status === 'error' ? 'text-red-600' : 'text-gray-700'}`} title={fileObj.status === 'error' ? fileObj.error : fileObj.file.name}>
            {fileObj.file.name}
          </span>
          <button onClick={() => removeFile(target, index)} className="p-1.5 text-gray-500 hover:text-red-600 rounded-md hover:bg-white transition-colors" title="ลบไฟล์" type="button">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );

  const uploadSlot = (target: RFIUploadTarget, label: string, inputId: string) => (
    <div>
      <label className="text-sm font-medium text-gray-700 mb-1 block">
        {label} <span className="text-red-700">*</span>
      </label>
      <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center hover:border-blue-500 transition-colors">
        <input type="file" multiple onChange={(e) => handleFileUpload(e, target)} className="hidden" id={inputId} />
        <label htmlFor={inputId} className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center">
          <Upload size={16} className="mr-2" /> คลิกเพื่อเลือกไฟล์
        </label>
      </div>
      {renderFileList(target)}
    </div>
  );

  // 4. Submit
  const buildPayloadFiles = (...targets: RFIUploadTarget[]): RFIFile[] =>
    targets.flatMap(target =>
      filesByTarget[target]
        .filter(f => f.status === 'success' && f.uploadedData)
        .map(f => ({ ...(f.uploadedData as Omit<RFIFile, 'audience'>), audience: RFI_TARGET_TO_AUDIENCE[target] }))
    );

  const executeAction = async (action: string, files: RFIFile[], extra?: { documentNumber?: string }) => {
    setIsSubmitting(true);
    setLoadingAction(action);
    let ok = false;
    try {
      const token = await firebaseUser?.getIdToken();
      const response = await fetch(`/api/rfi/${document.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, comments: comment, newFiles: files, ...extra }),
      });
      const result = await response.json();
      if (result.success) {
        // No client-side activity log here: PUT /api/rfi/[id] already writes one
        // server-side (with the fromStatus/toStatus metadata), so logging again here
        // would double every entry in the audit trail.
        ok = true;
        setSuccessMessage(RFI_ACTION_LABELS[action as keyof typeof RFI_ACTION_LABELS] || 'ดำเนินการสำเร็จ');
        showNotification('success', 'ดำเนินการสำเร็จ', `เอกสาร: ${document.runningNumber}`, true);
        setTimeout(() => triggerClose(), 1400);
      } else {
        throw new Error(result.error || 'เกิดข้อผิดพลาด');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      showNotification('error', 'เกิดข้อผิดพลาด', message);
    } finally {
      if (!ok) { setIsSubmitting(false); setLoadingAction(null); }
    }
  };

  const trimmedDocNumber = docNumberInput.trim();

  const handleAnswer = () => executeAction(RFI_ACTIONS.ANSWER, buildPayloadFiles('bim'));
  const handleForwardToCm = () => executeAction(RFI_ACTIONS.FORWARD_TO_CM, buildPayloadFiles('cm'), { documentNumber: trimmedDocNumber || undefined });
  const handleAnswerAndForward = () => executeAction(RFI_ACTIONS.ANSWER_AND_FORWARD, buildPayloadFiles('bim', 'cm'), { documentNumber: trimmedDocNumber || undefined });
  const handleCmReply = () => executeAction(RFI_ACTIONS.CM_REPLY, buildPayloadFiles('action'));
  const handleRequestMoreInfo = () => executeAction(RFI_ACTIONS.REQUEST_MORE_INFO, buildPayloadFiles('action'));

  const docNumberReady = !needsDocNumber || trimmedDocNumber.length > 0;

  const overlayClasses = showOverlay ? 'bg-black bg-opacity-50' : '';

  return (
    <>
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${isClosing ? 'opacity-0' : 'opacity-100'} ${overlayClasses}`}
        onClick={handleBackdropClick}
      >
        <div
          className={`bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col relative transform transition-all duration-200 ${isClosing ? 'scale-95 translate-y-2 opacity-0' : 'scale-100 translate-y-0 opacity-100'}`}
          onClick={(e) => e.stopPropagation()}
        >
          {isSubmitting && !successMessage && <LoadingOverlay subText="กรุณารอสักครู่" />}
          {successMessage && (
            <div className="absolute inset-0 z-[100] flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-sm">
              <div className="flex flex-col items-center p-8 bg-green-600 rounded-2xl shadow-2xl text-white text-center">
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mb-4 ring-4 ring-white/30">
                  <Check className="w-9 h-9 text-white" strokeWidth={2.5} />
                </div>
                <p className="font-bold text-lg">{successMessage}</p>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="flex justify-between items-start p-4 border-b border-gray-200">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                {document.documentNumber && (
                  <h3 className="text-lg font-bold text-blue-600">{document.documentNumber}</h3>
                )}
                {document.awaitingCm && document.status !== RFI_STATUSES.PENDING_CM && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium" style={badgeStyle(RFI_AWAITING_CM_COLOR)}>
                    + {RFI_AWAITING_CM_LABEL}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-semibold text-gray-800">{document.title}</h2>
              <p className="text-xs text-gray-500 mt-1">{document.runningNumber}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {responsibleParties.map(party => (
                  <span key={party} className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium" style={badgeStyle(RFI_PARTY_COLORS[party])}>
                    {RFI_PARTY_LABELS[party]}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4 flex-shrink-0">
              <button onClick={() => setShowHistory(true)} className="flex items-center text-sm text-gray-500 hover:text-blue-600 outline-none" aria-label="ดูประวัติการดำเนินงาน">
                <History size={16} className="mr-1" /> ประวัติ
              </button>
              <button onClick={triggerClose} className="text-gray-400 hover:text-gray-600 outline-none" aria-label="ปิด">
                <X size={24} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="p-6 space-y-6">
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <strong className="text-gray-700 font-semibold block mb-1">สถานะ:</strong>
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium" style={badgeStyle(getRfiStatusColor(document))}>
                      {getRfiStatusLabel(document)}
                    </span>
                  </div>
                  <div>
                    <strong className="text-gray-700 font-semibold block mb-1">หมวดงาน:</strong>
                    <span className="text-gray-900 font-medium">{document.category?.categoryCode || '-'}</span>
                  </div>
                  <div>
                    <strong className="text-gray-700 font-semibold block mb-1">โครงการ:</strong>
                    <span className="text-gray-900 font-medium">{document.site?.name || '-'}</span>
                  </div>
                  <div>
                    <strong className="text-gray-700 font-semibold block mb-1 flex items-center gap-1">
                      <CalendarClock size={14} /> กำหนดตอบ:
                    </strong>
                    <span className={`font-medium ${overdue ? 'text-red-600' : 'text-gray-900'}`}>
                      {document.dueDate ? formatDate(document.dueDate) : 'ไม่ได้กำหนด'}
                      {overdue && <span className="ml-1 text-xs font-semibold">(เกินกำหนด)</span>}
                    </span>
                  </div>
                </div>
                {document.description && (
                  <div className="mt-4">
                    <strong className="text-gray-700 font-semibold block text-sm">รายละเอียด:</strong>
                    <div className="text-gray-900 whitespace-pre-wrap bg-white p-3 rounded-md mt-1 border border-gray-300">
                      <p>{document.description}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Current step's files only — older steps' files stay in the "ประวัติ" (history) modal */}
              <div>
                <h4 className="text-md font-semibold mb-2 flex items-center text-slate-800">
                  <Paperclip size={16} className="mr-2" /> ไฟล์แนบล่าสุด
                </h4>
                <ul className="space-y-2">
                  {currentStepFiles.length > 0 ? (
                    currentStepFiles.map((file, index) => (
                      <li key={index} className="border rounded-md bg-slate-50 border-slate-200 hover:bg-slate-100">
                        <a
                          href={file.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full text-left p-2 rounded-md flex items-center"
                          onClick={() => logActivity({
                            action: 'DOWNLOAD_FILE',
                            resourceType: 'RFI',
                            resourceId: document.id,
                            resourceName: document.documentNumber || document.runningNumber,
                            resourceTitle: document.title,
                            siteId: document.site?.id,
                            siteName: document.site?.name,
                            description: `ดาวน์โหลดไฟล์ "${file.fileName}"`,
                          })}
                        >
                          <FileText className="w-5 h-5 text-gray-500 mr-3 flex-shrink-0" />
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-sm font-medium truncate text-blue-600 hover:underline">{file.fileName}</span>
                            <span className="text-xs text-gray-500">{formatFileSize(file.fileSize)}</span>
                          </div>
                          {file.audience && (
                            <span className="text-[11px] text-gray-500 flex-shrink-0 ml-2">{AUDIENCE_LABEL[file.audience]}</span>
                          )}
                        </a>
                      </li>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">ไม่มีไฟล์แนบ</p>
                  )}
                </ul>
              </div>
            </div>

            {/* Action panels */}
            <div className="p-6 border-t bg-slate-50">

              {/* SITE: pick how the question is being handled first, THEN show only the
                  upload field(s) that mode actually needs. */}
              {showSitePanel && (
                <div className="space-y-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <div className="pb-3 border-b border-slate-100">
                    <h3 className="text-base font-bold text-slate-800">ดำเนินการ (SITE)</h3>
                  </div>

                  <div>
                    <p className="text-sm text-gray-600 mb-2">เลือกวิธีดำเนินการกับคำถามนี้:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {allowedSiteModes.map((mode) => {
                        const meta = SITE_MODE_META[mode];
                        const Icon = meta.icon;
                        const isActive = effectiveSiteMode === mode;
                        const isLocked = !!effectiveSiteMode && !isActive;
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setSiteMode(mode)}
                            disabled={isLocked}
                            className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-center transition-all focus-visible:ring-2 outline-none ${
                              isActive
                                ? meta.activeClass
                                : isLocked
                                ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                                : meta.defaultClass
                            }`}
                          >
                            <Icon size={20} className={isActive ? meta.iconActiveClass : isLocked ? 'text-slate-300' : meta.iconDefaultClass} />
                            <span className="text-sm font-bold leading-tight">{meta.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {!effectiveSiteMode ? (
                    <div>
                      <label className="text-sm font-medium text-gray-400 mb-1 block">แนบไฟล์</label>
                      <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center bg-slate-50">
                        <span className="text-slate-400 font-medium flex items-center justify-center">
                          <Upload size={16} className="mr-2" /> เลือกวิธีดำเนินการด้านบนก่อน
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {allowedSiteModes.length > 1 && (
                        <button type="button" onClick={() => setSiteMode(null)} className="text-xs text-gray-500 hover:text-blue-600 flex items-center">
                          <CornerUpLeft size={12} className="mr-1" /> เปลี่ยนวิธีดำเนินการ
                        </button>
                      )}
                      {(effectiveSiteMode === 'forward' || effectiveSiteMode === 'both') && needsDocNumber && (
                        <div className="p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-r-md">
                          <label className="text-sm font-bold text-yellow-800 mb-2 block">
                            <AlertTriangle size={16} className="inline mr-2" /> เลขที่เอกสารสำหรับ CM (Required เมื่อจะส่งต่อ)
                          </label>
                          <input
                            type="text"
                            value={docNumberInput}
                            onChange={(e) => setDocNumberInput(e.target.value)}
                            placeholder="กรอกเลขที่เอกสารที่นี่..."
                            className="w-full p-2 border rounded-md text-sm border-yellow-300 bg-white text-gray-900"
                          />
                        </div>
                      )}
                      {(effectiveSiteMode === 'answer' || effectiveSiteMode === 'both') && uploadSlot('bim', 'ไฟล์คำตอบให้ BIM', 'rfi-upload-bim')}
                      {(effectiveSiteMode === 'forward' || effectiveSiteMode === 'both') && uploadSlot('cm', 'ไฟล์ส่งต่อให้ CM', 'rfi-upload-cm')}
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1.5 block">ความคิดเห็น (Optional)</label>
                        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className="w-full p-3 border border-slate-300 rounded-lg text-sm bg-white text-gray-900" placeholder="เพิ่มความคิดเห็น..." />
                      </div>
                      <div className="flex flex-wrap justify-end gap-3 pt-2 border-t border-slate-200">
                        {effectiveSiteMode === 'answer' && (
                          <button onClick={handleAnswer} disabled={isSubmitting || successCount('bim') === 0} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-blue-500 outline-none transition-colors">
                            {loadingAction === RFI_ACTIONS.ANSWER ? <Spinner className="w-4 h-4 mr-2" /> : <CornerUpLeft size={16} className="mr-2" />} ตอบกลับ BIM
                          </button>
                        )}
                        {effectiveSiteMode === 'forward' && (
                          <button onClick={handleForwardToCm} disabled={isSubmitting || successCount('cm') === 0 || !docNumberReady} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-orange-500 outline-none transition-colors">
                            {loadingAction === RFI_ACTIONS.FORWARD_TO_CM ? <Spinner className="w-4 h-4 mr-2" /> : <Send size={16} className="mr-2" />} ส่งต่อ CM
                          </button>
                        )}
                        {effectiveSiteMode === 'both' && (
                          <button onClick={handleAnswerAndForward} disabled={isSubmitting || successCount('bim') === 0 || successCount('cm') === 0 || !docNumberReady} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-teal-500 outline-none transition-colors">
                            {loadingAction === RFI_ACTIONS.ANSWER_AND_FORWARD ? <Spinner className="w-4 h-4 mr-2" /> : <Send size={16} className="mr-2" />} ตอบกลับ + ส่งต่อ CM
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* CM: record the reply */}
              {showCmPanel && (
                <div className={`space-y-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm ${showSitePanel ? 'mt-6' : ''}`}>
                  <div className="pb-3 border-b border-slate-100">
                    <h3 className="text-base font-bold text-slate-800">บันทึกคำตอบจาก CM</h3>
                  </div>
                  {uploadSlot('action', 'ไฟล์คำตอบจาก CM', 'rfi-upload-cm-reply')}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">ความคิดเห็น (Optional)</label>
                    <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className="w-full p-3 border border-slate-300 rounded-lg text-sm bg-white text-gray-900" placeholder="เพิ่มความคิดเห็น..." />
                  </div>
                  <div className="flex justify-end pt-2 border-t border-slate-200">
                    <button onClick={handleCmReply} disabled={isSubmitting || successCount('action') === 0} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-blue-500 outline-none transition-colors">
                      {loadingAction === RFI_ACTIONS.CM_REPLY ? <Spinner className="w-4 h-4 mr-2" /> : <Send size={16} className="mr-2" />} บันทึกคำตอบ
                    </button>
                  </div>
                </div>
              )}

              {/* Asker (BIM / ME / SN / SITE — whichever team raised it): close, or ask for more */}
              {showAskerPanel && (
                <div className={`space-y-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm ${(showSitePanel || showCmPanel) ? 'mt-6' : ''}`}>
                  <div className="pb-3 border-b border-slate-100">
                    <h3 className="text-base font-bold text-slate-800">ดำเนินการ ({asker})</h3>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">ความคิดเห็น (Optional)</label>
                    <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className="w-full p-3 border border-slate-300 rounded-lg text-sm bg-white text-gray-900" placeholder="เพิ่มความคิดเห็น..." />
                  </div>
                  {permissions.canRequestMoreInfo && uploadSlot('action', 'ไฟล์ประกอบการขอข้อมูลเพิ่ม', 'rfi-upload-more-info')}
                  <div className="flex flex-wrap justify-end gap-3 pt-2 border-t border-slate-200">
                    {permissions.canRequestMoreInfo && (
                      <button onClick={handleRequestMoreInfo} disabled={isSubmitting || successCount('action') === 0} className="flex items-center px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed">
                        {loadingAction === RFI_ACTIONS.REQUEST_MORE_INFO ? <Spinner className="w-4 h-4 mr-2" /> : <Hourglass size={16} className="mr-2" />} ขอข้อมูลเพิ่ม
                      </button>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      {showHistory && (
        <WorkflowHistoryModal workflow={document.workflow || []} origin={document.origin} onClose={() => setShowHistory(false)} />
      )}
    </>
  );
}
