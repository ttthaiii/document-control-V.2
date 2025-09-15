// lib/hooks/useGoogleSheets.ts (ไฟล์ใหม่)
import { useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth/useAuth';

interface TaskData {
  taskCategory: string;
  taskName: string;
  projectName: string;
  taskUid?: string;
}

interface SheetConfig {
  sheetId: string;
  sheetName?: string;
}

export const useGoogleSheets = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { firebaseUser } = useAuth();

  const makeAuthenticatedRequest = useCallback(async (endpoint: string, data: any) => {
    if (!firebaseUser) throw new Error('User not authenticated');
    
    const token = await firebaseUser.getIdToken();
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Request failed');
    }
    
    return result.data;
  }, [firebaseUser]);

  // ดึงรายชื่อโครงการ
  const getProjects = useCallback(async (config: SheetConfig): Promise<string[]> => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await makeAuthenticatedRequest('/api/google-sheets/projects', config);
      return data.projects;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [makeAuthenticatedRequest]);

  // ดึงหมวดงาน
  const getCategories = useCallback(async (
    config: SheetConfig, 
    projectName: string,
    rfaType: string // <-- เพิ่ม Parameter นี้
  ): Promise<string[]> => {
    setLoading(true);
    setError(null);
    
    try {
      // ✅ FIX: เพิ่ม rfaType เข้าไปใน body ที่จะส่งไป API
      const data = await makeAuthenticatedRequest('/api/google-sheets/categories', {
        ...config,
        projectName,
        rfaType
      });
      return data.categories;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [makeAuthenticatedRequest]);

  // ดึงชื่องาน
  const getTasks = useCallback(async (
    config: SheetConfig, 
    projectName: string, 
    category: string
  ): Promise<TaskData[]> => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await makeAuthenticatedRequest('/api/google-sheets/tasks', {
        ...config,
        projectName,
        category
      });
      return data.tasks;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [makeAuthenticatedRequest]);

  return {
    loading,
    error,
    getProjects,
    getCategories,
    getTasks,
    clearError: () => setError(null)
  };
};