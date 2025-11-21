// src/lib/hooks/usePermission.ts
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth/useAuth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { Site } from '@/types/index'; // ใช้ Site interface ตัวใหม่ที่มี userOverrides
import { Role, ROLES } from '@/lib/config/workflow';

const DEFAULT_PERMISSIONS = {
  RFA: {
    create_shop: [ROLES.BIM, ROLES.ME, ROLES.SN, ROLES.ADMIN],
    create_gen: [ROLES.BIM, ROLES.SITE_ADMIN, ROLES.ADMIN, ROLES.ME, ROLES.SN],
    create_mat: [ROLES.SITE_ADMIN, ROLES.ADMIN, ROLES.OE, ROLES.PE],
    review: [ROLES.SITE_ADMIN, ROLES.ADMIN_SITE_2, ROLES.OE, ROLES.PE, ROLES.ADMIN],
    approve: [ROLES.CM, ROLES.PD, ROLES.ADMIN]
  },
  WORK_REQUEST: {
    create: [ROLES.PE, ROLES.OE, ROLES.ADMIN],
    approve_draft: [ROLES.PD, ROLES.PM, ROLES.ADMIN],
    execute: [ROLES.BIM],
    inspect: [ROLES.SITE_ADMIN, ROLES.ADMIN_SITE_2, ROLES.OE, ROLES.PE, ROLES.ADMIN]
  }
};

export function usePermission(siteId?: string | null) {
  const { user } = useAuth();
  // ✅ แก้ไข 1: เปลี่ยนจากเก็บ roleSettings เป็นเก็บ siteConfig (ทั้งก้อน)
  const [siteConfig, setSiteConfig] = useState<Site | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!siteId || !user) {
        setSiteConfig(null);
        return;
    }

    const fetchPermissions = async () => {
      setLoading(true);
      try {
        const cached = sessionStorage.getItem(`site_config_${siteId}`); // เปลี่ยน key cache ให้สื่อความหมาย
        if (cached) {
            setSiteConfig(JSON.parse(cached));
            setLoading(false);
            return;
        }

        const siteRef = doc(db, 'sites', siteId);
        const siteSnap = await getDoc(siteRef);
        
        if (siteSnap.exists()) {
          const data = siteSnap.data() as Site;
          // ✅ แก้ไข 2: เก็บข้อมูล Site ทั้งหมด (รวม roleSettings และ userOverrides)
          setSiteConfig(data);
          sessionStorage.setItem(`site_config_${siteId}`, JSON.stringify(data));
        }
      } catch (error) {
        console.error("Error fetching site permissions:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [siteId, user]);

  const can = useCallback((module: 'RFA' | 'WORK_REQUEST', action: string): boolean => {
    if (!user) return false;
    if (user.role === ROLES.ADMIN) return true;

    // 📌 1. เช็ค Override (สิทธิ์รายบุคคล) ก่อน
    // ถ้ามีการกำหนดค่า true/false ไว้ ให้ใช้ค่านั้นทันที
    if (siteConfig?.userOverrides?.[user.id]?.[module]?.[action] !== undefined) {
        return siteConfig.userOverrides[user.id][module][action];
    }

    let allowedRoles: Role[] = [];
    
    // 📌 2. เช็ค Role (สิทธิ์ตามตำแหน่ง)
    // ดึงจาก DB
    if (siteConfig?.roleSettings?.[module]) {
        const moduleSettings = siteConfig.roleSettings[module] as any;
        if (moduleSettings?.[action]) {
            allowedRoles = moduleSettings[action];
        }
    }

    // 📌 3. Fallback (ค่าเริ่มต้นถ้าไม่มีใน DB)
    if (allowedRoles.length === 0) {
         const defaultModule = DEFAULT_PERMISSIONS[module] as any;
         allowedRoles = defaultModule?.[action] || [];
    }

    return allowedRoles.includes(user.role);
  }, [user, siteConfig]); // Dependency เป็น siteConfig

  return { can, loading };
}