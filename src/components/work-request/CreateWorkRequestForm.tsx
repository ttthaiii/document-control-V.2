'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/auth/useAuth';
import { WorkRequestPriority, TaskData } from '@/types/work-request';
import { Site, RFAFile } from '@/types/rfa';
import Spinner from '@/components/shared/Spinner';
import { FileText, Upload, X, Check, AlertTriangle, Send, Search, CheckCircle } from 'lucide-react';
import { Role, ROLES } from '@/lib/config/workflow';
import { useNotification } from '@/lib/context/NotificationContext';

// Interfaces
interface AppUser {
  id: string;
  email: string;
  role: Role;
  sites?: string[];
  status: 'ACTIVE' | 'DISABLED';
}
interface UploadedFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  uploadedData?: RFAFile;
  error?: string;
}

export default function CreateWorkRequestForm({ onClose, userProp }: { onClose: () => void; userProp?: AppUser; }) {
  const { firebaseUser } = useAuth();
  const { showNotification } = useNotification();

  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  
  const [taskName, setTaskName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<WorkRequestPriority>(WorkRequestPriority.NORMAL);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  
  const [loadingSites, setLoadingSites] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // --- States for BIM Flow ---
  const isBimFlow = userProp?.role === ROLES.BIM;
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTask, setSelectedTask] = useState<TaskData | null>(null);

  // --- Fetch Sites (used by both flows) ---
  useEffect(() => {
    const loadSites = async () => {
      if (!firebaseUser) return;
      setLoadingSites(true);
      try {
        const token = await firebaseUser.getIdToken();
        const response = await fetch('/api/sites', { headers: { 'Authorization': `Bearer ${token}` } });
        if (response.ok) {
          const data = await response.json();
          setSites(data.sites || []);
        } else {
          throw new Error('Failed to load sites');
        }
      } catch (error) {
        showNotification('error', 'เกิดข้อผิดพลาด', 'ไม่สามารถโหลดรายชื่อโครงการได้');
      } finally {
        setLoadingSites(false);
      }
    };
    loadSites();
  }, [firebaseUser, showNotification]);

  // --- Fetch Tasks for BIM Flow ---
  const handleSiteChangeForBim = async (siteId: string) => {
    setSelectedSiteId(siteId);
    setSelectedTask(null);
    setTasks([]);
    if (!siteId || !firebaseUser) return;

    const site = sites.find(s => s.id === siteId);
    if (!site) return;

    setTasksLoading(true);
    setTaskError(null);
    try {
        const token = await firebaseUser.getIdToken();
        const response = await fetch('/api/bim-tracking/work-request-tasks', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectName: site.name }),
        });
        const result = await response.json();
        if (result.success) {
          setTasks(result.tasks);
        } else {
          throw new Error(result.error || 'Failed to fetch tasks');
        }
    } catch (err) {
        setTaskError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
        setTasksLoading(false);
    }
  };

  const handleTaskSelect = (task: TaskData) => {
    setSelectedTask(task);
    setTaskName(task.taskName);
  };
  
  const filteredTasks = useMemo(() => {
    if (!searchTerm) return tasks;
    return tasks.filter(task => task.taskName.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [tasks, searchTerm]);

  // --- File Upload Functions ---
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

    const newUploads: UploadedFile[] = files.map(file => ({
      id: `${file.name}-${Date.now()}`,
      file,
      status: 'pending',
      progress: 0,
    }));

    setUploadedFiles(prev => [...prev, ...newUploads]);

    for (const fileObj of newUploads) {
      setUploadedFiles(prev => prev.map(f => f.id === fileObj.id ? { ...f, status: 'uploading' } : f));
      const result = await uploadTempFile(fileObj.file);
      setUploadedFiles(prev => prev.map(f => f.id === fileObj.id ? { ...f, ...result } : f));
    }
    event.target.value = '';
  };

  const removeFile = (index: number) => {
    const fileToRemove = uploadedFiles[index];
    // This assumes deleteTempFile exists and is implemented correctly
    if (fileToRemove.uploadedData?.filePath) {
      // deleteTempFile(fileToRemove.uploadedData.filePath);
    }
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };


  // --- Form Validation & Submission (unified) ---
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!selectedSiteId) newErrors.site = 'กรุณาเลือกโครงการ';
    if (isBimFlow) {
        if (!selectedTask) newErrors.task = 'กรุณาเลือก Task จาก BIM Tracking';
    }
    if (!taskName.trim()) newErrors.taskName = 'กรุณาใส่หัวข้องาน';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
        if (!firebaseUser) throw new Error('กรุณาล็อกอินก่อน');
        const token = await firebaseUser.getIdToken();

        const payload = {
            siteId: selectedSiteId,
            taskName,
            description,
            priority,
            files: uploadedFiles.filter(f => f.status === 'success').map(f => f.uploadedData),
            taskData: isBimFlow ? selectedTask : null,
        };

        const response = await fetch('/api/work-request/create', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'เกิดข้อผิดพลาด');

        showNotification('success', 'สร้าง Work Request สำเร็จ!', `เลขที่เอกสาร: ${result.documentNumber}`);
        onClose();
    } catch (error) {
        showNotification('error', 'เกิดข้อผิดพลาด', error instanceof Error ? error.message : 'Unknown error');
    } finally {
        setIsSubmitting(false);
    }
  };
  
  // --- Render Logic ---
  const renderBimTaskSelector = () => (
    <div className="space-y-6">
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">1. เลือกโครงการ</label>
            <select value={selectedSiteId} onChange={(e) => handleSiteChangeForBim(e.target.value)} className="w-full p-3 border rounded-lg bg-gray-50" disabled={loadingSites}>
                <option value="">{loadingSites ? 'กำลังโหลด...' : '-- เลือกโครงการ --'}</option>
                {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
        </div>
        
        {selectedSiteId && (
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">2. ค้นหาและเลือก Task <span className="text-red-500">*</span></label>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input type="text" placeholder="ค้นหาชื่องาน..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg" disabled={tasksLoading} />
                </div>
                {tasksLoading && <div className="text-center py-4"><Spinner /></div>}
                {taskError && <p className="text-red-500 text-center py-4">{taskError}</p>}
                {!tasksLoading && !taskError && (
                    <div className="mt-2 space-y-2 max-h-48 overflow-y-auto border rounded-lg bg-gray-50 p-2">
                        {filteredTasks.length > 0 ? filteredTasks.map((task: TaskData) => (
                            <div key={task.taskUid} onClick={() => handleTaskSelect(task)} className={`flex items-center justify-between p-3 text-sm rounded-md cursor-pointer ${selectedTask?.taskUid === task.taskUid ? 'bg-blue-100' : 'hover:bg-gray-100'}`}>
                                <span>{task.taskName}</span>
                                {selectedTask?.taskUid === task.taskUid && <CheckCircle className="w-5 h-5 text-blue-600" />}
                            </div>
                        )) : <p className="text-center text-gray-500 py-4">ไม่พบ Task ที่ว่าง (Category: "Work Request")</p>}
                    </div>
                )}
                {errors.task && <p className="text-red-600 text-sm mt-1">{errors.task}</p>}
            </div>
        )}
    </div>
  );

  const renderManualForm = () => (
    <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">โครงการ <span className="text-red-500">*</span></label>
                <select value={selectedSiteId} onChange={(e) => setSelectedSiteId(e.target.value)} className="w-full p-3 border rounded-lg" disabled={loadingSites}>
                    <option value="">{loadingSites ? 'กำลังโหลด...' : '-- เลือกโครงการ --'}</option>
                    {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
                </select>
                {errors.site && <p className="text-red-600 text-sm mt-1">{errors.site}</p>}
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ระดับความสำคัญ</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as WorkRequestPriority)} className="w-full p-3 border rounded-lg">
                    <option value={WorkRequestPriority.NORMAL}>ปกติ</option>
                    <option value={WorkRequestPriority.HIGH}>ด่วน</option>
                    <option value={WorkRequestPriority.URGENT}>ด่วนที่สุด</option>
                </select>
            </div>
        </div>
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หัวข้องาน <span className="text-red-500">*</span></label>
            <input type="text" value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder="เช่น ขอแก้ไขโมเดลโครงสร้างอาคาร A" className="w-full p-3 border rounded-lg" />
            {errors.taskName && <p className="text-red-600 text-sm mt-1">{errors.taskName}</p>}
        </div>
    </div>
  );

  const renderContent = () => {
    if (isBimFlow) {
      return renderBimTaskSelector();
    }
    return renderManualForm();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
        {renderContent()}

        {/* This part is shown for both flows, but only after site selection for BIM flow */}
        {((isBimFlow && selectedTask) || !isBimFlow) && (
            <div className="space-y-6 pt-6 border-t">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">หัวข้องาน <span className="text-red-500">*</span></label>
                    <input type="text" value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder="เช่น ขอแก้ไขโมเดลโครงสร้างอาคาร A" className="w-full p-3 border rounded-lg" disabled={isBimFlow} />
                    {errors.taskName && <p className="text-red-600 text-sm mt-1">{errors.taskName}</p>}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">รายละเอียด <span className="text-gray-400 font-normal">(Optional)</span></label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="อธิบายรายละเอียดเพิ่มเติม (ถ้ามี)..." className="w-full p-3 border rounded-lg" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">แนบไฟล์ (ถ้ามี)</label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
                        <input type="file" multiple onChange={handleFileUpload} id="file-upload" className="hidden"/>
                        <label htmlFor="file-upload" className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center">
                            <Upload size={18} className="mr-2"/>
                            คลิกเพื่อเลือกไฟล์
                        </label>
                    </div>
                    {uploadedFiles.length > 0 && (
                        <div className="mt-4 space-y-2">
                            {uploadedFiles.map((fileObj, i) => (
                            <div key={fileObj.id} className="flex items-center text-sm p-2 bg-gray-100 rounded">
                                <FileText className="w-4 h-4 mr-3 text-gray-500" />
                                <span className="flex-1 truncate">{fileObj.file.name}</span>
                                <div className="flex items-center ml-3">
                                    {fileObj.status === 'uploading' && <Spinner className="w-4 h-4" />}
                                    {fileObj.status === 'success' && <Check className="w-4 h-4 text-green-500" />}
                                    {fileObj.status === 'error' && ( <span title={fileObj.error}><AlertTriangle className="w-4 h-4 text-red-500" /></span> )}
                                    <button type="button" onClick={() => removeFile(i)} className="ml-3 text-gray-500 hover:text-red-600"><X size={16} /></button>
                                </div>
                            </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        )}

        <div className="flex justify-end gap-4 pt-4 border-t">
            <button type="button" onClick={onClose} className="px-6 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">ยกเลิก</button>
            <button type="submit" disabled={isSubmitting || (isBimFlow && !selectedTask)} className="flex items-center px-6 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300">
                {isSubmitting ? <Spinner className="w-5 h-5 mr-2" /> : <Send className="w-5 h-5 mr-2" />}
                {isSubmitting ? 'กำลังส่ง...' : 'ส่งคำขอ'}
            </button>
        </div>
    </form>
  );
}