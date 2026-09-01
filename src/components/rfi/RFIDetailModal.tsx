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
import { resolveViewUrl } from '@/lib/utils/storage'
import {
  X, Paperclip, Check, Send, AlertTriangle, FileText, History,
  Upload, CornerUpLeft, Hourglass, CalendarClock, Split,
} from 'lucide-react'
import Spinner from '@/components/shared/Spinner'
import LoadingOverlay from '@/components/shared/LoadingOverlay'
import PDFPreviewModal from '@/components/rfa/PDFPreviewModal'
import ExternalChainConfig, { ExternalChainStepConfig } from '@/components/shared/ExternalChainConfig'
import { RFAFile } from '@/types/rfa'
import { useAuth } from '@/lib/auth/useAuth'
import { ROLES, Role, OverrideStepInput, canActOnExternalStep } from '@/lib/config/workflow'
import LineOverrideStepper from '@/components/shared/LineOverrideStepper'
import { canEditLineOverride } from '@/lib/config/permissions'
import { useNotification } from '@/lib/context/NotificationContext'
import { useLogActivity } from '@/lib/hooks/useLogActivity'
import { useScrollLock } from '@/hooks/useScrollLock'
import { storage } from '@/lib/firebase/client'
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import {
  RFI_ACTIONS, RFI_ACTION_LABELS, RFI_STATUSES,
  RFI_AWAITING_CM_COLOR, RFI_AWAITING_CM_LABEL,
  RFI_TARGET_TO_AUDIENCE, RFIUploadTarget,
  getRfiStatusLabel, getRfiStatusColor,
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

// The annotate editor (PDFPreviewModal) only handles PDFs — everything else stays a
// plain preview link. Used to decide whether a file opens in the markup editor.
const isPdfFile = (f: { contentType?: string; fileName?: string }) =>
  (f.contentType || '').toLowerCase().includes('pdf') || /\.pdf$/i.test(f.fileName || '');

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
  workflow, origin, onClose, userRole, cmSystemType = 'INTERNAL',
}: {
  workflow: RFIWorkflowStep[];
  origin?: string;
  onClose: () => void;
  userRole?: string;
  cmSystemType?: 'INTERNAL' | 'EXTERNAL';
}) {
  // Mirrors RFA's WorkflowHistoryModal filter: CM only ever sees the document once it
  // has reached them, so the internal BIM<->SITE back-and-forth before that point is
  // not their concern — same reasoning as the CM-visibility filter (roadmap T-007).
  const visibleWorkflow = userRole === ROLES.CM && cmSystemType === 'INTERNAL'
    ? workflow.filter(item => {
        // Internal BIM<->SITE statuses CM never sees.
        if (
          item.status === RFI_STATUSES.PENDING_SITE
          || item.status === RFI_STATUSES.PENDING_SITE_MORE_INFO
        ) return false;
        // SITE answering BIM directly (ANSWER closes to CLOSED) and a re-open request
        // (REQUEST_MORE_INFO) are internal SITE<->BIM legs — the resulting status does
        // not reveal them, so filter by action. CM's own steps (role === CM, e.g.
        // CM_REPLY) are always kept.
        if (
          (item.action === RFI_ACTIONS.ANSWER || item.action === RFI_ACTIONS.REQUEST_MORE_INFO)
          && item.role !== ROLES.CM
        ) return false;
        return true;
      })
    : workflow;

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
            {visibleWorkflow.length > 0 ? (
              visibleWorkflow.map((item, index) => (
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
                            <a href={resolveViewUrl(file.fileUrl)} target="_blank" rel="noopener noreferrer" className="truncate hover:underline" title={file.fileName}>
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
// T-016 (A2): GET response carries an extra `lineTemplate` for the CM forward-external pre-fill.
// Optional, so a plain RFIDocument stays assignable (no impact on existing setDocument calls).
interface FullRFIDocument extends RFIDocument {
  lineTemplate?: {
    source: 'project' | 'default' | 'none';
    steps: { role: Role; order: number }[];
    templateId: string | null;
    version: number | null;
  } | null;
}

export default function RFIDetailModal({ document: initialDoc, onClose, showOverlay = true }: RFIDetailModalProps) {
  const { user, firebaseUser } = useAuth();
  const { showNotification } = useNotification();
  const { logActivity } = useLogActivity();

  const [document, setDocument] = useState<FullRFIDocument | null>(initialDoc);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [comment, setComment] = useState('');
  const [docNumberInput, setDocNumberInput] = useState('');
  // External chain the CM picks before forwarding (INTERNAL round 1). Empty = nothing chosen yet.
  const [chainConfig, setChainConfig] = useState<ExternalChainStepConfig[]>([]);
  // T-016 (A2): pre-fill the editor from the server-resolved line template — only while empty,
  // so the CM's own edits are never clobbered. Starting point, not a lock. none/no steps → empty.
  useEffect(() => {
    const steps = document?.lineTemplate?.steps;
    if (!steps || steps.length === 0) return;
    setChainConfig((prev) => (prev.length === 0 ? steps.map((s) => ({ role: s.role, order: s.order })) : prev));
  }, [document?.lineTemplate]);
  // T-016: editable future steps for the configurable approval-line override.
  const [lineFuture, setLineFuture] = useState<OverrideStepInput[]>([]);
  useEffect(() => {
    const chain = document?.externalChain;
    if (!chain) { setLineFuture([]); return; }
    const active = chain.currentStepIndex;
    setLineFuture(chain.steps.slice(active + 1).map((s) => ({ role: s.role, mandatory: s.mandatory })));
  }, [document?.externalChain]);
  // Progressive disclosure for the CM round-1 modal: 'select' shows the two mode buttons,
  // 'reply' shows the record-CM-reply controls, 'forward' shows the external-chain picker.
  const [cmActionMode, setCmActionMode] = useState<'select' | 'reply' | 'forward'>('select');
  const [filesByTarget, setFilesByTarget] = useState<FilesByTarget>(EMPTY_FILES);
  // SITE picks HOW it's handling the question before any upload field appears — asking
  // for a BIM-reply file and a CM-forward file at once (the old layout) reads as "attach
  // both", which is wrong for the common case of only one applying.
  const [siteMode, setSiteMode] = useState<'answer' | 'forward' | 'both' | null>(null);
  // The RFA-style markup editor. `target` decides which slot a saved (marked-up) file
  // lands in; null means preview-only (SITE before a mode is chosen).
  const [annotate, setAnnotate] = useState<{ open: boolean; file: RFIFile | null; target: RFIUploadTarget | null }>({
    open: false, file: null, target: null,
  });

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

  // Reset the CM round-1 mode back to the choice screen whenever a different document opens.
  useEffect(() => {
    setCmActionMode('select');
  }, [initialDoc?.id]);

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
  const asker = askerParty(document.origin);

  const showSitePanel = permissions.canAnswer || permissions.canForwardToCm || permissions.canAnswerAndForward;
  const showCmPanel = permissions.canRecordCmReply;
  const showAskerPanel = permissions.canRequestMoreInfo;
  // External chain (INTERNAL): CM forwards to Designer/Owner (round 1); the current
  // role-holder replies at their step. Panels gate straight off server permission flags.
  const showExtForwardPanel = permissions.canForwardExternal;
  const showExtReplyPanel = permissions.canActExternalStep;
  // CM round-1 on INTERNAL projects: the API grants canRecordCmReply AND canForwardExternal at once.
  // Collapse them into one progressive-disclosure panel instead of two stacked ones.
  const isCmRound1Choice = showCmPanel && showExtForwardPanel;
  const needsDocNumber = !document.documentNumber && (permissions.canForwardToCm || permissions.canAnswerAndForward);

  // Mode-select-first: skip the selector entirely when SITE only has one option anyway.
  const allowedSiteModes: Array<'answer' | 'forward' | 'both'> = [
    ...(permissions.canAnswer ? (['answer'] as const) : []),
    ...(permissions.canForwardToCm ? (['forward'] as const) : []),
    ...(permissions.canAnswerAndForward ? (['both'] as const) : []),
  ];
  const effectiveSiteMode = siteMode ?? (allowedSiteModes.length === 1 ? allowedSiteModes[0] : null);

  // Which slot a file opened from the current-step list annotates into. CM/asker have one
  // unambiguous slot ('action'); SITE resolves from the chosen mode (answer→bim, forward→cm).
  // 'both' or mode-not-yet-chosen → null → the list opens the PDF preview-only.
  const unambiguousTarget: RFIUploadTarget | null =
    showCmPanel ? 'action'
    : showAskerPanel ? 'action'
    : showSitePanel && effectiveSiteMode === 'answer' ? 'bim'
    : showSitePanel && effectiveSiteMode === 'forward' ? 'cm'
    // External approver (Designer/Owner) replies with a required file at their chain step —
    // let them mark up the current-step PDF into the 'action' slot the ext reply submits.
    : showExtReplyPanel ? 'action'
    : null;
  // The original document (from the asking side) that SITE marks up — the first PDF in the
  // current step's files. Drives the per-slot "เปิด+ขีดเขียน" buttons.
  const latestCurrentStepPdf = currentStepFiles.find(isPdfFile) || null;

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

  // Stage a marked-up PDF from the editor as a NEW file in `target` — it accumulates and
  // rides the SAME temp-upload path as a manual upload, so submit treats it identically.
  const stageAnnotatedFile = (target: RFIUploadTarget, editedFile: File) => {
    const fileObj: UploadedFile = {
      id: `${target}-annot-${editedFile.name}-${Date.now()}`,
      file: editedFile, status: 'pending', progress: 0,
    };
    setFilesByTarget(prev => ({ ...prev, [target]: [...prev[target], fileObj] }));
    uploadTempFile(target, fileObj).catch(err => console.error('Annotated upload failed for', editedFile.name, err));
    showNotification('success', 'บันทึกไฟล์สำเร็จ', 'ไฟล์ที่แก้ไขถูกแนบเรียบร้อยแล้ว');
  };

  // Open a current-step file. PDFs go to the markup editor (editable when a target is
  // known, preview-only otherwise); non-PDFs just open in a new tab.
  const openAnnotate = (file: RFIFile, target: RFIUploadTarget | null) => {
    if (!isPdfFile(file)) {
      window.open(resolveViewUrl(file.fileUrl), '_blank', 'noopener,noreferrer');
      return;
    }
    setAnnotate({ open: true, file, target });
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

  const uploadSlot = (target: RFIUploadTarget, label: string, inputId: string, annotateTarget?: RFIUploadTarget) => (
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
      {annotateTarget && latestCurrentStepPdf && (
        <button
          type="button"
          onClick={() => openAnnotate(latestCurrentStepPdf, annotateTarget)}
          className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center"
        >
          <FileText size={14} className="mr-1.5" /> เปิด+ขีดเขียนเอกสารเดิม
        </button>
      )}
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

  const executeAction = async (action: string, files: RFIFile[], extra?: { documentNumber?: string; chainConfig?: ExternalChainStepConfig[]; [key: string]: any }) => {
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
  // External reply: file REQUIRED, comment optional, no verdict (server sets ANSWERED + advances chain).
  const handleExtStepAct = () => executeAction(RFI_ACTIONS.EXT_STEP_ACT, buildPayloadFiles('action'));
  // CM forwards to the picked Designer/Owner chain. File is OPTIONAL (server requiresFiles:false),
  // but if CM attached one we carry it along so it lands on the document.
  const handleForwardExternal = () => executeAction(RFI_ACTIONS.FORWARD_EXTERNAL, buildPayloadFiles('action'), { chainConfig });
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
                  {user?.role !== ROLES.CM && (
                    <div>
                      <strong className="text-gray-700 font-semibold block mb-1 flex items-center gap-1">
                        <CalendarClock size={14} /> กำหนดตอบ:
                      </strong>
                      <span className={`font-medium ${overdue ? 'text-red-600' : 'text-gray-900'}`}>
                        {document.dueDate ? formatDate(document.dueDate) : 'ไม่ได้กำหนด'}
                        {overdue && <span className="ml-1 text-xs font-semibold">(เกินกำหนด)</span>}
                      </span>
                    </div>
                  )}
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

              {/* T-016: configurable approval-line — stepper + override save + send-back */}
              {document.externalChain && (
                <div className="mt-4 space-y-3 rounded-xl border border-border-subtle bg-surface-raised p-4">
                  <LineOverrideStepper
                    chain={document.externalChain}
                    canEdit={canEditLineOverride(document.externalChain, user?.role as Role)}
                    future={lineFuture}
                    onChangeFuture={setLineFuture}
                  />
                  {canEditLineOverride(document.externalChain, user?.role as Role) && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => executeAction(RFI_ACTIONS.EXT_OVERRIDE_LINE, [], { overrideFutureSteps: lineFuture })}
                      className="inline-flex items-center gap-1 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      บันทึกการปรับเส้นทาง
                    </button>
                  )}
                  {canActOnExternalStep(document.externalChain, user?.role as Role) && !document.externalChain.overrideLocked && (
                    <div className="border-t border-border-subtle pt-3">
                      <p className="mb-2 text-sm font-medium text-text-body">ส่งกลับเพื่อแก้ไข (โปรดระบุเหตุผลในช่องความคิดเห็นก่อน)</p>
                      <div className="flex flex-wrap gap-2">
                        {document.externalChain.steps
                          .slice(0, Math.min(document.externalChain.currentStepIndex, document.externalChain.steps.length - 1) + 1)
                          .map((s) => (
                            <button
                              key={`sb-${s.order}`}
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => {
                                if (!comment.trim()) { showNotification('error', 'กรุณาระบุเหตุผล', 'กรุณาระบุเหตุผลในการส่งกลับ'); return; }
                                executeAction(RFI_ACTIONS.EXT_SEND_BACK, [], { targetOrder: s.order });
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-text-body hover:border-amber-500 hover:text-amber-600 disabled:opacity-50"
                            >
                              ส่งกลับไปที่ {s.role === ROLES.DESIGNER ? 'ผู้ออกแบบ (Designer)' : s.role === ROLES.OWNER ? 'เจ้าของโครงการ (Owner)' : s.role}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Current step's files only — older steps' files stay in the "ประวัติ" (history) modal */}
              <div>
                <h4 className="text-md font-semibold mb-2 flex items-center text-slate-800">
                  <Paperclip size={16} className="mr-2" /> ไฟล์แนบล่าสุด
                </h4>
                <ul className="space-y-2">
                  {currentStepFiles.length > 0 ? (
                    currentStepFiles.map((file, index) => {
                      const logOpen = () => logActivity({
                        action: 'DOWNLOAD_FILE',
                        resourceType: 'RFI',
                        resourceId: document.id,
                        resourceName: document.documentNumber || document.runningNumber,
                        resourceTitle: document.title,
                        siteId: document.site?.id,
                        siteName: document.site?.name,
                        description: `เปิดไฟล์ "${file.fileName}"`,
                      });
                      const inner = (
                        <>
                          <FileText className="w-5 h-5 text-gray-500 mr-3 flex-shrink-0" />
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-sm font-medium truncate text-blue-600 hover:underline">{file.fileName}</span>
                            <span className="text-xs text-gray-500">{formatFileSize(file.fileSize)}</span>
                          </div>
                          {file.audience && (
                            <span className="text-[11px] text-gray-500 flex-shrink-0 ml-2">{AUDIENCE_LABEL[file.audience]}</span>
                          )}
                        </>
                      );
                      return (
                        <li key={index} className="border rounded-md bg-slate-50 border-slate-200 hover:bg-slate-100">
                          {isPdfFile(file) ? (
                            // PDF → markup editor (editable when a slot is known, preview-only otherwise).
                            <button
                              type="button"
                              onClick={() => { logOpen(); openAnnotate(file, unambiguousTarget); }}
                              className="w-full text-left p-2 rounded-md flex items-center"
                              title={unambiguousTarget ? 'เปิดเพื่อขีดเขียน' : 'เปิดดูเอกสาร'}
                            >
                              {inner}
                            </button>
                          ) : (
                            <a
                              href={resolveViewUrl(file.fileUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-full text-left p-2 rounded-md flex items-center"
                              onClick={logOpen}
                            >
                              {inner}
                            </a>
                          )}
                        </li>
                      );
                    })
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
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setSiteMode(mode)}
                            className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-center transition-all focus-visible:ring-2 outline-none ${
                              isActive ? meta.activeClass : meta.defaultClass
                            }`}
                          >
                            <Icon size={20} className={isActive ? meta.iconActiveClass : meta.iconDefaultClass} />
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
                      {(effectiveSiteMode === 'answer' || effectiveSiteMode === 'both') && uploadSlot('bim', 'ไฟล์คำตอบให้ BIM', 'rfi-upload-bim', 'bim')}
                      {(effectiveSiteMode === 'forward' || effectiveSiteMode === 'both') && uploadSlot('cm', 'ไฟล์ส่งต่อให้ CM', 'rfi-upload-cm', 'cm')}
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
              {/* CM round-1 (INTERNAL): one shared file attach, then choose ONE path —
                  record CM's own reply, or forward to the external Designer/Owner chain.
                  Replaces the two panels that used to render stacked at once. */}
              {isCmRound1Choice && (
                <div className={`space-y-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm ${showSitePanel ? 'mt-6' : ''}`}>
                  <div className="pb-3 border-b border-slate-100">
                    <h3 className="text-base font-bold text-slate-800">ดำเนินการ (CM)</h3>
                  </div>

                  {/* Step 1 — shared attachment (required for reply, optional for forward) */}
                  {uploadSlot('action', 'แนบไฟล์', 'rfi-cm-choice-upload')}

                  {/* Step 2 — pick a path, or act on the picked path */}
                  {cmActionMode === 'select' && (
                    <div className="space-y-3 pt-2 border-t border-slate-200">
                      <p className="text-sm text-slate-600">เลือกวิธีดำเนินการ</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          onClick={() => setCmActionMode('reply')}
                          className="flex items-center justify-center px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none transition-colors"
                        >
                          <Check size={16} className="mr-2" /> บันทึกคำตอบจาก CM
                        </button>
                        <button
                          onClick={() => setCmActionMode('forward')}
                          className="flex items-center justify-center px-4 py-3 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none transition-colors"
                        >
                          <Send size={16} className="mr-2" /> ส่งต่อ
                        </button>
                      </div>
                    </div>
                  )}

                  {cmActionMode === 'reply' && (
                    <div className="space-y-4 pt-2 border-t border-slate-200">
                      <button onClick={() => setCmActionMode('select')} className="flex items-center text-sm text-slate-500 hover:text-slate-700">
                        <CornerUpLeft size={16} className="mr-1.5" /> ย้อนกลับ
                      </button>
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

                  {cmActionMode === 'forward' && (
                    <div className="space-y-4 pt-2 border-t border-slate-200">
                      <button onClick={() => setCmActionMode('select')} className="flex items-center text-sm text-slate-500 hover:text-slate-700">
                        <CornerUpLeft size={16} className="mr-1.5" /> ย้อนกลับ
                      </button>
                      <div className="flex items-start gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                        <Send size={16} className="text-indigo-600 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-indigo-800">
                          เลือกผู้พิจารณาภายนอก (ผู้ออกแบบ / เจ้าของโครงการ) และลำดับ — เอกสารจะไล่ผ่านทุกลำดับก่อนกลับมาให้ CM · แนบไฟล์ได้ ไม่บังคับ
                        </p>
                      </div>
                      <ExternalChainConfig value={chainConfig} onChange={setChainConfig} disabled={isSubmitting} />
                      <div className="flex justify-end pt-2 border-t border-slate-200">
                        <button onClick={handleForwardExternal} disabled={isSubmitting || chainConfig.length === 0} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none transition-colors">
                          {loadingAction === RFI_ACTIONS.FORWARD_EXTERNAL ? <Spinner className="w-4 h-4 mr-2" /> : <Send size={16} className="mr-2" />} ส่งต่อ
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {showCmPanel && !isCmRound1Choice && (
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

              {/* CM forwards the RFI to the external Designer/Owner chain (INTERNAL, round 1).
                  No file here — this only configures who reviews and in what order. */}
              {showExtForwardPanel && !isCmRound1Choice && (
                <div className={`space-y-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm ${(showSitePanel || showCmPanel) ? 'mt-6' : ''}`}>
                  <div className="pb-3 border-b border-slate-100">
                    <h3 className="text-base font-bold text-slate-800">ส่งต่อให้ผู้พิจารณาภายนอก</h3>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <Send size={16} className="text-indigo-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-indigo-800">
                      เลือกผู้พิจารณาภายนอก (ผู้ออกแบบ / เจ้าของโครงการ) และลำดับ — เอกสารจะไล่ผ่านทุกลำดับก่อนกลับมาให้ CM
                    </p>
                  </div>
                  <ExternalChainConfig value={chainConfig} onChange={setChainConfig} disabled={isSubmitting} />
                  <div className="flex justify-end pt-2 border-t border-slate-200">
                    <button onClick={handleForwardExternal} disabled={isSubmitting || chainConfig.length === 0} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none transition-colors">
                      {loadingAction === RFI_ACTIONS.FORWARD_EXTERNAL ? <Spinner className="w-4 h-4 mr-2" /> : <Send size={16} className="mr-2" />} ส่งต่อ
                    </button>
                  </div>
                </div>
              )}

              {/* External approver (Designer/Owner) reply at their chain step — file REQUIRED,
                  comment optional, no verdict buttons (server advances the chain). */}
              {showExtReplyPanel && (
                <div className={`space-y-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm ${(showSitePanel || showCmPanel || showExtForwardPanel) ? 'mt-6' : ''}`}>
                  <div className="pb-3 border-b border-slate-100">
                    <h3 className="text-base font-bold text-slate-800">ตอบกลับ (ผู้พิจารณาภายนอก)</h3>
                  </div>
                  {uploadSlot('action', 'ไฟล์ตอบกลับ', 'rfi-ext-reply', 'action')}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">ความคิดเห็น (Optional)</label>
                    <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className="w-full p-3 border border-slate-300 rounded-lg text-sm bg-white text-gray-900" placeholder="เพิ่มความคิดเห็น..." />
                  </div>
                  <div className="flex justify-end pt-2 border-t border-slate-200">
                    <button onClick={handleExtStepAct} disabled={isSubmitting || successCount('action') === 0} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-blue-500 outline-none transition-colors">
                      {loadingAction === RFI_ACTIONS.EXT_STEP_ACT ? <Spinner className="w-4 h-4 mr-2" /> : <Send size={16} className="mr-2" />} ตอบกลับ
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
        <WorkflowHistoryModal
          workflow={document.workflow || []}
          origin={document.origin}
          onClose={() => setShowHistory(false)}
          userRole={user?.role}
          cmSystemType={document.site?.cmSystemType}
        />
      )}

      <PDFPreviewModal
        isOpen={annotate.open}
        file={annotate.file as unknown as RFAFile}
        allowEdit={annotate.target !== null}
        onSave={(edited) => {
          if (annotate.target) stageAnnotatedFile(annotate.target, edited);
          setAnnotate({ open: false, file: null, target: null });
        }}
        onClose={() => setAnnotate({ open: false, file: null, target: null })}
      />
    </>
  );
}
