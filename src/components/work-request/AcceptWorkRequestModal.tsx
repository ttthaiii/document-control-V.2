'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/auth/useAuth';
import { TaskData, WorkRequest } from '@/types/work-request';
import Spinner from '@/components/shared/Spinner';
import { X, Search, CheckCircle } from 'lucide-react';

interface AcceptWorkRequestModalProps {
  document: WorkRequest;
  onClose: () => void;
  onAccept: (selectedTask: TaskData) => void;
  isSubmitting: boolean;
}

export default function AcceptWorkRequestModal({ document, onClose, onAccept, isSubmitting }: AcceptWorkRequestModalProps) {
  const { firebaseUser } = useAuth();
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTask, setSelectedTask] = useState<TaskData | null>(null);

  useEffect(() => {
    const fetchTasks = async () => {
      if (!firebaseUser || !document.site?.name) return;
      setLoading(true);
      setError(null);
      try {
        const token = await firebaseUser.getIdToken();
        const response = await fetch('/api/bim-tracking/work-request-tasks', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ projectName: document.site.name }),
        });
        const result = await response.json();
        if (result.success) {
          setTasks(result.tasks);
        } else {
          throw new Error(result.error || 'Failed to fetch tasks');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
  }, [firebaseUser, document.site?.name]);

  const filteredTasks = useMemo(() => {
    if (!searchTerm) return tasks;
    return tasks.filter(task =>
      task.taskName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [tasks, searchTerm]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-bold text-gray-800">รับงานและเชื่อมต่อกับ BIM Tracking</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ค้นหาและเลือก Task ที่เกี่ยวข้องจาก BIM Tracking
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="ค้นหาชื่องาน..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full h-10 pl-10 pr-4 border rounded-lg bg-white text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {loading && <div className="text-center py-8"><Spinner /></div>}
          {error && <p className="text-red-500 text-center">{error}</p>}
          
          {!loading && !error && (
            <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg bg-gray-50 p-2">
              {filteredTasks.length > 0 ? (
                filteredTasks.map(task => (
                  <div
                    key={task.taskUid}
                    onClick={() => setSelectedTask(task)}
                    className={`flex items-center justify-between p-3 text-sm rounded-md cursor-pointer transition-colors ${
                      selectedTask?.taskUid === task.taskUid
                        ? 'bg-blue-100 border border-blue-300'
                        : 'hover:bg-gray-100'
                    }`}
                  >
                    <span>{task.taskName}</span>
                    {selectedTask?.taskUid === task.taskUid && (
                      <CheckCircle className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                ))
              ) : (
                <p className="text-center text-gray-500 py-4">ไม่พบ Task ที่ว่าง (Category: work_request)</p>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-4 p-4 border-t bg-gray-50">
          <button onClick={onClose} className="px-6 py-2 text-sm text-gray-700 bg-white border rounded-lg hover:bg-gray-100">
            ยกเลิก
          </button>
          <button
            onClick={() => selectedTask && onAccept(selectedTask)}
            disabled={!selectedTask || isSubmitting}
            className="px-6 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
          >
            {isSubmitting ? <Spinner className="w-5 h-5" /> : 'ยืนยันและรับงาน'}
          </button>
        </div>
      </div>
    </div>
  );
}