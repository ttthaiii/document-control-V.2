// src/components/rfa/CreateRFAForm.tsx (โค้ดฉบับสมบูรณ์)
'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Upload, X, Check, AlertTriangle, Info, Paperclip,Loader2 } from 'lucide-react'
import { useGoogleSheets } from '@/lib/hooks/useGoogleSheets'
import { useAuth } from '@/lib/auth/useAuth'
import Spinner from '@/components/shared/Spinner'
import { ROLES, Role } from '@/lib/config/workflow';
import { useNotification } from '@/lib/context/NotificationContext';

// v 1. Import สิ่งที่จำเป็นจาก Firestore SDK
import { db } from '@/lib/firebase/client'
import { collection, query, where, getDocs, orderBy, documentId, collectionGroup } from 'firebase/firestore'


// --- Interfaces (เหมือนเดิม) ---
interface Category { id: string; categoryCode: string; categoryName: string; }
interface UploadedFile { id: string; file: File; status: 'pending' | 'uploading' | 'success' | 'error' | 'retrying'; progress: number; uploadedData?: { fileName: string; fileUrl: string; filePath: string; size: number; contentType: string; }; error?: string; retryCount: number; }
interface RFAFormData { rfaType: 'RFA-SHOP' | 'RFA-GEN' | 'RFA-MAT' | ''; categoryId: string; documentNumber: string; title: string; description: string; revisionNumber: string; uploadedFiles: UploadedFile[]; selectedProject: string; selectedCategory: string; selectedTask: TaskData | null; }
interface TaskData { taskCategory: string; taskName: string; projectName: string; taskUid?: string; }
interface Site { id: string; name: string; sheetId?: string; sheetName?: string; }
interface User { id: string; email: string; role: Role; sites: string[]; }
const INITIAL_FORM_DATA: RFAFormData = { rfaType: '', categoryId: '', documentNumber: '', title: '', description: '', revisionNumber: '00', uploadedFiles: [], selectedProject: '', selectedCategory: '', selectedTask: null }
type RFAConfig = { title: string; subtitle: string; icon: string; description: string; workflow: string; allowedRoles: Role[]; color: string; };
const RFA_TYPE_CONFIG: Record<'RFA-SHOP' | 'RFA-GEN' | 'RFA-MAT', RFAConfig> = {
  'RFA-SHOP': { title: 'RFA-SHOP', subtitle: 'Shop Drawing Approval', icon: '🏗️', description: 'สำหรับการขออนุมัติ Shop Drawing', workflow: 'ผู้สร้าง → Site Admin → CM', allowedRoles: [ROLES.BIM, ROLES.ME, ROLES.SN, ROLES.SITE_ADMIN, ROLES.ADMIN], color: 'blue' },
  'RFA-GEN': { title: 'RFA-GEN', subtitle: 'General Submission', icon: '📋', description: 'สำหรับการส่งเอกสารทั่วไป', workflow: 'ผู้สร้าง → CM', allowedRoles: [ROLES.BIM, ROLES.SITE_ADMIN, ROLES.ADMIN, ROLES.ME, ROLES.SN], color: 'green' },
  'RFA-MAT': { title: 'RFA-MAT', subtitle: 'Material Approval', icon: '🧱', description: 'สำหรับการขออนุมัติวัสดุ', workflow: 'Site Admin → CM', allowedRoles: [ROLES.SITE_ADMIN, ROLES.ADMIN], color: 'orange' }
};


export default function CreateRFAForm({ 
  onClose, 
  isModal = false,
  userProp,
  presetRfaType
}: { 
  onClose?: () => void
  isModal?: boolean
  userProp?: User 
  presetRfaType?: 'RFA-SHOP' | 'RFA-GEN' | 'RFA-MAT'
}) {
  
  const [formData, setFormData] = useState<RFAFormData>({ ...INITIAL_FORM_DATA, rfaType: presetRfaType || '', });
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [sheetCategories, setSheetCategories] = useState<string[]>([]);
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>('');

  const [isCheckingDocNum, setIsCheckingDocNum] = useState(false);
  const [isDocNumAvailable, setIsDocNumAvailable] = useState<boolean | null>(null);
  const [debouncedDocNum, setDebouncedDocNum] = useState('');

  const { firebaseUser, user } = useAuth(); // ใช้ user จาก useAuth โดยตรง
  const { showNotification } = useNotification();
  const { loading: sheetsLoading, error: sheetsError, getCategories, getTasks } = useGoogleSheets();
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [siteCategories, setSiteCategories] = useState<Category[]>([]);

  const isManualFlow = useMemo(() => {
    if (!userProp) return true;
    if (formData.rfaType === 'RFA-MAT' || formData.rfaType === 'RFA-GEN') return true;
    if (formData.rfaType === 'RFA-SHOP') return userProp.role !== ROLES.BIM;
    return true; 
  }, [userProp, formData.rfaType]);

  // v 2. เปลี่ยนจากการเรียก API มาใช้ getDocs เพื่อดึงข้อมูล Site
  useEffect(() => {
    const loadSites = async () => {
        if (!user?.sites || user.sites.length === 0) return;

        setLoading(true);
        try {
            const q = query(collection(db, "sites"), where(documentId(), "in", user.sites));
            const querySnapshot = await getDocs(q);
            const sitesFromDb: Site[] = querySnapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name,
                sheetId: doc.data().settings?.googleSheetsConfig?.spreadsheetId || '',
                sheetName: doc.data().settings?.googleSheetsConfig?.sheetName || '',
            }));
            setSites(sitesFromDb);
        } catch (error) {
            console.error('Error loading sites:', error);
            showNotification('error', 'เกิดข้อผิดพลาด', 'ไม่สามารถโหลดรายชื่อโครงการได้');
        } finally {
            setLoading(false);
        }
    };
    loadSites();
  }, [user]);


  useEffect(() => {
    if (!selectedSite || !formData.documentNumber) {
      setIsDocNumAvailable(null); 
      return;
    }

    setIsCheckingDocNum(true);
    const handler = setTimeout(() => {
      setDebouncedDocNum(formData.documentNumber);
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [formData.documentNumber, selectedSite]);

  useEffect(() => {
    if (!debouncedDocNum || !selectedSite) {
        return;
    }

    const checkDuplicate = async () => {
      setIsCheckingDocNum(true);
      setIsDocNumAvailable(null);
      try {
        const response = await fetch('/api/rfa/check-duplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId: selectedSite,
            documentNumber: debouncedDocNum,
          }),
        });
        const result = await response.json();
        setIsDocNumAvailable(!result.isDuplicate);

      } catch (error) {
        console.error("Failed to check duplicate:", error);
        setIsDocNumAvailable(null); 
      } finally {
        setIsCheckingDocNum(false);
      }
    };

    checkDuplicate();
  }, [debouncedDocNum, selectedSite]);
    
  const updateFormData = (updates: Partial<RFAFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
    const newErrors = { ...errors };
    Object.keys(updates).forEach(key => delete newErrors[key]);
    setErrors(newErrors);
  };
  
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!presetRfaType) {
        if (!formData.rfaType) {
          newErrors.rfaType = 'กรุณาเลือกประเภท RFA';
        } else {
          const config = RFA_TYPE_CONFIG[formData.rfaType];
          if (userProp && !config.allowedRoles.includes(userProp.role)) {
            newErrors.rfaType = `คุณไม่มีสิทธิ์สร้าง ${formData.rfaType}`;
          }
        }
    }
    if (!formData.title.trim()) newErrors.title = 'กรุณาใส่หัวข้อเอกสาร';
    if (!formData.revisionNumber.trim()) newErrors.revisionNumber = 'กรุณาใส่ Rev. No.';
    if (!selectedSite) newErrors.site = 'กรุณาเลือกโครงการ';
    if (!formData.documentNumber.trim()) {
      newErrors.documentNumber = 'กรุณาใส่เลขที่เอกสาร';
    } else if (isDocNumAvailable === false) {
      newErrors.documentNumber = 'เลขที่เอกสารนี้ถูกใช้ไปแล้ว';
    }
    if (isManualFlow) {
      if (!formData.categoryId.trim()) newErrors.categoryId = 'กรุณากรอกหมวดงาน';
    } else {
      if (!formData.selectedTask) newErrors.task = 'กรุณาเลือกงานจาก BIM Tracking';
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
        alert('กรุณากรอกข้อมูลให้ครบถ้วน');
    }
  }

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
      const finalCategoryId = isManualFlow ? formData.categoryId : formData.selectedTask?.taskCategory;
      const finalTaskData = isManualFlow ? null : formData.selectedTask;

      if (!finalCategoryId) throw new Error('ไม่สามารถระบุ Category ID ได้');

      const submitData = {
        rfaType: formData.rfaType,
        title: formData.title,
        description: formData.description,
        siteId: selectedSite,
        documentNumber: formData.documentNumber,
        revisionNumber: parseInt(formData.revisionNumber, 10) || 0,
        uploadedFiles: successfulFiles.map(f => f.uploadedData!),
        categoryId: finalCategoryId,
        taskData: finalTaskData
      };

      const response = await fetch('/api/rfa/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ payload: submitData })
      });

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'เกิดข้อผิดพลาดในการสร้างเอกสาร');
      
      if (result.success) {
        showNotification(
          'success', 
          'สร้าง RFA สำเร็จ!', 
          `หมายเลขเอกสาร: ${result.runningNumber}`
        );
        if (onClose) onClose();
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      showNotification('error', 'เกิดข้อผิดพลาด', errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const newUploads: UploadedFile[] = files.map(file => ({ id: `${file.name}-${Date.now()}`, file, status: 'pending', progress: 0, retryCount: 0 }));
    setFormData(prev => ({ ...prev, uploadedFiles: [...prev.uploadedFiles, ...newUploads] }));
    for (const fileObj of newUploads) {
      setFormData(prev => ({ ...prev, uploadedFiles: prev.uploadedFiles.map(f => f.id === fileObj.id ? { ...f, status: 'uploading' } : f) }));
      const result = await uploadTempFile(fileObj.file);
      setFormData(prev => ({ ...prev, uploadedFiles: prev.uploadedFiles.map(f => f.id === fileObj.id ? { ...f, ...result } : f) }));
    }
    event.target.value = '';
  };

  const removeFile = (index: number) => {
    const fileToRemove = formData.uploadedFiles[index];
    if (fileToRemove.uploadedData?.filePath) { /* Assuming deleteTempFile exists */ }
    updateFormData({ uploadedFiles: formData.uploadedFiles.filter((_, i) => i !== index) });
  };
  
  // v 3. เปลี่ยน handleSiteChange ให้ดึงข้อมูล Category จาก Firestore โดยตรง
  const handleSiteChange = async (siteId: string) => {
    setSelectedSite(siteId);
    updateFormData({ categoryId: '', selectedCategory: '', selectedTask: null });
    setSiteCategories([]);
    setSheetCategories([]);
    setTasks([]);
    setTaskSearchQuery('');
    if (!siteId) return;

    const selected = sites.find(s => s.id === siteId);
    if (!selected) return;
    
    setLoading(true);
    if (isManualFlow) {
        try {
            const q = query(
              collection(db, `sites/${siteId}/categories`), 
              orderBy('categoryCode')
            );
            const querySnapshot = await getDocs(q);
            const cats: Category[] = querySnapshot.docs.map(doc => ({
                id: doc.id,
                categoryCode: doc.data().categoryCode,
                categoryName: doc.data().categoryName
            }));
            setSiteCategories(cats);
        } catch (e) { 
            console.error("Failed to fetch site categories:", e); 
            setErrors(prev => ({ ...prev, site: 'ไม่สามารถโหลดหมวดงานได้' }));
        } finally { 
            setLoading(false); 
        }
    } else {
      updateFormData({ selectedProject: selected.name });
      try {
        const cats = await getCategories({ sheetId: selected.sheetId || '' }, selected.name, formData.rfaType);
        setSheetCategories(cats);
      } catch (e) { 
          console.error("Failed to fetch categories from BIM-Tracking:", e); 
          setErrors(prev => ({ ...prev, site: 'ไม่สามารถโหลดหมวดงานจาก BIM-Tracking ได้' }));
      } finally {
          setLoading(false);
      }
    }
  };

  const handleCategoryChange = async (category: string) => {
    updateFormData({ selectedCategory: category, selectedTask: null });
    setTasks([]);
    const site = sites.find(s => s.id === selectedSite);
    if (!site || !formData.selectedProject) return;
    try {
      const taskList = await getTasks({ sheetId: site.sheetId || '' }, formData.selectedProject, category);
      setTasks(taskList);
    } catch (e) { console.error(e); }
  };

  const handleTaskSelect = (task: TaskData) => {
    updateFormData({ selectedTask: task, title: `${task.taskName} - RFA` });
    setTaskSearchQuery(task.taskName);
  };
  
  const filteredTasks = useMemo(() => {
    if (!taskSearchQuery) return tasks.slice(0, 20);
    return tasks.filter(t => t.taskName.toLowerCase().includes(taskSearchQuery.toLowerCase()));
  }, [tasks, taskSearchQuery]);

  // ... (ส่วน JSX ที่เหลือทั้งหมดเหมือนเดิม ไม่ต้องแก้ไข) ...
  return (
    <div className={`${isModal ? 'max-w-4xl w-full mx-auto' : ''} bg-white rounded-lg shadow-xl flex flex-col h-full max-h-[95vh]`}>
      <div className="flex items-center justify-between p-6 border-b bg-gray-50 rounded-t-lg">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            สร้าง RFA Document
            {formData.rfaType && RFA_TYPE_CONFIG[formData.rfaType] && (
              <span className="font-medium text-gray-600"> - {RFA_TYPE_CONFIG[formData.rfaType].subtitle}</span>
            )}
          </h2>
        </div>
        {onClose && <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X /></button>}
      </div>
      
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto bg-slate-50 space-y-6">
        
        {!presetRfaType && (
            <section className="bg-white p-6 rounded-lg border border-gray-200">
                <h3 className="flex items-center text-lg font-semibold text-gray-900 border-b pb-4 mb-6">
                  <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center mr-3 font-bold text-base">1</span>
                  เลือกประเภทเอกสาร
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Object.entries(RFA_TYPE_CONFIG).map(([type, config]) => {
                        const isAllowed = userProp ? config.allowedRoles.includes(userProp.role) : false;
                        return (
                        <div key={type} onClick={() => isAllowed && updateFormData({ rfaType: type as any })}
                            className={`p-6 border-2 rounded-lg text-center cursor-pointer transition-all duration-200 ${formData.rfaType === type ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : isAllowed ? 'border-gray-200 hover:border-gray-400' : 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'}`}>
                            <div className="text-4xl mb-3">{config.icon}</div>
                            <h4 className="font-semibold text-gray-800">{config.title}</h4>
                            <p className="text-sm text-gray-500 mt-1">{config.description}</p>
                        </div>
                        )
                    })}
                </div>
                {errors.rfaType && <p className="text-red-600 text-sm mt-2">{errors.rfaType}</p>}
            </section>
        )}

        <section className={`bg-white p-6 rounded-lg border border-gray-200 ${!formData.rfaType && !presetRfaType ? 'opacity-40 pointer-events-none' : ''}`}>
            <h3 className="flex items-center text-lg font-semibold text-gray-900 border-b pb-4 mb-6">
                <Info size={20} className="mr-3 text-blue-600"/>
                ข้อมูลเอกสาร
            </h3>
            <div className="space-y-6 max-w-3xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">โครงการ <span className="text-red-500">*</span></label>
                        <select value={selectedSite} onChange={(e) => handleSiteChange(e.target.value)} className="w-full p-3 border rounded-lg bg-gray-50">
                            <option value="">-- เลือกโครงการ --</option>
                            {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
                        </select>
                        {errors.site && <p className="text-red-600 text-sm mt-1">{errors.site}</p>}
                    </div>
                    
                    {isManualFlow ? (
                        <div>
                            <label htmlFor="category-manual-input" className="block text-sm font-medium text-gray-700 mb-2">หมวดงาน <span className="text-red-500">*</span></label>
                            <input id="category-manual-input" type="text" list="category-list" value={formData.categoryId} onChange={(e) => updateFormData({ categoryId: e.target.value })} placeholder="พิมพ์หรือเลือกหมวดงาน" className="w-full p-3 border rounded-lg" disabled={!selectedSite} />
                            <datalist id="category-list">{siteCategories.map(cat => (<option key={cat.id} value={cat.categoryCode} />))}</datalist>
                            {errors.categoryId && <p className="text-red-600 text-sm mt-1">{errors.categoryId}</p>}
                        </div>
                    ) : (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">หมวดงาน {sheetsLoading && <Spinner className="w-4 h-4 ml-2" />} <span className="text-red-500">*</span></label>
                            <select value={formData.selectedCategory} onChange={(e) => handleCategoryChange(e.target.value)} className="w-full p-3 border rounded-lg disabled:bg-gray-100 bg-gray-50" disabled={!selectedSite || sheetsLoading}>
                                <option value="">{sheetsLoading ? 'กำลังโหลด...' : '-- เลือกหมวดงาน --'}</option>
                                {sheetCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                            {sheetsError && <p className="text-red-600 text-sm mt-1">Error: {sheetsError}</p>}
                        </div>
                    )}
                </div>

                {!isManualFlow && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">ค้นหางาน <span className="text-red-500">*</span></label>
                        <input type="text" placeholder="ค้นหาชื่องานจาก BIM Tracking..." value={taskSearchQuery} onChange={(e) => setTaskSearchQuery(e.target.value)} className="w-full p-3 border rounded-lg" disabled={!formData.selectedCategory || sheetsLoading} />
                        <div className="mt-2 max-h-48 overflow-y-auto border rounded-lg bg-white">
                            {filteredTasks.map(task => (<div key={task.taskUid || task.taskName} onClick={() => handleTaskSelect(task)} className={`p-3 text-sm cursor-pointer hover:bg-gray-100 ${formData.selectedTask?.taskName === task.taskName ? 'bg-blue-50 font-semibold' : ''}`}>{task.taskName}</div>))}
                        </div>
                        {errors.task && <p className="text-red-600 text-sm mt-1">{errors.task}</p>}
                    </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">เลขที่เอกสาร</label>
                        <div className="relative">
                            <input 
                              type="text" 
                              value={formData.documentNumber} 
                              onChange={(e) => {
                                updateFormData({ documentNumber: e.target.value });
                                setIsDocNumAvailable(null);
                              }}
                              className={`w-full p-3 border rounded-lg pr-10 ${isDocNumAvailable === false ? 'border-red-500' : ''}`} 
                            />
                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                              {isCheckingDocNum && <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />}
                              {!isCheckingDocNum && isDocNumAvailable === true && <Check className="h-5 w-5 text-green-500" />}
                              {!isCheckingDocNum && isDocNumAvailable === false && <X className="h-5 w-5 text-red-500" />}
                            </div>
                        </div>
                        {errors.documentNumber && <p className="text-red-600 text-sm mt-1">{errors.documentNumber}</p>}
                        {!isCheckingDocNum && isDocNumAvailable === false && !errors.documentNumber && (
                          <p className="text-red-600 text-sm mt-1">เลขที่เอกสารนี้ถูกใช้ไปแล้ว</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Rev. No.</label>
                        <input type="text" value={formData.revisionNumber} onChange={(e) => updateFormData({ revisionNumber: e.target.value })} className="w-full p-3 border rounded-lg" />
                        {errors.revisionNumber && <p className="text-red-600 text-sm mt-1">{errors.revisionNumber}</p>}
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">หัวข้อเอกสาร <span className="text-red-500">*</span></label>
                    <input type="text" value={formData.title} onChange={(e) => updateFormData({ title: e.target.value })} className="w-full p-3 border rounded-lg" />
                    {errors.title && <p className="text-red-600 text-sm mt-1">{errors.title}</p>}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">รายละเอียด</label>
                    <textarea value={formData.description} onChange={(e) => updateFormData({ description: e.target.value })} rows={3} className="w-full p-3 border rounded-lg" />
                </div>
            </div>
        </section>

        <section className={`bg-white p-6 rounded-lg border border-gray-200 ${!formData.rfaType && !presetRfaType ? 'opacity-40 pointer-events-none' : ''}`}>
            <h3 className="flex items-center text-lg font-semibold text-gray-900 border-b pb-4 mb-6">
                <Paperclip size={20} className="mr-3 text-blue-600"/>
                แนบไฟล์ <span className="text-red-500 ml-1">*</span>
            </h3>
            <div className="space-y-6 max-w-3xl">
                <label htmlFor="file-upload" className="flex flex-col items-center justify-center w-full h-48 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                        <Upload className="w-10 h-10 mb-4 text-gray-400" />
                        <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">คลิกเพื่อเลือกไฟล์</span> หรือลากมาวาง</p>
                        <p className="text-xs text-gray-500">สามารถเลือกได้หลายไฟล์พร้อมกัน</p>
                    </div>
                    <input id="file-upload" type="file" multiple onChange={handleFileUpload} className="hidden"/>
                </label>

                {formData.uploadedFiles.length > 0 && (
                <div>
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
            disabled={isSubmitting || (!formData.rfaType && !presetRfaType)} 
            className="px-8 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isSubmitting ? <Spinner className="w-5 h-5"/> : 'สร้างเอกสาร'}
        </button>
      </div>

      {isConfirmationModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center p-4 border-b">
                    <h3 className="text-xl font-bold text-gray-800">ยืนยันข้อมูล</h3>
                    <button onClick={() => setIsConfirmationModalOpen(false)} className="text-gray-400 hover:text-gray-600"> <X size={24} /> </button>
                </div>
                <div className="p-6 overflow-y-auto space-y-4 text-sm">
                    <h4 className="text-base font-semibold text-gray-700">กรุณาตรวจสอบข้อมูลก่อนสร้างเอกสาร</h4>
                    <div className="p-4 bg-gray-50 rounded-lg border space-y-2">
                        <p><strong className="font-medium text-gray-500 w-28 inline-block">ประเภท:</strong> {formData.rfaType}</p>
                        <p><strong className="font-medium text-gray-500 w-28 inline-block">โครงการ:</strong> {sites.find(s => s.id === selectedSite)?.name}</p>
                        <p><strong className="font-medium text-gray-500 w-28 inline-block">หมวดงาน:</strong> {isManualFlow ? formData.categoryId : formData.selectedTask?.taskCategory}</p>
                        <p><strong className="font-medium text-gray-500 w-28 inline-block">เลขที่เอกสาร:</strong> {formData.documentNumber || "(ไม่ได้ระบุ)"}</p>
                        <p><strong className="font-medium text-gray-500 w-28 inline-block">Rev.:</strong> {formData.revisionNumber}</p>
                        <p className="border-t pt-2 mt-2"><strong className="font-medium text-gray-500 block">หัวข้อ:</strong> {formData.title}</p>
                    </div>
                     <div>
                        <h4 className="font-medium text-gray-500">ไฟล์แนบ ({formData.uploadedFiles.filter(f => f.status === 'success').length} ไฟล์):</h4>
                        <ul className="list-disc list-inside mt-1 space-y-1 text-gray-800">
                            {formData.uploadedFiles.filter(f => f.status === 'success').map(f => (<li key={f.id} className="truncate">{f.file.name}</li>))}
                        </ul>
                    </div>
                </div>
                <div className="flex justify-end gap-4 p-4 border-t bg-gray-50">
                    <button onClick={() => setIsConfirmationModalOpen(false)} className="px-6 py-2 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300"> กลับไปแก้ไข </button>
                    <button onClick={submitForm} className="px-6 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700"> ยืนยันและสร้างเอกสาร </button>
                </div>
            </div>
        </div>
      )}
    </div>
  )
}