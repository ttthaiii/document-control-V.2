'use client';

import React, { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronRight, Save, Check, AlertCircle } from 'lucide-react';
import { db } from '@/lib/firebase/client';
import { collection, query, where, getDocs, documentId } from 'firebase/firestore';
// ✅ Import PERMISSION_DEFAULTS ได้แล้ว เพราะเรา export มาแล้ว
import { PERMISSION_GROUPS, PERMISSION_DEFAULTS } from '@/lib/config/permissions';
import Spinner from '@/components/shared/Spinner';
import { useAuth } from '@/lib/auth/useAuth';
import { useNotification } from '@/lib/context/NotificationContext';
import { Role } from '@/lib/config/workflow';

// ✅ ใช้ Interface ให้ตรงกับข้อมูลที่ส่งมาจากหน้า Users List
interface UserData {
  id: string;
  email: string;
  role: string;
  sites?: string[]; // sites อาจเป็น undefined ได้
}

interface UserPermissionModalProps {
  user: UserData; // ใช้ Type ที่ถูกต้อง
  onClose: () => void;
}

interface SiteWithOverrides {
  id: string;
  name: string;
}

export default function UserPermissionModal({ user, onClose }: UserPermissionModalProps) {
  const { firebaseUser } = useAuth();
  const { showNotification } = useNotification();
  
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<SiteWithOverrides[]>([]);
  const [expandedSiteId, setExpandedSiteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  
  const [pendingOverrides, setPendingOverrides] = useState<Record<string, any>>({});

  // 1. Fetch Data
  useEffect(() => {
    const fetchUserSites = async () => {
      // ✅ เพิ่มการตรวจสอบ null/undefined
      if (!user.sites || user.sites.length === 0) {
        setLoading(false);
        return;
      }

      try {
        const q = query(collection(db, 'sites'), where(documentId(), 'in', user.sites));
        const snapshot = await getDocs(q);
        
        const loadedSites: SiteWithOverrides[] = [];
        const initialOverrides: Record<string, any> = {};

        snapshot.forEach(doc => {
          const data = doc.data();
          loadedSites.push({ id: doc.id, name: data.name });
          initialOverrides[doc.id] = data.userOverrides?.[user.id] || {};
        });

        setSites(loadedSites);
        setPendingOverrides(initialOverrides);
        if (loadedSites.length > 0) setExpandedSiteId(loadedSites[0].id);

      } catch (error) {
        console.error("Error loading sites:", error);
        showNotification('error', 'โหลดข้อมูลไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    };

    fetchUserSites();
  }, [user]);

  const isDefaultAllowed = (fullKey: string) => {
    const allowedRoles = PERMISSION_DEFAULTS[fullKey] || [];
    return allowedRoles.includes(user.role as Role);
  };

  const isGranted = (siteId: string, fullKey: string) => {
    const [group, key] = fullKey.split('.');
    const overrideValue = pendingOverrides[siteId]?.[group]?.[key];
    if (overrideValue !== undefined) return overrideValue;
    return isDefaultAllowed(fullKey);
  };

  const handleCheckboxChange = (siteId: string, fullKey: string, checked: boolean) => {
    const [group, key] = fullKey.split('.');
    const defaultAllowed = isDefaultAllowed(fullKey);

    setPendingOverrides(prev => {
      const siteOverrides = { ...(prev[siteId] || {}) };
      const groupOverrides = { ...(siteOverrides[group] || {}) };

      if (checked === defaultAllowed) {
        delete groupOverrides[key];
      } else {
        groupOverrides[key] = checked;
      }

      if (Object.keys(groupOverrides).length === 0) {
        delete siteOverrides[group];
      } else {
        siteOverrides[group] = groupOverrides;
      }

      return { ...prev, [siteId]: siteOverrides };
    });
  };

  const getStatusLabel = (siteId: string, fullKey: string) => {
    const [group, key] = fullKey.split('.');
    const overrideVal = pendingOverrides[siteId]?.[group]?.[key];
    
    if (overrideVal === true) return <span className="text-xs text-green-600 font-medium ml-2">(อนุญาตพิเศษ)</span>;
    if (overrideVal === false) return <span className="text-xs text-red-500 font-medium ml-2">(ถูกระงับสิทธิ์)</span>;
    return <span className="text-xs text-gray-400 ml-2">(Default)</span>;
  };

  const handleSave = async (siteId: string) => {
    if (!firebaseUser) return;
    setSaving(true);
    try {
        const token = await firebaseUser.getIdToken();
        const overridesToSave = pendingOverrides[siteId] || {};

        const response = await fetch('/api/admin/users/permissions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                siteId,
                targetUserId: user.id,
                overrides: overridesToSave
            })
        });

        if (response.ok) {
            showNotification('success', 'บันทึกสำเร็จ', 'อัปเดตสิทธิ์เรียบร้อยแล้ว');
        } else {
            throw new Error('Failed to save');
        }
    } catch (error) {
        showNotification('error', 'บันทึกไม่สำเร็จ');
    } finally {
        setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        
        <div className="flex justify-between items-center p-5 border-b bg-white">
          <div>
            <h3 className="text-xl font-bold text-gray-800">จัดการสิทธิ์รายบุคคล</h3>
            <p className="text-sm text-gray-500 mt-1">
                ผู้ใช้: <span className="font-semibold text-blue-600">{user.email}</span>
                <span className="mx-2 text-gray-300">|</span> 
                Role: <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium text-xs">{user.role}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X size={24} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : sites.length === 0 ? (
            <div className="text-center py-12 text-gray-500 flex flex-col items-center">
                <AlertCircle className="w-10 h-10 text-gray-300 mb-3"/>
                <p>ผู้ใช้นี้ยังไม่ได้รับมอบหมายเข้าโครงการใดๆ</p>
                <p className="text-xs text-gray-400 mt-1">ไปที่เมนู Invite Users เพื่อเพิ่มโครงการ</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sites.map(site => {
                const isExpanded = expandedSiteId === site.id;
                return (
                  <div key={site.id} className={`bg-white border rounded-lg shadow-sm overflow-hidden transition-all duration-200 ${isExpanded ? 'ring-1 ring-blue-500 border-blue-500' : 'border-gray-200'}`}>
                    <div 
                        className={`flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 ${isExpanded ? 'bg-blue-50/30 border-b border-gray-100' : ''}`}
                        onClick={() => setExpandedSiteId(isExpanded ? null : site.id)}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                <ChevronDown className={isExpanded ? "text-blue-600" : "text-gray-400"} size={20} />
                            </div>
                            <span className={`font-semibold ${isExpanded ? 'text-blue-700' : 'text-gray-700'}`}>{site.name}</span>
                        </div>
                        {isExpanded && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleSave(site.id); }}
                                disabled={saving}
                                className="flex items-center px-4 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-300 transition-all shadow-sm"
                            >
                                {saving ? <Spinner className="w-4 h-4 mr-2 text-white"/> : <Save size={14} className="mr-2"/>}
                                บันทึก
                            </button>
                        )}
                    </div>

                    {isExpanded && (
                        <div className="p-5 animate-in slide-in-from-top-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                                {PERMISSION_GROUPS.map(group => (
                                    <div key={group.title}>
                                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 pb-1 border-b">
                                            {group.title}
                                        </h4>
                                        <div className="space-y-3">
                                            {group.permissions.map(perm => {
                                                const checked = isGranted(site.id, perm.key);
                                                return (
                                                    <label key={perm.key} className="flex items-center justify-between group cursor-pointer p-2 -mx-2 rounded hover:bg-gray-50 transition-colors">
                                                        <div className="flex-1 flex items-center">
                                                            <span className={`text-sm font-medium ${checked ? 'text-gray-900' : 'text-gray-500'}`}>{perm.label}</span>
                                                            {getStatusLabel(site.id, perm.key)}
                                                        </div>
                                                        
                                                        <div className="relative flex items-center">
                                                            <input
                                                                type="checkbox"
                                                                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer disabled:opacity-50"
                                                                checked={checked}
                                                                onChange={(e) => handleCheckboxChange(site.id, perm.key, e.target.checked)}
                                                            />
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}