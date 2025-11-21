// src/components/work-request/CreateWorkRequestForm.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/useAuth';
import { Site, RFAFile } from '@/types/rfa';
import Spinner from '@/components/shared/Spinner';
import { FileText, Upload, X, Check, AlertTriangle, Send, Loader2 } from 'lucide-react';
import { Role } from '@/lib/config/workflow';
import { useNotification } from '@/lib/context/NotificationContext';
import { usePermission } from '@/lib/hooks/usePermission';

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
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [dueDate, setDueDate] = useState('');

  const [loadingSites, setLoadingSites] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // เรียกใช้ Hook เช็คสิทธิ์
  const { can, loading: checkingPermission } = usePermission(selectedSiteId);

  // โหลดรายชื่อโครงการ
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

  // ฟังก์ชันอัปโหลดไฟล์
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
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!selectedSiteId) newErrors.site = 'กรุณาเลือกโครงการ';
    if (!taskName.trim()) newErrors.taskName = 'กรุณาใส่หัวข้องาน';
    if (!dueDate) newErrors.dueDate = 'กรุณาเลือกวันที่กำหนดส่ง';
    
    if (selectedSiteId && !checkingPermission && !can('WORK_REQUEST', 'create')) {
        newErrors.site = 'คุณไม่มีสิทธิ์สร้างงานในโครงการนี้';
    }

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
            dueDate: dueDate,
            files: uploadedFiles.filter(f => f.status === 'success').map(f => f.uploadedData),
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

  // Error State
  if (selectedSiteId && !checkingPermission && !can('WORK_REQUEST', 'create')) {
    return (
        <div className="text-center p-8 bg-yellow-50 rounded-lg border border-yellow-300">
            <AlertTriangle className="mx-auto w-12 h-12 text-yellow-500 mb-4" />
            <h3 className="text-lg font-bold text-yellow-800">ไม่มีสิทธิ์สร้าง Work Request ในโครงการนี้</h3>
            <p className="text-yellow-700 mt-2">
                สิทธิ์ของคุณ ({userProp?.role}) ไม่ได้รับอนุญาตให้สร้างคำร้องขอในโครงการที่เลือก
            </p>
            <button
                type="button"
                onClick={() => {
                    setSelectedSiteId(''); 
                    setErrors({});
                }}
                className="mt-6 px-6 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100"
            >
                เลือกโครงการอื่น
            </button>
        </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">โครงการ <span className="text-red-500">*</span></label>
                <div className="relative">
                    <select 
                        value={selectedSiteId} 
                        onChange={(e) => setSelectedSiteId(e.target.value)} 
                        className="w-full p-3 border rounded-lg appearance-none" 
                        disabled={loadingSites}
                    >
                        <option value="">{loadingSites ? 'กำลังโหลด...' : '-- เลือกโครงการ --'}</option>
                        {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
                    </select>
                    {selectedSiteId && checkingPermission && (
                         <div className="absolute right-8 top-3">
                             <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                         </div>
                    )}
                </div>
                {errors.site && <p className="text-red-600 text-sm mt-1">{errors.site}</p>}
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">วันที่กำหนดส่ง (Due Date) <span className="text-red-500">*</span></label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full p-3 border rounded-lg" />
                {errors.dueDate && <p className="text-red-600 text-sm mt-1">{errors.dueDate}</p>}
            </div>
        </div>

        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              หัวข้องาน <span className="text-red-500">*</span>
            </label>
            <input type="text" value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder="เช่น ขอแก้ไขโมเดลโครงสร้างอาคาร A" className="w-full p-3 border rounded-lg" />
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

        <div className="flex justify-end gap-4 pt-4 border-t">
            <button type="button" onClick={onClose} className="px-6 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">ยกเลิก</button>
            
            {/* ✅ แก้ไขจุดที่ Error: ใช้ !!selectedSiteId เพื่อแปลงเป็น boolean */}
            <button 
                type="submit" 
                disabled={isSubmitting || (!!selectedSiteId && checkingPermission)} 
                className="flex items-center px-6 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
            >
                {isSubmitting ? <Spinner className="w-5 h-5 mr-2" /> : <Send className="w-5 h-5 mr-2" />}
                {isSubmitting ? 'กำลังส่ง...' : 'ส่งคำขอ'}
            </button>
        </div>
    </form>
  );
}