'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/useAuth';
import { WorkRequestPriority } from '@/types/work-request';
import { Site, RFAFile } from '@/types/rfa';
import Spinner from '@/components/shared/Spinner';
import { FileText, Upload, X, Check, AlertTriangle, Send } from 'lucide-react';
import { Role } from '@/lib/config/workflow';

// Interface สำหรับ User ที่รับมาจาก props
interface AppUser {
  id: string;
  email: string;
  role: Role;
  sites?: string[];
  status: 'ACTIVE' | 'DISABLED';
}

// Interface สำหรับไฟล์ที่กำลังอัปโหลด
interface UploadedFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  uploadedData?: RFAFile;
  error?: string;
}

interface CreateWorkRequestFormProps {
  onClose: () => void;
  userProp?: AppUser;
}

export default function CreateWorkRequestForm({ onClose, userProp }: CreateWorkRequestFormProps) {
  const { firebaseUser } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>('');
  const [taskName, setTaskName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<WorkRequestPriority>(WorkRequestPriority.NORMAL);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
        setErrors(prev => ({ ...prev, form: 'ไม่สามารถโหลดรายชื่อโครงการได้' }));
      } finally {
        setLoading(false);
      }
    };
    loadSites();
  }, [firebaseUser]);
  
  // (โค้ดส่วน uploadTempFile, deleteTempFile, handleFileUpload, removeFile ไม่มีการเปลี่ยนแปลง)
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
    if (fileToRemove.uploadedData?.filePath) {
      deleteTempFile(fileToRemove.uploadedData.filePath);
    }
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };
  
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!selectedSite) newErrors.site = 'กรุณาเลือกโครงการ';
    if (!taskName.trim()) newErrors.taskName = 'กรุณาใส่หัวข้องาน';
    // ไม่มีการบังคับให้กรอก description อีกต่อไป
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- 👇 นี่คือส่วนที่แก้ไข ---
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setErrors({}); // Clear previous form-wide errors

    try {
      if (!firebaseUser) throw new Error('กรุณาล็อกอินก่อนส่งคำขอ');
      const token = await firebaseUser.getIdToken();

      const payload = {
        siteId: selectedSite,
        taskName,
        description,
        priority,
        files: uploadedFiles
          .filter(f => f.status === 'success' && f.uploadedData)
          .map(f => f.uploadedData),
      };

      const response = await fetch('/api/work-request/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.details || 'เกิดข้อผิดพลาดในการสร้าง Work Request');
      }

      alert(`สร้าง Work Request สำเร็จ!\nเลขที่เอกสาร: ${result.documentNumber}`);
      onClose();

    } catch (error) {
      console.error("Submit Error:", error);
      setErrors({ form: error instanceof Error ? error.message : 'เกิดข้อผิดพลาดที่ไม่รู้จัก' });
    } finally {
      setIsSubmitting(false);
    }
  };
  // --- 👆 สิ้นสุดส่วนที่แก้ไข ---

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* --- โค้ดส่วน JSX ของฟอร์มไม่มีการเปลี่ยนแปลง --- */}
       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="site" className="block text-sm font-medium text-gray-700 mb-1">โครงการ</label>
          <select
            id="site"
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          >
            <option value="">{loading ? 'กำลังโหลด...' : '-- เลือกโครงการ --'}</option>
            {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
          {errors.site && <p className="text-red-600 text-sm mt-1">{errors.site}</p>}
        </div>
        <div>
          <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1">ระดับความสำคัญ</label>
          <select
            id="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as WorkRequestPriority)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value={WorkRequestPriority.NORMAL}>ปกติ</option>
            <option value={WorkRequestPriority.HIGH}>ด่วน</option>
            <option value={WorkRequestPriority.URGENT}>ด่วนที่สุด</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="taskName" className="block text-sm font-medium text-gray-700 mb-1">หัวข้องาน (Task Name)</label>
        <input
          id="taskName"
          type="text"
          value={taskName}
          onChange={(e) => setTaskName(e.target.value)}
          placeholder="เช่น ขอแก้ไขโมเดลโครงสร้างอาคาร A"
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
        {errors.taskName && <p className="text-red-600 text-sm mt-1">{errors.taskName}</p>}
      </div>
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
          รายละเอียด <span className="text-gray-400 font-normal">(Optional)</span>
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="อธิบายรายละเอียดเพิ่มเติม (ถ้ามี)..."
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
        {/* ไม่ต้องมี errors.description อีกต่อไป */}
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
                    {fileObj.status === 'error' && (
                        <span title={fileObj.error}>
                           <AlertTriangle className="w-4 h-4 text-red-500" />
                        </span>
                    )}
                    <button type="button" onClick={() => removeFile(i)} className="ml-3 text-gray-500 hover:text-red-600"><X size={16} /></button>
                  </div>
              </div>
            ))}
          </div>
        )}
      </div>

       {/* --- เพิ่มส่วนแสดง Error ของฟอร์ม --- */}
      {errors.form && <p className="text-red-600 text-sm text-center bg-red-50 p-3 rounded-lg">{errors.form}</p>}

      <div className="flex justify-end gap-4 pt-4 border-t">
        <button
          type="button"
          onClick={onClose}
          className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
        >
          {isSubmitting ? <Spinner className="w-5 h-5 mr-2" /> : <Send className="w-5 h-5 mr-2" />}
          {isSubmitting ? 'กำลังส่ง...' : 'ส่งคำขอ'}
        </button>
      </div>
    </form>
  );
}