// src/components/work-request/CreateWorkRequestForm.tsx (แก้ไขตาม Workflow ใหม่)
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/useAuth';
import { TaskData } from '@/types/work-request';
import { Site, RFAFile } from '@/types/rfa';
import Spinner from '@/components/shared/Spinner';
import { FileText, Upload, X, Check, AlertTriangle, Send } from 'lucide-react';
import { Role, WR_CREATOR_ROLES } from '@/lib/config/workflow';
import { useNotification } from '@/lib/context/NotificationContext';
import { storage } from '@/lib/firebase/client';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

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
  uploadedData?: { fileName: string; fileUrl: string; filePath: string; size: number; contentType: string; fileSize: number; uploadedAt: string; uploadedBy: string; };
  error?: string;
}

const inputClassName = "w-full h-11 px-3 border rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all";

export default function CreateWorkRequestForm({ onClose, userProp }: { onClose: () => void; userProp?: AppUser; }) {
  const { firebaseUser } = useAuth();
  const { showNotification } = useNotification();

  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');

  const [taskName, setTaskName] = useState('');
  const [description, setDescription] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  // --- 👇 [แก้ไข] ---
  const [dueDate, setDueDate] = useState('');
  // --- 👆 [สิ้นสุดการแก้ไข] ---

  const [loadingSites, setLoadingSites] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const canCreate = userProp && WR_CREATOR_ROLES.includes(userProp.role);

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

  const uploadTempFile = (fileObj: UploadedFile) => {
    return new Promise<void>((resolve, reject) => {
      if (!firebaseUser?.uid) {
        reject(new Error('User ID not found for upload.'));
        return;
      }

      const timestamp = Date.now();
      const originalName = fileObj.file.name || "file";
      const tempPath = `temp/${firebaseUser.uid}/${timestamp}_${originalName}`;
      const storageRef = ref(storage, tempPath);

      const uploadTask = uploadBytesResumable(storageRef, fileObj.file, {
        contentType: fileObj.file.type || "application/octet-stream",
      });

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadedFiles(prev => prev.map(f => f.id === fileObj.id ? { ...f, progress, status: 'uploading' } : f));
        },
        (error) => {
          console.error("Storage upload error:", error);
          setUploadedFiles(prev => prev.map(f => f.id === fileObj.id ? { ...f, status: 'error', error: error.message } : f));
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
              uploadedBy: firebaseUser.email || 'Unknown User'
            };

            setUploadedFiles(prev => prev.map(f => f.id === fileObj.id ? { ...f, status: 'success', progress: 100, uploadedData } : f));
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
      id: `${file.name}-${Date.now()}`,
      file,
      status: 'pending',
      progress: 0,
    }));

    setUploadedFiles(prev => [...prev, ...newUploads]);

    newUploads.forEach(fileObj => {
      uploadTempFile(fileObj).catch(err => console.error("Upload failed for", fileObj.file.name, err));
    });

    event.target.value = '';
  };

  const removeFile = async (index: number) => {
    const fileToRemove = uploadedFiles[index];
    if (fileToRemove.uploadedData?.filePath) {
      try {
        const fileRef = ref(storage, fileToRemove.uploadedData.filePath);
        await deleteObject(fileRef);
      } catch (error) {
        console.error("Failed to delete temp file from storage:", error);
      }
    }
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!selectedSiteId) newErrors.site = 'กรุณาเลือกโครงการ';
    if (!taskName.trim()) newErrors.taskName = 'กรุณาใส่หัวข้องาน';
    // --- 👇 [แก้ไข] ตรวจสอบ dueDate แทน priority ---
    if (!dueDate) newErrors.dueDate = 'กรุณาเลือกวันที่กำหนดส่ง';
    // --- 👆 [สิ้นสุดการแก้ไข] ---
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

      // --- 👇 [แก้ไข] ปรับ Payload ที่จะส่งไป API ---
      const payload = {
        siteId: selectedSiteId,
        taskName,
        description,
        dueDate: dueDate, // ส่ง dueDate
        files: uploadedFiles.filter(f => f.status === 'success').map(f => f.uploadedData),
        // ไม่ต้องส่ง priority, planStartDate, taskData จาก Frontend แล้ว
      };
      // --- 👆 [สิ้นสุดการแก้ไข] ---

      const response = await fetch('/api/work-request/create', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'เกิดข้อผิดพลาด');

      showNotification('success', 'สร้างเอกสารสำเร็จ', `เอกสาร: ${result.documentNumber ? `${result.documentNumber} - ` : ''}${taskName}`);
      onClose();
    } catch (error) {
      showNotification('error', 'เกิดข้อผิดพลาด', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- 👇 [แก้ไข] ถ้าไม่ใช่ Site User ให้แสดงข้อความแจ้งเตือน ---
  if (!canCreate) {
    return (
      <div className="text-center p-8 bg-yellow-50 rounded-lg border border-yellow-300">
        <AlertTriangle className="mx-auto w-12 h-12 text-yellow-500 mb-4" />
        <h3 className="text-lg font-bold text-yellow-800">ไม่มีสิทธิ์สร้าง Work Request</h3>
        <p className="text-yellow-700 mt-2">
          เฉพาะ Project Engineer (PE) หรือ Owner Engineer (OE) เท่านั้นที่สามารถสร้างคำร้องขอได้
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 px-6 py-2 text-sm text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
        >
          ปิด
        </button>
      </div>
    )
  }
  // --- 👆 [สิ้นสุดการแก้ไข] ---


  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* --- 👇 [แก้ไข] ปรับ Layout และเปลี่ยน Priority เป็น Due Date --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">โครงการ <span className="text-red-500">*</span></label>
          <select value={selectedSiteId} onChange={(e) => setSelectedSiteId(e.target.value)} className={inputClassName} disabled={loadingSites}>
            <option value="">{loadingSites ? 'กำลังโหลด...' : '-- เลือกโครงการ --'}</option>
            {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
          {errors.site && <p className="text-red-600 text-sm mt-1">{errors.site}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">วันที่กำหนดส่ง (Due Date) <span className="text-red-500">*</span></label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClassName} />
          {errors.dueDate && <p className="text-red-600 text-sm mt-1">{errors.dueDate}</p>}
        </div>
      </div>
      {/* --- 👆 [สิ้นสุดการแก้ไข] --- */}

      {/* --- 👇 [แก้ไข] ลบเงื่อนไข isBimFlow ออกทั้งหมด --- */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          หัวข้องาน <span className="text-red-500">*</span>
        </label>
        <input type="text" value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder="เช่น ขอแก้ไขโมเดลโครงสร้างอาคาร A" className={inputClassName} />
        {errors.taskName && <p className="text-red-600 text-sm mt-1">{errors.taskName}</p>}
      </div>
      {/* --- 👆 [สิ้นสุดการแก้ไข] --- */}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">รายละเอียด <span className="text-gray-400 font-normal">(Optional)</span></label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="อธิบายรายละเอียดเพิ่มเติม (ถ้ามี)..." className="w-full p-3 border rounded-lg bg-white text-gray-900" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">แนบไฟล์ (ถ้ามี)</label>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
          <input type="file" multiple onChange={handleFileUpload} id="file-upload" className="hidden" />
          <label htmlFor="file-upload" className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center">
            <Upload size={18} className="mr-2" />
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
                  {fileObj.status === 'error' && (<span title={fileObj.error}><AlertTriangle className="w-4 h-4 text-red-500" /></span>)}
                  <button type="button" onClick={() => removeFile(i)} className="ml-3 text-gray-500 hover:text-red-600"><X size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-4 pt-4 border-t">
        <button type="button" onClick={onClose} className="px-6 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">ยกเลิก</button>
        <button type="submit" disabled={isSubmitting} className="flex items-center px-6 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300">
          {isSubmitting ? <Spinner className="w-5 h-5 mr-2" /> : <Send className="w-5 h-5 mr-2" />}
          {isSubmitting ? 'กำลังส่ง...' : 'ส่งคำขอ'}
        </button>
      </div>
    </form>
  );
}