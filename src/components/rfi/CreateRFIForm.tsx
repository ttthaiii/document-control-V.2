// src/components/rfi/CreateRFIForm.tsx
'use client'

// Create form for RFI documents. Deliberately modelled on CreateRFAForm so the two
// look and behave the same way, with four differences that come from the RFI design:
//
//   1. No document-type step. RFI has one type, so the form opens straight into
//      the document fields instead of asking which kind of document this is.
//   2. The creator's ROLE decides the destination (D-04). There is no picker for it,
//      and the word "Internal/External" never appears (D-01) — the form instead says
//      in plain words where the document is going.
//   3. หมวดงาน comes straight from config, scoped to the creator's team — BIM's four
//      RFA disciplines, ME's Mechanical/Electrical, SN's Sanitary/Plumbing, plus the
//      shared Interior + Landscape. Offered in full on every project (D-07), so there
//      is nothing to fetch.
//   4. There is a กำหนดวันตอบ field, which RFA has no equivalent of.

import React, { useState, useEffect, useMemo } from 'react'
import { FileText, Upload, X, Check, AlertTriangle, Loader2, CalendarClock } from 'lucide-react'
import { useBimTracking } from '@/lib/hooks/useBimTracking'
import { useAuth } from '@/lib/auth/useAuth'
import Spinner from '@/components/shared/Spinner'
import LoadingOverlay from '@/components/shared/LoadingOverlay'
import { Role } from '@/lib/config/workflow'
import {
  RFI_DISCIPLINES_BY_ORIGIN,
  RFI_CREATE_ROUTES,
  ALLOWED_RFI_CATEGORIES,
  getOriginForRole,
} from '@/lib/config/rfi-workflow'
import { useNotification } from '@/lib/context/NotificationContext'

import { db, storage } from '@/lib/firebase/client'
import { collection, query, where, getDocs, documentId } from 'firebase/firestore'
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'

// --- Interfaces (same shapes CreateRFAForm uses) ---
interface UploadedFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error' | 'retrying';
  progress: number;
  uploadedData?: {
    fileName: string; fileUrl: string; filePath: string; size: number;
    contentType: string; fileSize: number; uploadedAt: string; uploadedBy: string;
  };
  error?: string;
  retryCount: number;
}
interface TaskData { taskCategory: string; taskName: string; projectName: string; taskUid?: string; }
interface Site { id: string; name: string; }
interface User { id: string; email: string; role: Role; sites: string[]; }

interface RFIFormData {
  /** A discipline name the creator's team owns ('Structural'), not a BIM Tracking category. */
  discipline: string;
  documentNumber: string;
  title: string;
  description: string;
  dueDate: string;
  uploadedFiles: UploadedFile[];
  selectedProject: string;
  /** The BIM Tracking category the task picker is filtered by — always 'Documents'. */
  selectedCategory: string;
  selectedTask: TaskData | null;
}

const INITIAL_FORM_DATA: RFIFormData = {
  discipline: '', documentNumber: '', title: '', description: '', dueDate: '',
  uploadedFiles: [], selectedProject: '', selectedCategory: '', selectedTask: null,
};

const inputClassName = "w-full h-11 px-3 border rounded-lg bg-white text-gray-900 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all";

export default function CreateRFIForm({
  onClose,
  isModal = false,
  userProp,
}: {
  onClose?: () => void
  isModal?: boolean
  userProp?: User
}) {
  const [formData, setFormData] = useState<RFIFormData>(INITIAL_FORM_DATA);
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>('');

  const [bimCategories, setBimCategories] = useState<string[]>([]);
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [taskSearchQuery, setTaskSearchQuery] = useState('');

  const [isCheckingDocNum, setIsCheckingDocNum] = useState(false);
  const [isDocNumAvailable, setIsDocNumAvailable] = useState<boolean | null>(null);
  const [debouncedDocNum, setDebouncedDocNum] = useState('');

  const [isCheckingTask, setIsCheckingTask] = useState(false);
  const [isTaskDuplicate, setIsTaskDuplicate] = useState<boolean | null>(null);
  // taskUids that already carry an RFI for this site — used to HIDE used tasks from the list.
  const [usedTaskUids, setUsedTaskUids] = useState<Set<string>>(new Set());

  const { firebaseUser, user } = useAuth();
  const { showNotification } = useNotification();
  const { loading: sheetsLoading, error: sheetsError, getCategories, getTasks } = useBimTracking();

  // --- Routing (D-04). The role decides everything the form has to adapt to, so the
  // one lookup below replaces the isManualFlow / rfaType branching CreateRFAForm needs.
  // The API recomputes this from the token, so a tampered client cannot change it.
  const role = (userProp?.role || user?.role) as Role | undefined;
  const origin = useMemo(() => (role ? getOriginForRole(role) : null), [role]);
  const route = origin ? RFI_CREATE_ROUTES[origin] : null;

  /** Only BIM-created RFIs hang off a BIM Tracking task; ME / SN / SITE fill it in by hand. */
  const linksTask = !!route?.linksBimTracking;
  /** SITE, ME and SN all send straight to CM, so CM's number must be on it already. */
  const requiresDocNumber = !!route?.requiresCmNumber;

  /**
   * Only the disciplines THIS team owns. BIM gets the four RFA disciplines, ME gets
   * Mechanical/Electrical, SN gets Sanitary/Plumbing, and Interior + Landscape are
   * shared. Offering the full list here would show choices the API rejects with 400.
   */
  const disciplines = origin ? RFI_DISCIPLINES_BY_ORIGIN[origin] : [];

  // Lock body scroll while the modal is open (same pattern as CreateRFAForm).
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = window.document.body;
    const scrollbarWidth = window.innerWidth - window.document.documentElement.clientWidth;
    const originalStyle = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      body.style.position = originalStyle.position;
      body.style.top = originalStyle.top;
      body.style.width = originalStyle.width;
      body.style.overflow = originalStyle.overflow;
      body.style.paddingRight = originalStyle.paddingRight;
      window.scrollTo(0, scrollY);
    };
  }, []);

  // --- Projects the user belongs to ---
  useEffect(() => {
    const loadSites = async () => {
      if (!user?.sites || user.sites.length === 0) return;
      setLoading(true);
      try {
        const q = query(collection(db, 'sites'), where(documentId(), 'in', user.sites));
        const snapshot = await getDocs(q);
        setSites(snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
      } catch (error) {
        console.error('Error loading sites:', error);
        showNotification('error', 'เกิดข้อผิดพลาด', 'ไม่สามารถโหลดรายชื่อโครงการได้');
      } finally {
        setLoading(false);
      }
    };
    loadSites();
  }, [user]);

  // --- documentNumber duplicate check (debounced) ---
  useEffect(() => {
    if (!selectedSite || !formData.documentNumber) {
      setIsDocNumAvailable(null);
      return;
    }
    setIsCheckingDocNum(true);
    const handler = setTimeout(() => setDebouncedDocNum(formData.documentNumber), 500);
    return () => clearTimeout(handler);
  }, [formData.documentNumber, selectedSite]);

  useEffect(() => {
    if (!debouncedDocNum || !selectedSite) return;

    const checkDuplicate = async () => {
      setIsCheckingDocNum(true);
      setIsDocNumAvailable(null);
      try {
        // api/rfi/check-duplicate requires a token (the RFA equivalent does not),
        // so the header is not optional here.
        if (!firebaseUser) return;
        const token = await firebaseUser.getIdToken();
        const response = await fetch('/api/rfi/check-duplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ siteId: selectedSite, documentNumber: debouncedDocNum }),
        });
        const result = await response.json();
        setIsDocNumAvailable(!result.isDuplicate);
      } catch (error) {
        console.error('Failed to check duplicate:', error);
        setIsDocNumAvailable(null);
      } finally {
        setIsCheckingDocNum(false);
      }
    };
    checkDuplicate();
  }, [debouncedDocNum, selectedSite, firebaseUser]);

  // --- One task = one RFI. Checked here for feedback; api/rfi/create enforces it. ---
  useEffect(() => {
    if (!formData.selectedTask?.taskUid || !selectedSite) {
      setIsTaskDuplicate(null);
      return;
    }
    const checkTaskDuplicate = async () => {
      setIsCheckingTask(true);
      setIsTaskDuplicate(null);
      try {
        if (!firebaseUser) return;
        const token = await firebaseUser.getIdToken();
        const response = await fetch('/api/rfi/check-duplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ siteId: selectedSite, taskUid: formData.selectedTask!.taskUid }),
        });
        const result = await response.json();
        setIsTaskDuplicate(!!result.isDuplicate);
      } catch (error) {
        console.error('Failed to check task duplicate:', error);
        setIsTaskDuplicate(null);
      } finally {
        setIsCheckingTask(false);
      }
    };
    checkTaskDuplicate();
  }, [formData.selectedTask, selectedSite, firebaseUser]);

  // Fetch every taskUid already used by an RFI in this site, so used tasks can be
  // hidden from the create list. Client can't read rfiDocuments directly → server
  // endpoint (admin SDK). Fail-open: on error the set stays empty → list shows all.
  useEffect(() => {
    if (!selectedSite || !firebaseUser) {
      setUsedTaskUids(new Set());
      return;
    }
    const fetchUsedTasks = async () => {
      try {
        const token = await firebaseUser.getIdToken();
        const response = await fetch('/api/rfi/used-tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ siteId: selectedSite }),
        });
        const result = await response.json();
        setUsedTaskUids(new Set<string>(result.taskUids || []));
      } catch (error) {
        console.error('Failed to fetch used RFI tasks:', error);
        setUsedTaskUids(new Set());
      }
    };
    fetchUsedTasks();
  }, [selectedSite, firebaseUser]);

  const updateFormData = (updates: Partial<RFIFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
    const newErrors = { ...errors };
    Object.keys(updates).forEach(key => delete newErrors[key]);
    setErrors(newErrors);
  };

  const handleSiteChange = async (siteId: string) => {
    setSelectedSite(siteId);
    updateFormData({ selectedTask: null, selectedCategory: '' });
    setBimCategories([]);
    setTasks([]);
    setTaskSearchQuery('');
    if (!siteId) return;

    const selected = sites.find(s => s.id === siteId);
    if (!selected) return;
    updateFormData({ selectedProject: selected.name });

    // Only the BIM route needs BIM Tracking at all. หมวดงาน is a plain constant either
    // way, so a SITE user never waits on a network call to fill this form.
    if (!linksTask) return;

    setLoading(true);
    try {
      const cats = await getCategories(selected.name, 'RFI');
      setBimCategories(cats);
      // RFI work lives under one category, so asking the user to pick it is a wasted
      // click. Auto-select when there is exactly one and load its tasks immediately.
      if (cats.length === 1) {
        updateFormData({ selectedCategory: cats[0] });
        const taskList = await getTasks(selected.name, cats[0]);
        setTasks(taskList);
      }
    } catch (e) {
      console.error('Failed to fetch RFI categories from BIM-Tracking:', e);
      setErrors(prev => ({ ...prev, site: 'ไม่สามารถโหลดงานจาก BIM Tracking ได้' }));
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = async (category: string) => {
    updateFormData({ selectedCategory: category, selectedTask: null });
    setTasks([]);
    if (!category || !formData.selectedProject) return;
    try {
      const taskList = await getTasks(formData.selectedProject, category);
      setTasks(taskList);
    } catch (e) {
      console.error('Failed to fetch tasks:', e);
    }
  };

  const handleTaskSelect = (task: TaskData) => {
    // Prefill the subject from the task name, but never overwrite something typed:
    // the RFI title is the question, and the task name is only a starting point.
    updateFormData({
      selectedTask: task,
      ...(formData.title.trim() ? {} : { title: task.taskName }),
    });
    setTaskSearchQuery(task.taskName);
  };

  const filteredTasks = useMemo(() => {
    // Hide tasks that already carry an RFI in this site (only tasks that have a taskUid
    // can be deduped; tasks without one stay selectable).
    const available = tasks.filter(t => !(t.taskUid && usedTaskUids.has(t.taskUid)));
    if (!taskSearchQuery) return available.slice(0, 20);
    return available.filter(t => t.taskName.toLowerCase().includes(taskSearchQuery.toLowerCase()));
  }, [tasks, taskSearchQuery, usedTaskUids]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!origin) newErrors.general = 'บทบาทของคุณไม่มีสิทธิ์สร้างเอกสาร RFI';
    if (!selectedSite) newErrors.site = 'กรุณาเลือกโครงการ';
    if (!formData.discipline) newErrors.discipline = 'กรุณาเลือกหมวดงาน';
    if (!formData.title.trim()) newErrors.title = 'กรุณาใส่หัวข้อคำถาม';

    if (requiresDocNumber && !formData.documentNumber.trim()) {
      newErrors.documentNumber = 'กรุณาระบุเลขที่เอกสารสำหรับส่งให้ CM';
    } else if (formData.documentNumber.trim() && isDocNumAvailable === false) {
      newErrors.documentNumber = 'เลขที่เอกสารนี้ถูกใช้ไปแล้ว';
    }

    if (linksTask) {
      if (!formData.selectedTask) {
        newErrors.task = 'กรุณาเลือกงานจาก BIM Tracking';
      } else if (isTaskDuplicate === true) {
        newErrors.task = 'งานนี้มี RFI ในระบบแล้ว หนึ่งงานถามได้หนึ่งเรื่อง';
      } else if (isCheckingTask) {
        newErrors.task = 'กำลังตรวจสอบข้อมูลงาน...';
      }
    }

    if (formData.uploadedFiles.filter(f => f.status === 'success').length === 0) {
      newErrors.files = 'กรุณาอัปโหลดไฟล์อย่างน้อย 1 ไฟล์';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleOpenConfirmation = () => {
    if (validateForm()) {
      setIsConfirmationModalOpen(true);
    } else {
      showNotification('warning', 'ข้อมูลไม่ครบถ้วน', 'กรุณากรอกข้อมูลให้ครบถ้วน');
    }
  };

  const submitForm = async () => {
    if (!validateForm()) {
      showNotification('warning', 'ข้อมูลไม่ครบถ้วน', 'กรุณากรอกข้อมูลในช่องที่มีเครื่องหมาย * ให้ครบ');
      return;
    }

    setIsSubmitting(true);
    try {
      if (!firebaseUser) throw new Error('กรุณาล็อกอินก่อน');
      const token = await firebaseUser.getIdToken();

      const successfulFiles = formData.uploadedFiles.filter(f => f.status === 'success' && f.uploadedData);

      const submitData = {
        siteId: selectedSite,
        // The API validates this against RFI_DISCIPLINES and rejects anything else.
        categoryId: formData.discipline,
        title: formData.title,
        description: formData.description,
        documentNumber: formData.documentNumber,
        dueDate: formData.dueDate || null,
        // Sent only on the BIM route. The API ignores it on the SITE route regardless.
        taskData: linksTask ? formData.selectedTask : null,
        uploadedFiles: successfulFiles.map(f => f.uploadedData!),
      };

      const response = await fetch('/api/rfi/create', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: submitData }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'เกิดข้อผิดพลาดในการสร้างเอกสาร');
      if (!result.success) throw new Error(result.error);

      showNotification(
        'success',
        'สร้างเอกสารสำเร็จ',
        `เอกสาร: ${result.runningNumber} - ${formData.title}`,
        true
      );
      if (onClose) onClose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      showNotification('error', 'เกิดข้อผิดพลาด', errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const uploadTempFile = (fileObj: UploadedFile) => {
    return new Promise<void>((resolve, reject) => {
      if (!user?.id) {
        reject(new Error('User ID not found for upload.'));
        return;
      }
      const timestamp = Date.now();
      const originalName = fileObj.file.name || 'file';
      // The create API only accepts files sitting under temp/<uid>/, so this prefix
      // is load-bearing, not cosmetic.
      const tempPath = `temp/${user.id}/${timestamp}_${originalName}`;
      const uploadTask = uploadBytesResumable(ref(storage, tempPath), fileObj.file, {
        contentType: fileObj.file.type || 'application/octet-stream',
      });

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setFormData(prev => ({
            ...prev,
            uploadedFiles: prev.uploadedFiles.map(f => f.id === fileObj.id ? { ...f, progress, status: 'uploading' } : f),
          }));
        },
        (error) => {
          console.error('Storage upload error:', error);
          setFormData(prev => ({
            ...prev,
            uploadedFiles: prev.uploadedFiles.map(f => f.id === fileObj.id ? { ...f, status: 'error', error: error.message } : f),
          }));
          reject(error);
        },
        async () => {
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            const uploadedData = {
              fileName: originalName,
              fileUrl: downloadUrl,
              filePath: tempPath,
              size: fileObj.file.size,
              contentType: fileObj.file.type,
              fileSize: fileObj.file.size,
              uploadedAt: new Date().toISOString(),
              uploadedBy: user.email || 'Unknown User',
            };
            setFormData(prev => ({
              ...prev,
              uploadedFiles: prev.uploadedFiles.map(f => f.id === fileObj.id ? { ...f, status: 'success', progress: 100, uploadedData } : f),
            }));
            resolve();
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const newUploads: UploadedFile[] = files.map(file => ({
      id: `${file.name}-${Date.now()}`, file, status: 'pending', progress: 0, retryCount: 0,
    }));
    setFormData(prev => ({ ...prev, uploadedFiles: [...prev.uploadedFiles, ...newUploads] }));
    newUploads.forEach(fileObj => {
      uploadTempFile(fileObj).catch(err => console.error('Upload failed for', fileObj.file.name, err));
    });
    event.target.value = '';
  };

  const removeFile = async (index: number) => {
    const fileToRemove = formData.uploadedFiles[index];
    if (fileToRemove.uploadedData?.filePath) {
      try {
        await deleteObject(ref(storage, fileToRemove.uploadedData.filePath));
      } catch (error) {
        console.error('Failed to delete temp file from storage:', error);
      }
    }
    updateFormData({ uploadedFiles: formData.uploadedFiles.filter((_, i) => i !== index) });
  };

  const todayIso = new Date().toISOString().split('T')[0];
  const selectedSiteName = sites.find(s => s.id === selectedSite)?.name;

  return (
    <div className={`${isModal ? 'max-w-4xl w-full mx-auto' : ''} bg-white rounded-lg shadow-xl flex flex-col h-full max-h-[95vh] relative`}>
      <div className="flex items-center justify-between p-6 border-b bg-gray-50 rounded-t-lg">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            สร้าง RFI Document
            <span className="font-medium text-gray-600"> - ขอข้อมูลเพิ่มเติม</span>
          </h2>
        </div>
        {onClose && <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X /></button>}
      </div>

      {isSubmitting && <LoadingOverlay />}

      <div className="flex-1 p-4 sm:p-6 overflow-y-auto bg-slate-50 space-y-6">

        {!origin && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>บทบาทของคุณไม่มีสิทธิ์สร้างเอกสาร RFI</p>
          </div>
        )}

        <section className={`bg-white p-6 rounded-xl border border-slate-200 shadow-sm ${!origin ? 'opacity-40 pointer-events-none' : ''}`}>
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-6">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-sm flex-shrink-0">1</span>
            <h3 className="text-lg font-semibold text-gray-900">ข้อมูลเอกสาร</h3>
          </div>
          <div className="space-y-6 max-w-3xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-2">โครงการ <span className="text-red-500">*</span></label>
                <select value={selectedSite} onChange={(e) => handleSiteChange(e.target.value)} className={inputClassName}>
                  <option value="">-- เลือกโครงการ --</option>
                  {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
                </select>
                {errors.site && <p className="text-red-600 text-sm mt-1">{errors.site}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-800 mb-2">หมวดงาน <span className="text-red-500">*</span></label>
                {/* A plain constant from config — offered in full on every project,
                    because an RFI can legitimately come before any RFA exists (D-07).
                    Scoped to the creator's team, so the list never offers a discipline
                    the API would reject. */}
                <select
                  value={formData.discipline}
                  onChange={(e) => updateFormData({ discipline: e.target.value })}
                  className={inputClassName}
                >
                  <option value="">-- เลือกหมวดงาน --</option>
                  {disciplines.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {errors.discipline && <p className="text-red-600 text-sm mt-1">{errors.discipline}</p>}
              </div>
            </div>

            {linksTask && (
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-2">
                  เลือกงานจาก BIM Tracking <span className="text-red-500">*</span>
                  {sheetsLoading && <Spinner className="w-4 h-4 ml-2 inline-block" />}
                </label>

                {/* Normally auto-selected (RFI work all sits under one category), so this
                    picker only appears when BIM Tracking offers more than one. */}
                {bimCategories.length > 1 && (
                  <select
                    value={formData.selectedCategory}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className={`${inputClassName} mb-2`}
                  >
                    <option value="">-- เลือกหมวดใน BIM Tracking --</option>
                    {bimCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                )}

                <input
                  type="text"
                  placeholder="ค้นหาชื่องาน..."
                  value={taskSearchQuery}
                  onChange={(e) => setTaskSearchQuery(e.target.value)}
                  className={inputClassName}
                  disabled={!selectedSite || !formData.selectedCategory || sheetsLoading}
                />

                <div className="mt-2 max-h-48 overflow-y-auto border rounded-lg bg-white">
                  {filteredTasks.map(task => (
                    <div
                      key={task.taskUid || task.taskName}
                      onClick={() => handleTaskSelect(task)}
                      className={`p-3 text-sm cursor-pointer hover:bg-gray-100 ${formData.selectedTask?.taskName === task.taskName ? 'bg-blue-50 font-semibold' : ''}`}
                    >
                      {task.taskName}
                    </div>
                  ))}
                  {selectedSite && !sheetsLoading && tasks.length === 0 && (
                    <p className="p-3 text-sm text-gray-500">
                      ไม่พบงานในหมวด {ALLOWED_RFI_CATEGORIES.join(' / ')} ของโครงการนี้ใน BIM Tracking
                    </p>
                  )}
                </div>

                {sheetsError && <p className="text-red-600 text-sm mt-1">Error: {sheetsError}</p>}
                {isCheckingTask && (
                  <p className="text-gray-500 text-sm mt-2 flex items-center">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> กำลังตรวจสอบว่างานนี้มี RFI แล้วหรือไม่...
                  </p>
                )}
                {isTaskDuplicate === true && (
                  <p className="text-red-700 text-sm mt-2 font-medium bg-red-50 p-3 rounded-lg border border-red-200">
                    ⚠️ งานนี้มีเอกสาร RFI ในระบบแล้ว — หนึ่งงานถามได้หนึ่งเรื่อง
                    <br />ถ้าต้องการถามเรื่องใหม่ กรุณาสร้างงานใหม่ใน BIM Tracking ก่อน
                  </p>
                )}
                {errors.task && isTaskDuplicate !== true && !isCheckingTask && (
                  <p className="text-red-600 text-sm mt-1">{errors.task}</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-2">
                  เลขที่เอกสาร {requiresDocNumber && <span className="text-red-500">*</span>}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.documentNumber}
                    onChange={(e) => {
                      updateFormData({ documentNumber: e.target.value });
                      setIsDocNumAvailable(null);
                    }}
                    className={`${inputClassName} pr-10 ${isDocNumAvailable === false ? 'border-red-500' : ''}`}
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    {isCheckingDocNum && <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />}
                    {!isCheckingDocNum && isDocNumAvailable === true && <Check className="h-5 w-5 text-green-500" />}
                    {!isCheckingDocNum && isDocNumAvailable === false && <X className="h-5 w-5 text-red-500" />}
                  </div>
                </div>
                {errors.documentNumber && <p className="text-red-600 text-sm mt-1">{errors.documentNumber}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-800 mb-2 flex items-center gap-1">
                  <CalendarClock size={16} className="text-gray-500" /> กำหนดวันตอบ
                </label>
                <input
                  type="date"
                  value={formData.dueDate}
                  min={todayIso}
                  onChange={(e) => updateFormData({ dueDate: e.target.value })}
                  className={inputClassName}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-2">หัวข้อคำถาม <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => updateFormData({ title: e.target.value })}
                className={inputClassName}
              />
              {errors.title && <p className="text-red-600 text-sm mt-1">{errors.title}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-2">รายละเอียดคำถาม</label>
              <textarea
                value={formData.description}
                onChange={(e) => updateFormData({ description: e.target.value })}
                rows={4}
                className="w-full p-3 border rounded-lg bg-white text-gray-900"
                placeholder="อธิบายคำถามหรือข้อมูลที่ต้องการ"
              />
            </div>
          </div>
        </section>

        <section className={`bg-white p-6 rounded-xl border border-slate-200 shadow-sm ${!origin ? 'opacity-40 pointer-events-none' : ''}`}>
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-6">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-sm flex-shrink-0">2</span>
            <h3 className="text-lg font-semibold text-gray-900">แนบไฟล์ <span className="text-red-500">*</span></h3>
          </div>
          <div className="space-y-6 max-w-3xl">
            <label htmlFor="rfi-file-upload" className="flex flex-col items-center justify-center w-full h-48 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                <Upload className="w-10 h-10 mb-4 text-gray-400" />
                <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">คลิกเพื่อเลือกไฟล์</span> หรือลากมาวาง</p>
                <p className="text-xs text-gray-500">สามารถเลือกได้หลายไฟล์พร้อมกัน</p>
              </div>
              <input id="rfi-file-upload" type="file" multiple onChange={handleFileUpload} className="hidden" />
            </label>

            {formData.uploadedFiles.length > 0 && (
              <div className="space-y-2">
                {formData.uploadedFiles.map((fileObj, i) => (
                  <div key={fileObj.id} className="flex items-center text-sm p-3 bg-gray-100 rounded-lg">
                    <FileText className="w-5 h-5 mr-3 text-gray-500 flex-shrink-0" />
                    <span className="flex-1 truncate" title={fileObj.file.name}>{fileObj.file.name}</span>
                    <div className="flex items-center ml-3">
                      {fileObj.status === 'uploading' && <Spinner className="w-4 h-4" />}
                      {fileObj.status === 'success' && <Check className="w-5 h-5 text-green-500" />}
                      {fileObj.status === 'error' && <span title={fileObj.error}><AlertTriangle className="w-5 h-5 text-red-500" /></span>}
                      <button type="button" onClick={() => removeFile(i)} className="ml-4 text-gray-500 hover:text-red-600"><X size={18} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {errors.files && <p className="text-red-600 text-sm mt-1">{errors.files}</p>}
          </div>
        </section>

        {errors.general && <p className="text-red-600 text-sm mt-4 text-center">{errors.general}</p>}
      </div>

      <div className="flex justify-end items-center p-6 border-t bg-gray-100 rounded-b-lg">
        {onClose && (
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-6 py-2 rounded-lg bg-white border border-gray-300 text-gray-800 hover:bg-gray-100 disabled:opacity-50 mr-4"
          >
            ยกเลิก
          </button>
        )}
        <button
          onClick={handleOpenConfirmation}
          disabled={isSubmitting || !origin || loading}
          className="px-8 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isSubmitting ? <Spinner className="w-5 h-5" /> : 'สร้างเอกสาร'}
        </button>
      </div>

      {isConfirmationModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-xl font-bold text-gray-800">ยืนยันข้อมูล</h3>
              <button onClick={() => setIsConfirmationModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 text-sm">
              <h4 className="text-base font-semibold text-gray-800">กรุณาตรวจสอบข้อมูลก่อนสร้างเอกสาร</h4>
              <div className="p-4 bg-gray-50 rounded-lg border space-y-2">
                <p><strong className="font-medium text-gray-700 w-32 inline-block">โครงการ:</strong> {selectedSiteName}</p>
                <p><strong className="font-medium text-gray-700 w-32 inline-block">หมวดงาน:</strong> {formData.discipline}</p>
                <p><strong className="font-medium text-gray-700 w-32 inline-block">เลขที่เอกสาร:</strong> {formData.documentNumber || '(ไม่ได้ระบุ)'}</p>
                <p><strong className="font-medium text-gray-700 w-32 inline-block">กำหนดวันตอบ:</strong> {formData.dueDate || '(ไม่ได้ระบุ)'}</p>
                <p className="border-t pt-2 mt-2"><strong className="font-medium text-gray-700 block">หัวข้อคำถาม:</strong> {formData.title}</p>
              </div>
              <div>
                <h4 className="font-medium text-gray-700">
                  ไฟล์แนบ ({formData.uploadedFiles.filter(f => f.status === 'success').length} ไฟล์):
                </h4>
                <ul className="list-disc list-inside mt-1 space-y-1 text-gray-900">
                  {formData.uploadedFiles.filter(f => f.status === 'success').map(f => (
                    <li key={f.id} className="truncate">{f.file.name}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex justify-end gap-4 p-4 border-t bg-gray-50">
              <button
                onClick={() => setIsConfirmationModalOpen(false)}
                disabled={isSubmitting}
                className="px-6 py-2 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:opacity-50"
              >
                กลับไปแก้ไข
              </button>
              <button
                onClick={submitForm}
                disabled={isSubmitting}
                className="px-6 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-400 flex items-center justify-center min-w-[160px]"
              >
                {isSubmitting ? <Spinner className="w-5 h-5 text-white mr-2" /> : null}
                {isSubmitting ? 'กำลังสร้าง...' : 'ยืนยันและสร้างเอกสาร'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
