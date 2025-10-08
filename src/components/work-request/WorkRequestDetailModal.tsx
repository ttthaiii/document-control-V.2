'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/auth/useAuth';
import { WorkRequest, WorkRequestStatus, TaskData } from '@/types/work-request';
import Spinner from '@/components/shared/Spinner';
import { X, Paperclip, Link as LinkIcon, CheckCircle, Search, ThumbsUp } from 'lucide-react';
import { ROLES } from '@/lib/config/workflow';
import { useNotification } from '@/lib/context/NotificationContext';

// --- Helper Functions ---
const formatDate = (date: any) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const getStatusStyles = (status: WorkRequestStatus) => {
    switch (status) {
        case WorkRequestStatus.PENDING_BIM: return { text: 'รอ BIM รับงาน', color: 'bg-blue-100 text-blue-800' };
        case WorkRequestStatus.IN_PROGRESS: return { text: 'กำลังดำเนินการ', color: 'bg-yellow-100 text-yellow-800' };
        case WorkRequestStatus.PENDING_ACCEPTANCE: return { text: 'รอ Site ตรวจรับ', color: 'bg-purple-100 text-purple-800' };
        case WorkRequestStatus.REVISION_REQUESTED: return { text: 'ขอแก้ไข', color: 'bg-orange-100 text-orange-800' };
        case WorkRequestStatus.COMPLETED: return { text: 'เสร็จสิ้น', color: 'bg-green-100 text-green-800' };
        default: return { text: status, color: 'bg-gray-100 text-gray-800' };
    }
};

interface WorkRequestDetailModalProps {
  documentId: string | null;
  onClose: () => void;
  onUpdate: () => void;
}

export default function WorkRequestDetailModal({ documentId, onClose, onUpdate }: WorkRequestDetailModalProps) {
  const { user, firebaseUser } = useAuth();
  const { showNotification } = useNotification();

  const [document, setDocument] = useState<WorkRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // --- States for integrated action panel ---
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTask, setSelectedTask] = useState<TaskData | null>(null);

  const canAcceptWork = user?.role === ROLES.BIM && document?.status === WorkRequestStatus.PENDING_BIM;

  // Effect to fetch the main document
  useEffect(() => {
    const fetchDocument = async () => {
      if (!documentId || !firebaseUser) return;
      setLoading(true);
      try {
        const token = await firebaseUser.getIdToken();
        const response = await fetch(`/api/work-request/${documentId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const result = await response.json();
        if (result.success) setDocument(result.document);
        else throw new Error(result.error);
      } catch (error) {
        showNotification('error', 'เกิดข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลเอกสารได้');
        onClose();
      } finally {
        setLoading(false);
      }
    };
    fetchDocument();
  }, [documentId, firebaseUser, showNotification, onClose]);

  // Effect to fetch BIM Tracking tasks when the action panel is visible
  useEffect(() => {
    const fetchTasks = async () => {
      if (!canAcceptWork || !firebaseUser || !document?.site?.name) return;
      setTasksLoading(true);
      setTaskError(null);
      try {
        const token = await firebaseUser.getIdToken();
        const response = await fetch('/api/bim-tracking/work-request-tasks', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectName: document.site.name }),
        });
        const result = await response.json();
        if (result.success) setTasks(result.tasks);
        else throw new Error(result.error || 'Failed to fetch tasks');
      } catch (err) {
        setTaskError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setTasksLoading(false);
      }
    };
    fetchTasks();
  }, [canAcceptWork, firebaseUser, document?.site?.name]);

  const handleAcceptWork = async () => {
    if (!document || !firebaseUser || !selectedTask) return;
    setIsSubmitting(true);
    try {
      const token = await firebaseUser.getIdToken();
      const response = await fetch(`/api/work-request/${document.id}/update`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ACCEPT_WORK', payload: { taskData: selectedTask } }),
      });
      const result = await response.json();
      if (result.success) {
        showNotification('success', 'รับงานสำเร็จแล้ว', `สถานะถูกเปลี่ยนเป็น: ${getStatusStyles(result.newStatus).text}`);
        onUpdate();
        onClose();
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      showNotification('error', 'เกิดข้อผิดพลาด', error instanceof Error ? error.message : 'Failed to accept work');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const filteredTasks = useMemo(() => {
    if (!searchTerm) return tasks;
    return tasks.filter(task => task.taskName.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [tasks, searchTerm]);
  
  const handleTaskClick = (task: TaskData) => {
    // --- ✅ Logic to deselect task ---
    if (selectedTask?.taskUid === task.taskUid) {
      setSelectedTask(null);
    } else {
      setSelectedTask(task);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
        <Spinner className="w-12 h-12 text-white" />
      </div>
    );
  }
  
  if (!document) return null; // Should be handled by the error notification in useEffect

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-50 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-start p-4 border-b bg-white">
          <div>
            <h3 className="text-lg font-bold text-blue-600">{document.documentNumber}</h3>
            <h2 className="text-xl font-semibold text-gray-800">{document.taskName}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Document Info Panel */}
          <div className="p-4 bg-white rounded-lg border">
            <p><strong>รายละเอียด:</strong> {document.description || '-'}</p>
            {document.taskData && (
              <div className="mt-4 bg-blue-50 p-3 rounded-lg border border-blue-200 text-sm">
                <p className="font-semibold text-blue-800 flex items-center"><LinkIcon size={16} className="mr-2"/>Linked to BIM Tracking</p>
                <p><strong>Task:</strong> {document.taskData.taskName}</p>
              </div>
            )}
          </div>
          {/* File List Panel */}
          <div>
            <h4 className="text-md font-semibold mb-2 flex items-center text-slate-800">
              <Paperclip size={16} className="mr-2"/> ไฟล์แนบ
            </h4>
            {/* ... File list logic here ... */}
          </div>
        </div>
        
        {/* --- ✅ Refactored Action Panel --- */}
        {canAcceptWork && (
          <div className="p-6 border-t bg-white rounded-b-lg space-y-4">
            <h3 className="text-lg font-bold text-slate-800">ดำเนินการ (สำหรับ BIM)</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                เลือก Task จาก BIM Tracking เพื่อรับงาน <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text" placeholder="ค้นหาชื่องาน..."
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg"
                  disabled={tasksLoading}
                />
              </div>
            </div>
            
            {tasksLoading && <div className="text-center py-4"><Spinner /></div>}
            {taskError && <p className="text-red-500 text-center py-4">{taskError}</p>}
            
            {!tasksLoading && !taskError && (
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg bg-gray-50 p-2">
                {filteredTasks.length > 0 ? (
                  filteredTasks.map(task => (
                    <div
                      key={task.taskUid}
                      onClick={() => handleTaskClick(task)}
                      className={`flex items-center justify-between p-3 text-sm rounded-md cursor-pointer transition-colors ${
                        selectedTask?.taskUid === task.taskUid
                          ? 'bg-blue-100 border border-blue-300'
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      <span>{task.taskName}</span>
                      {selectedTask?.taskUid === task.taskUid && <CheckCircle className="w-5 h-5 text-blue-600" />}
                    </div>
                  ))
                ) : (
                  <p className="text-center text-gray-500 py-4">ไม่พบ Task ที่ว่าง (Category: "Work Request")</p>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleAcceptWork}
                disabled={!selectedTask || isSubmitting}
                className="flex items-center px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
              >
                {isSubmitting ? <Spinner className="w-5 h-5 mr-2" /> : <ThumbsUp size={16} className="mr-2" />}
                {isSubmitting ? 'กำลังรับงาน...' : 'ยืนยันและรับงาน'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}