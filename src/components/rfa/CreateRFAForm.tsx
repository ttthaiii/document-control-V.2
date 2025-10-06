'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Upload, X, Check, AlertTriangle } from 'lucide-react'
import { useGoogleSheets } from '@/lib/hooks/useGoogleSheets'
import { useAuth } from '@/lib/auth/useAuth'
import Spinner from '@/components/shared/Spinner'
import { ROLES, Role } from '@/lib/config/workflow';

interface Category {
  id: string;
  categoryCode: string;
  categoryName: string;
}

interface UploadedFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error' | 'retrying';
  progress: number;
  uploadedData?: {
    fileName: string;
    fileUrl: string;
    filePath: string;
    size: number;
    contentType: string;
  };
  error?: string;
  retryCount: number;
}

interface RFAFormData {
  rfaType: 'RFA-SHOP' | 'RFA-GEN' | 'RFA-MAT' | ''
  categoryId: string
  documentNumber: string
  title: string
  description: string
  revisionNumber: string;
  uploadedFiles: UploadedFile[]
  selectedProject: string
  selectedCategory: string
  selectedTask: TaskData | null
}

interface TaskData {
  taskCategory: string
  taskName: string
  projectName: string
  taskUid?: string
}

interface Site {
  id: string
  name: string
  sheetId?: string
  sheetName?: string
}

interface User {
  id: string
  email: string
  role: Role
  sites: string[]
}

const INITIAL_FORM_DATA: RFAFormData = {
  rfaType: '',
  categoryId: '',
  documentNumber: '',
  title: '',
  description: '',
  revisionNumber: '00',
  uploadedFiles: [],
  selectedProject: '',
  selectedCategory: '',
  selectedTask: null
}

type RFAConfig = {
  title: string;
  subtitle: string;
  icon: string;
  description: string;
  workflow: string;
  allowedRoles: Role[]; // 👈 บอกว่า allowedRoles เป็น Array ของ Role
  color: string;
};

// 👇 2. กำหนด Type ให้กับ RFA_TYPE_CONFIG
const RFA_TYPE_CONFIG: Record<'RFA-SHOP' | 'RFA-GEN' | 'RFA-MAT', RFAConfig> = {
  'RFA-SHOP': {
    title: 'RFA-SHOP',
    subtitle: 'Shop Drawing Approval',
    icon: '🏗️',
    description: 'สำหรับการขออนุมัติ Shop Drawing',
    workflow: 'ผู้สร้าง → Site Admin → CM',
    allowedRoles: [ROLES.BIM, ROLES.ME, ROLES.SN, ROLES.SITE_ADMIN, ROLES.ADMIN],
    color: 'blue'
  },
  'RFA-GEN': {
    title: 'RFA-GEN', 
    subtitle: 'General Submission',
    icon: '📋',
    description: 'สำหรับการส่งเอกสารทั่วไป',
    workflow: 'ผู้สร้าง → CM',
    allowedRoles: [ROLES.BIM, ROLES.SITE_ADMIN, ROLES.ADMIN, ROLES.ME, ROLES.SN],
    color: 'green'
  },
  'RFA-MAT': {
    title: 'RFA-MAT',
    subtitle: 'Material Approval', 
    icon: '🧱',
    description: 'สำหรับการขออนุมัติวัสดุ',
    workflow: 'Site Admin → CM',
    allowedRoles: [ROLES.SITE_ADMIN, ROLES.ADMIN],
    color: 'orange'
  }
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
  const initialStep = presetRfaType ? 2 : 1;
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [formData, setFormData] = useState<RFAFormData>({
    ...INITIAL_FORM_DATA,
    rfaType: presetRfaType || '',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [sheetCategories, setSheetCategories] = useState<string[]>([]);
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>('');
  const { firebaseUser } = useAuth();
  const { loading: sheetsLoading, error: sheetsError, getCategories, getTasks } = useGoogleSheets();
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [siteCategories, setSiteCategories] = useState<Category[]>([]);

  const isManualFlow = userProp && (userProp.role === ROLES.ME || userProp.role === ROLES.SN);

  useEffect(() => {
    if (presetRfaType) {
      updateFormData({ rfaType: presetRfaType });
      setCurrentStep(2);
    }
  }, [presetRfaType]);

  useEffect(() => {
    const loadSites = async () => {
      if (!firebaseUser) return;
      setLoading(true);
      try {
        const token = await firebaseUser.getIdToken();
        const response = await fetch('/api/sites', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setSites(data.sites || []);
        }
      } catch (error) {
        console.error('Error loading sites:', error);
      } finally {
        setLoading(false);
      }
    };
    loadSites();
  }, [firebaseUser]);

  useEffect(() => {
    return () => {
      formData.uploadedFiles.forEach(file => {
        if (file.uploadedData?.filePath) {
          deleteTempFile(file.uploadedData.filePath);
        }
      });
    };
  }, []);

  const updateFormData = (updates: Partial<RFAFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
    const newErrors = { ...errors };
    Object.keys(updates).forEach(key => delete newErrors[key]);
    setErrors(newErrors);
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};
    switch (step) {
      case 1:
        if (!formData.rfaType) {
          newErrors.rfaType = 'กรุณาเลือกประเภท RFA';
        } else {
          const config = RFA_TYPE_CONFIG[formData.rfaType];
          if (userProp && !config.allowedRoles.includes(userProp.role)) {
            newErrors.rfaType = `คุณไม่มีสิทธิ์สร้าง ${formData.rfaType}`;
          }
        }
        break;
      case 2:
        if (!formData.title.trim()) newErrors.title = 'กรุณาใส่หัวข้อเอกสาร';
        if (!formData.revisionNumber.trim()) newErrors.revisionNumber = 'กรุณาใส่ Rev. No.';
        if (!formData.documentNumber.trim()) newErrors.documentNumber = 'กรุณาใส่เลขที่เอกสาร';
        if (!selectedSite) newErrors.site = 'กรุณาเลือกโครงการ';
        if (isManualFlow) {
          if (!formData.categoryId.trim()) newErrors.categoryId = 'กรุณากรอกหมวดงาน';
        } else {
          if (!formData.selectedTask) newErrors.task = 'กรุณาเลือกงานจาก Google Sheets';
        }
        break;
      case 3:
        if (formData.uploadedFiles.filter(f => f.status === 'success').length === 0) {
          newErrors.files = 'กรุณาอัปโหลดไฟล์ให้สำเร็จก่อน';
        }
        break;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const submitForm = async () => {
    if (!validateStep(3)) return;

    setIsUploading(true);
    try {
      if (!firebaseUser) throw new Error('กรุณาล็อกอินก่อน');
      const token = await firebaseUser.getIdToken();

      // ✅ KEY CHANGE 1: กรองไฟล์ให้มั่นใจว่า uploadedData ไม่ใช่ undefined
      const successfulFiles = formData.uploadedFiles.filter(
        f => f.status === 'success' && f.uploadedData
      );

      if (successfulFiles.length === 0) {
        throw new Error('กรุณาอัปโหลดไฟล์ให้สำเร็จอย่างน้อย 1 ไฟล์');
      }

      const finalCategoryId = isManualFlow ? formData.categoryId : formData.selectedTask?.taskCategory;
      const finalTaskData = isManualFlow ? null : formData.selectedTask;

      if (!finalCategoryId) {
        throw new Error('ไม่สามารถระบุ Category ID ได้ กรุณาตรวจสอบข้อมูล');
      }

      const submitData = {
        rfaType: formData.rfaType,
        title: formData.title,
        description: formData.description,
        siteId: selectedSite,
        documentNumber: formData.documentNumber,
        revisionNumber: parseInt(formData.revisionNumber, 10) || 0,
        
        // ✅ KEY CHANGE 2: แก้ไข Mapping ให้ตรงกับ Type ที่ถูกต้อง
        uploadedFiles: successfulFiles.map(f => ({
          fileName: f.uploadedData!.fileName,
          fileUrl: f.uploadedData!.fileUrl,
          filePath: f.uploadedData!.filePath,
          fileSize: f.uploadedData!.size,       // แก้ไขจาก fileSize เป็น size
          fileType: f.uploadedData!.contentType // แก้ไขจาก fileType เป็น contentType
        })),

        categoryId: finalCategoryId,
        taskData: finalTaskData
      };

      const response = await fetch('/api/rfa/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        // ส่งข้อมูลที่ถูกต้องไปยัง API
        body: JSON.stringify({ payload: submitData })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `HTTP error! status: ${response.status}`);
      }

      if (result.success) {
        alert(`สร้าง RFA สำเร็จ! หมายเลขเอกสาร: ${result.runningNumber}`);
        if (onClose) onClose();
      } else {
        throw new Error(result.error || 'เกิดข้อผิดพลาดในการสร้างเอกสาร');
      }

    } catch (error) {
      console.error("Submit Error:", error);
      setErrors({ general: error instanceof Error ? error.message : 'เกิดข้อผิดพลาดที่ไม่รู้จัก' });
    } finally {
      setIsUploading(false);
    }
  };

  const nextStep = () => currentStep < 4 && validateStep(currentStep) && setCurrentStep(currentStep + 1);
  const prevStep = () => currentStep > 1 && setCurrentStep(currentStep - 1);

  const uploadTempFile = async (file: File): Promise<UploadedFile> => {
    const tempFile: UploadedFile = {
      id: `${file.name}-${Date.now()}`,
      file, status: 'uploading', progress: 0, retryCount: 0
    };
    try {
      if (!firebaseUser) throw new Error('User not authenticated');
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
        return { ...tempFile, status: 'success', progress: 100, uploadedData: result.fileData };
      }
      throw new Error(result.error || 'Upload failed');
    } catch (err) {
      return { ...tempFile, status: 'error', error: err instanceof Error ? err.message : 'Upload error' };
    }
  };

  const deleteTempFile = async (filePath: string) => {
    try {
      if (!firebaseUser) return;
      const token = await firebaseUser.getIdToken();
      await fetch('/api/rfa/delete-temp-file', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath })
      });
    } catch (err) {
      console.error('Failed to delete temp file:', err);
    }
  };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;
    
        // สร้าง Object เริ่มต้นสำหรับไฟล์ใหม่ทั้งหมด
        const newUploads: UploadedFile[] = files.map(file => ({
          id: `${file.name}-${Date.now()}`,
          file,
          status: 'pending',
          progress: 0,
          retryCount: 0
        }));
    
        // 1. เพิ่มไฟล์ทั้งหมดเข้า State ในสถานะ pending
        setFormData(prev => ({
          ...prev,
          uploadedFiles: [...prev.uploadedFiles, ...newUploads]
        }));
    
        // 2. วนลูปเพื่ออัปโหลดทีละไฟล์
        for (const fileObj of newUploads) {
          // 2.1 อัปเดตสถานะเป็น 'uploading' เพื่อให้ Spinner แสดงผล
          setFormData(prev => ({
            ...prev,
            uploadedFiles: prev.uploadedFiles.map(f => 
              f.id === fileObj.id ? { ...f, status: 'uploading' } : f
            )
          }));
    
          // 2.2 เริ่มอัปโหลดไฟล์
          const result = await uploadTempFile(fileObj.file);
    
          // 2.3 อัปเดตสถานะสุดท้าย (success/error) เมื่ออัปโหลดเสร็จ
          setFormData(prev => ({
            ...prev,
            uploadedFiles: prev.uploadedFiles.map(f => 
              f.id === fileObj.id ? { ...f, ...result } : f
            )
          }));
        }
    
        // ล้างค่าใน input เพื่อให้สามารถเลือกไฟล์เดิมซ้ำได้
        event.target.value = '';
    };
  
  const removeFile = (index: number) => {
    const fileToRemove = formData.uploadedFiles[index];
    if (fileToRemove.uploadedData?.filePath) {
      deleteTempFile(fileToRemove.uploadedData.filePath);
    }
    updateFormData({ uploadedFiles: formData.uploadedFiles.filter((_, i) => i !== index) });
  };

  const handleSiteChange = async (siteId: string) => {
    setSelectedSite(siteId);

    // รีเซ็ตค่าที่เกี่ยวข้อง
    updateFormData({ categoryId: '', selectedCategory: '', selectedTask: null });
    setSiteCategories([]);
    setSheetCategories([]);
    setTasks([]);
    setTaskSearchQuery('');

    if (!siteId) return;

    // ค้นหาข้อมูล site ที่เลือกจาก state `sites`
    const selected = sites.find(s => s.id === siteId);
    if (!selected) return;

    if (isManualFlow) {
      // Manual Flow: ดึงหมวดงานจาก Firestore
      if (firebaseUser) {
        setLoading(true);
        try {
          const token = await firebaseUser.getIdToken();
          const response = await fetch(`/api/sites/${siteId}/categories`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await response.json();
          if (data.success) {
            setSiteCategories(data.categories);
          }
        } catch (e) {
          console.error("Failed to fetch site categories:", e);
          setErrors(prev => ({ ...prev, site: 'ไม่สามารถโหลดหมวดงานได้' }));
        } finally {
          setLoading(false);
        }
      }
    } else {
      // Google Sheets Flow (ที่ตอนนี้คือ BIM-Tracking Flow)
      updateFormData({ selectedProject: selected.name });
      // ไม่ต้องมี if check sheetId อีกต่อไป ลบทิ้งได้เลย

      try {
        // sheetId ไม่ได้ถูกใช้งานใน API แล้ว แต่ยังส่งเป็นค่าว่างตามโครงสร้างเดิมของ Hook ได้
        const cats = await getCategories({ sheetId: selected.sheetId || '' }, selected.name, formData.rfaType);
        setSheetCategories(cats);
      } catch (e) { 
        console.error("Failed to fetch categories from BIM-Tracking:", e);
        setErrors(prev => ({ ...prev, site: 'ไม่สามารถโหลดหมวดงานจากระบบ BIM-Tracking ได้' }));
      }
    }
  };

  const handleCategoryChange = async (category: string) => {
    updateFormData({ selectedCategory: category, selectedTask: null });
    setTasks([]);
    const site = sites.find(s => s.id === selectedSite);
    // แก้ไขเงื่อนไข โดยลบ !site.sheetId ออก
    if (!site || !formData.selectedProject) return; 
    try {
      // ส่ง sheetId เป็นค่าว่างได้เลย เพราะ API หลังบ้านไม่ได้ใช้แล้ว
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


  return (
    <div className={`${isModal ? 'max-w-4xl w-full mx-auto' : ''} bg-white rounded-lg shadow-xl flex flex-col h-full max-h-[95vh]`}>
      <div className="flex items-center justify-between p-6 border-b bg-gray-50">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            สร้าง RFA Document
            {presetRfaType && RFA_TYPE_CONFIG[presetRfaType] && (
              <span className="font-medium text-gray-600"> - {RFA_TYPE_CONFIG[presetRfaType].subtitle}</span>
            )}
          </h2>
          <p className="text-sm text-gray-600 mt-1">{userProp && `โดย ${userProp.email} (${userProp.role})`}</p>
        </div>
        {onClose && <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X /></button>}
      </div>
      
      <div className="flex-1 p-6 overflow-y-auto">
        {currentStep === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Object.entries(RFA_TYPE_CONFIG).map(([type, config]) => {
                    const isAllowed = userProp ? config.allowedRoles.includes(userProp.role) : false;
                    return (
                    <div key={type} onClick={() => isAllowed && updateFormData({ rfaType: type as any })}
                        className={`p-6 border-2 rounded-lg text-center cursor-pointer ${formData.rfaType === type ? 'border-blue-500 bg-blue-50' : isAllowed ? 'border-gray-200 hover:border-gray-300' : 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'}`}>
                        <div className="text-4xl mb-2">{config.icon}</div>
                        <h4 className="font-semibold">{config.title}</h4>
                        <p className="text-sm text-gray-500 mt-1">{config.description}</p>
                    </div>
                    )
                })}
            </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">โครงการ</label>
              <select value={selectedSite} onChange={(e) => handleSiteChange(e.target.value)} className="w-full p-3 border rounded-lg">
                <option value="">-- เลือกโครงการ --</option>
                {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
              {errors.site && <p className="text-red-600 text-sm mt-1">{errors.site}</p>}
            </div>
            
            {isManualFlow ? (
              <div>
                <label htmlFor="category-manual-input" className="block text-sm font-medium text-gray-700 mb-2">หมวดงาน</label>
                <input
                  id="category-manual-input"
                  type="text"
                  list="category-list"
                  value={formData.categoryId}
                  onChange={(e) => updateFormData({ categoryId: e.target.value })}
                  placeholder="พิมพ์เพื่อค้นหา หรือกรอกหมวดงานใหม่"
                  className="w-full p-3 border rounded-lg"
                  disabled={!selectedSite}
                />
                <datalist id="category-list">
                  {siteCategories.map(cat => (
                    <option key={cat.id} value={cat.categoryCode} />
                  ))}
                </datalist>
                {errors.categoryId && <p className="text-red-600 text-sm mt-1">{errors.categoryId}</p>}
              </div>
            ) : (
              <>
                {/* ✅ FIX: ปรับปรุง UI ส่วนนี้เพื่อแสดง Loading Spinner และ Error */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    หมวดงาน
                    {sheetsLoading && <Spinner className="w-4 h-4 ml-2" />}
                  </label>
                  <select 
                    value={formData.selectedCategory} 
                    onChange={(e) => handleCategoryChange(e.target.value)} 
                    className="w-full p-3 border rounded-lg disabled:bg-gray-100" 
                    disabled={!selectedSite || sheetsLoading}
                  >
                    <option value="">
                      {sheetsLoading ? 'กำลังโหลด...' : '-- เลือกหมวดงาน --'}
                    </option>
                    {sheetCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                  {sheetsError && <p className="text-red-600 text-sm mt-1">Error: {sheetsError}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">ค้นหางาน</label>
                  <input type="text" placeholder="ค้นหา..." value={taskSearchQuery} onChange={(e) => setTaskSearchQuery(e.target.value)} className="w-full p-3 border rounded-lg" disabled={!formData.selectedCategory || sheetsLoading} />
                  <div className="mt-2 max-h-48 overflow-y-auto border rounded-lg">
                    {filteredTasks.map(task => (
                      <div key={task.taskUid || task.taskName} onClick={() => handleTaskSelect(task)} className={`p-2 cursor-pointer hover:bg-gray-100 ${formData.selectedTask?.taskName === task.taskName ? 'bg-blue-50' : ''}`}>{task.taskName}</div>
                    ))}
                  </div>
                  {errors.task && <p className="text-red-600 text-sm mt-1">{errors.task}</p>}
                </div>
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">เลขที่เอกสาร</label>
                <input type="text" value={formData.documentNumber} onChange={(e) => updateFormData({ documentNumber: e.target.value })} className="w-full p-3 border rounded-lg" />
                {errors.documentNumber && <p className="text-red-600 text-sm mt-1">{errors.documentNumber}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Rev. No.</label>
                <input type="text" value={formData.revisionNumber} onChange={(e) => updateFormData({ revisionNumber: e.target.value })} className="w-full p-3 border rounded-lg" />
                {errors.revisionNumber && <p className="text-red-600 text-sm mt-1">{errors.revisionNumber}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">หัวข้อเอกสาร</label>
              <input type="text" value={formData.title} onChange={(e) => updateFormData({ title: e.target.value })} className="w-full p-3 border rounded-lg" />
              {errors.title && <p className="text-red-600 text-sm mt-1">{errors.title}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">รายละเอียด</label>
              <textarea value={formData.description} onChange={(e) => updateFormData({ description: e.target.value })} rows={3} className="w-full p-3 border rounded-lg" />
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <input type="file" multiple onChange={handleFileUpload} id="file-upload" className="hidden"/>
              <label htmlFor="file-upload" className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-lg">เลือกไฟล์</label>
            </div>

            {formData.uploadedFiles.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-800 mb-2">ไฟล์ที่อัปโหลด</h4>
                <div className="space-y-2">
                  {formData.uploadedFiles.map((fileObj, i) => (
                    <div key={fileObj.id} className="flex items-center text-sm p-2 bg-gray-100 rounded">
                        <FileText className="w-4 h-4 mr-3 text-gray-500 flex-shrink-0" />
                        <span className="flex-1 truncate" title={fileObj.file.name}>
                          {fileObj.file.name}
                        </span>
                        <div className="flex items-center ml-3">
                          {fileObj.status === 'uploading' && <Spinner className="w-4 h-4" />}
                          {fileObj.status === 'success' && <Check className="w-4 h-4 text-green-500" />}
                          {fileObj.status === 'error' && (
                            <span title={fileObj.error}>
                              <AlertTriangle className="w-4 h-4 text-red-500" />
                            </span>
                          )}
                           <button onClick={() => removeFile(i)} className="ml-3 text-gray-500 hover:text-red-600">
                             <X size={16} />
                           </button>
                        </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {errors.files && <p className="text-red-600 text-sm mt-1">{errors.files}</p>}
          </div>
        )}
        
        {currentStep === 4 && (
          <div className="space-y-4 max-w-2xl mx-auto">
            <h3 className="text-xl font-semibold text-center text-gray-800">ตรวจสอบข้อมูล</h3>
            <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 space-y-4">

              {/* --- ส่วนรายละเอียดหลัก --- */}
              <div className="space-y-2 text-base">
                <p>
                  <strong className="text-gray-500 font-medium w-32 inline-block">โครงการ:</strong>
                  <span className="font-semibold text-gray-800">{sites.find(s => s.id === selectedSite)?.name}</span>
                </p>                
                <p>
                  <strong className="text-gray-500 font-medium w-32 inline-block">ประเภท:</strong>
                  <span className="font-semibold text-gray-800">{formData.rfaType}</span>
                </p>
                <p>
                  <strong className="text-gray-500 font-medium w-32 inline-block">หมวดงาน:</strong>
                  <span className="font-semibold text-gray-800">{isManualFlow ? formData.categoryId : formData.selectedTask?.taskCategory}</span>
                </p>
                 <p>
                  <strong className="text-gray-500 font-medium w-32 inline-block">เลขที่เอกสาร:</strong>
                  <span className="font-semibold text-gray-800">{formData.documentNumber}</span>
                </p>
                 <p>
                  <strong className="text-gray-500 font-medium w-32 inline-block">Rev.:</strong>
                  <span className="font-semibold text-gray-800">{formData.revisionNumber}</span>
                </p>
              </div>
              
              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-500">หัวข้อ:</p>
                <p className="text-base font-semibold text-gray-800 mt-1 break-words">{formData.title}</p>
              </div>

              {/* --- ส่วนไฟล์แนบ --- */}
              <div className="pt-4 border-t border-gray-200">
                <h4 className="text-sm font-medium text-gray-500">
                  ไฟล์แนบ ({formData.uploadedFiles.filter(f => f.status === 'success').length} ไฟล์):
                </h4>
                <ul className="list-disc list-inside mt-2 space-y-1 text-base">
                  {formData.uploadedFiles.filter(f => f.status === 'success').map(f => (
                    <li key={f.id} className="truncate text-gray-800" title={f.file.name}>{f.file.name}</li>
                  ))}
                </ul>
              </div>

            </div>
          </div>
        )}
      </div>

       <div className="flex justify-between items-center p-6 border-t bg-gray-50">
        <button 
            onClick={prevStep} 
            disabled={currentStep === initialStep || isUploading}
            className={`px-4 py-2 rounded-lg bg-gray-200 disabled:opacity-50 ${currentStep === initialStep ? 'invisible' : 'visible'}`}
        >
          ย้อนกลับ
        </button>

        {currentStep < 4 ? (
          <button onClick={nextStep} disabled={isUploading} className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">ถัดไป</button>
        ) : (
          <button onClick={submitForm} disabled={isUploading || formData.uploadedFiles.filter(f=>f.status === 'success').length === 0} className="px-6 py-2 rounded-lg bg-green-600 text-white disabled:bg-gray-300 disabled:cursor-not-allowed">
            {isUploading ? 'กำลังสร้าง...' : 'สร้างเอกสาร'}
          </button>
        )}
      </div>
    </div>
  )
}