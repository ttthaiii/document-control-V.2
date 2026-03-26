// src/lib/hooks/useLogActivity.ts
// Client-side hook สำหรับ log VIEW_DETAIL, PREVIEW_FILE, DOWNLOAD_FILE
// ส่งผ่าน POST /api/activity-logs เพื่อให้ server เป็นคนเขียน log (ปลอดภัยกว่า write ตรง)

import { useCallback } from 'react';
import { auth } from '@/lib/firebase/client';
import { LogAction, ResourceType } from '@/types/activity-log';

interface ClientLogParams {
  action: LogAction;
  resourceType?: ResourceType;
  resourceId?: string;
  resourceName?: string;
  description?: string;
  siteId?: string;
  siteName?: string;
  metadata?: Record<string, any>;
}

export function useLogActivity() {
  const logActivity = useCallback(async (params: ClientLogParams) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      // Fire-and-forget: ไม่รอ response เพื่อไม่บล็อก UX
      fetch('/api/activity-logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(params),
      }).catch(err => console.warn('[useLogActivity] Log failed:', err));
    } catch (err) {
      // Silently fail — log ไม่ควรทำให้ app พัง
      console.warn('[useLogActivity] Error:', err);
    }
  }, []);

  return { logActivity };
}
