// src/components/admin/UserPermissionModal.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, Check, AlertCircle, ChevronDown, ChevronRight, Building2 } from 'lucide-react';
import { db } from '@/lib/firebase/client';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '@/lib/auth/useAuth';
import Spinner from '@/components/shared/Spinner';
import { useNotification } from '@/lib/context/NotificationContext';
import { ROLES } from '@/lib/config/workflow';

// ✅ 1. เพิ่ม sites?: string[] ใน Interface
interface User { 
    id: string; 
    email: string; 
    role: string; 
    sites?: string[]; // <-- เพิ่มตรงนี้
}
interface Site { id: string; name: string; userOverrides?: Record<string, any>; roleSettings?: any; }
interface UserPermissionModalProps { isOpen: boolean; onClose: () => void; targetUser: User; }

const DEFAULT_PERMISSIONS: any = {
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

const ACTIONS_CONFIG = {
    RFA: [
        { key: 'create_shop', label: 'สร้าง Shop' },
        { key: 'create_gen', label: 'สร้าง General' },
        { key: 'create_mat', label: 'สร้าง Material' },
        { key: 'review', label: 'ตรวจสอบ (Review)' },
        { key: 'approve', label: 'อนุมัติ (Approve)' },
    ],
    WORK_REQUEST: [
        { key: 'create', label: 'สร้างใบคำขอ' },
        { key: 'approve_draft', label: 'อนุมัติใบคำขอ' },
        { key: 'execute', label: 'รับ/ส่งงาน (BIM)' },
        { key: 'inspect', label: 'ตรวจรับงาน (Site)' },
    ]
};

export default function UserPermissionModal({ isOpen, onClose, targetUser }: UserPermissionModalProps) {
    const { firebaseUser } = useAuth();
    const { showNotification } = useNotification();
    
    const [sites, setSites] = useState<Site[]>([]);
    const [loadingData, setLoadingData] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [allOverrides, setAllOverrides] = useState<Record<string, any>>({});
    const [expandedSites, setExpandedSites] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (!isOpen || !firebaseUser) return;

        const fetchData = async () => {
            setLoadingData(true);
            try {
                const token = await firebaseUser.getIdToken();
                
                const sitesRes = await fetch('/api/sites', { headers: { 'Authorization': `Bearer ${token}` } });
                const sitesData = await sitesRes.json();
                const sitesList: Site[] = sitesData.sites || [];
                setSites(sitesList);

                const overridesBuffer: Record<string, any> = {};
                const expandBuffer: Record<string, boolean> = {};

                await Promise.all(sitesList.map(async (site, index) => {
                    // ✅ เพิ่ม Logic: ดึง Override เฉพาะ Site ที่ User นี้มีสิทธิ์อยู่ (เพื่อ Performance)
                    // แต่จริงๆ ดึงหมดก็ได้เพราะเราจะ Filter ตอน render อยู่ดี
                    if (targetUser.sites?.includes(site.id) && Object.keys(expandBuffer).length === 0) {
                        expandBuffer[site.id] = true; // เปิด Accordion แรกที่ User มีสิทธิ์
                    }
                    
                    const siteRef = doc(db, 'sites', site.id);
                    const siteSnap = await getDoc(siteRef);
                    if (siteSnap.exists()) {
                        const data = siteSnap.data();
                        overridesBuffer[site.id] = data.userOverrides?.[targetUser.id] || {};
                    }
                }));

                setAllOverrides(overridesBuffer);
                setExpandedSites(expandBuffer);

            } catch (error) {
                console.error("Failed to load data", error);
                showNotification('error', 'เกิดข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้');
            } finally {
                setLoadingData(false);
            }
        };

        fetchData();
    }, [isOpen, firebaseUser, targetUser.id, targetUser.sites, showNotification]); // เพิ่ม dependency

    const toggleSite = (siteId: string) => {
        setExpandedSites(prev => ({ ...prev, [siteId]: !prev[siteId] }));
    };

    const isAllowedByRole = (site: Site, module: string, action: string) => {
        const role = targetUser.role;
        if (role === 'Admin') return true;

        if (site.roleSettings && site.roleSettings[module as keyof typeof site.roleSettings]) {
             // @ts-ignore
             const allowedRoles = site.roleSettings[module][action] as string[];
             if (allowedRoles) return allowedRoles.includes(role);
        }

        const defaultRoles = DEFAULT_PERMISSIONS[module]?.[action] as string[];
        return defaultRoles ? defaultRoles.includes(role) : false;
    };

    const handleCheckboxClick = (siteId: string, module: string, action: string, currentOverride: boolean | undefined, baseAllowed: boolean) => {
        setAllOverrides(prev => {
            const siteOverrides = { ...(prev[siteId] || {}) };
            const moduleOverrides = { ...(siteOverrides[module] || {}) };

            let newValue: boolean | undefined;

            if (currentOverride === undefined) {
                newValue = !baseAllowed;
            } else {
                newValue = undefined; 
            }

            if (newValue === undefined) {
                delete moduleOverrides[action];
                if (Object.keys(moduleOverrides).length === 0) delete siteOverrides[module];
            } else {
                moduleOverrides[action] = newValue;
                siteOverrides[module] = moduleOverrides;
            }
            
            return { ...prev, [siteId]: siteOverrides };
        });
    };

    const handleSaveAll = async () => {
        setIsSaving(true);
        try {
            const token = await firebaseUser?.getIdToken();
            
            const promises = Object.entries(allOverrides).map(async ([siteId, overrides]) => {
                return fetch('/api/admin/permissions/override', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        siteId,
                        targetUserId: targetUser.id,
                        overrides 
                    })
                });
            });

            await Promise.all(promises);

            showNotification('success', 'บันทึกสำเร็จ', 'อัปเดตสิทธิ์เรียบร้อยแล้ว');
            
            Object.keys(allOverrides).forEach(siteId => {
                sessionStorage.removeItem(`site_config_${siteId}`);
            });
            
            onClose();

        } catch (error) {
            showNotification('error', 'บันทึกไม่สำเร็จ', 'เกิดข้อผิดพลาดในการบันทึก');
        } finally {
            setIsSaving(false);
        }
    };

    // ✅ 2. กรองเฉพาะ Site ที่ User มีสิทธิ์
    const userAssignedSites = sites.filter(site => 
        targetUser.sites?.includes(site.id)
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[80] flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-5 border-b bg-gray-50 rounded-t-lg">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">จัดการสิทธิ์: {targetUser.email}</h3>
                        <p className="text-sm text-gray-500 mt-1">Default Role: <span className="font-semibold text-blue-600">{targetUser.role}</span></p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X /></button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto flex-1 bg-gray-100">
                    {loadingData ? (
                        <div className="flex justify-center items-center h-64"><Spinner /></div>
                    ) : (
                        <div className="space-y-4">
                            {/* ✅ 3. ใช้ userAssignedSites แทน sites */}
                            {userAssignedSites.length > 0 ? (
                                userAssignedSites.map(site => {
                                    const isExpanded = expandedSites[site.id];
                                    return (
                                        <div key={site.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                                            <div 
                                                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                                                onClick={() => toggleSite(site.id)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Building2 className="text-gray-400" size={20} />
                                                    <span className="font-semibold text-gray-800">{site.name}</span>
                                                </div>
                                                {isExpanded ? <ChevronDown size={20} className="text-gray-400" /> : <ChevronRight size={20} className="text-gray-400" />}
                                            </div>

                                            {isExpanded && (
                                                <div className="p-4 border-t bg-white animate-in slide-in-from-top-2">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                        
                                                        {/* RFA Section */}
                                                        <div>
                                                            <h4 className="text-sm font-bold text-blue-600 mb-3 uppercase tracking-wider flex items-center">
                                                                <span className="w-2 h-2 bg-blue-600 rounded-full mr-2"></span> RFA Documents
                                                            </h4>
                                                            <div className="space-y-2">
                                                                {ACTIONS_CONFIG.RFA.map(act => (
                                                                    <PermissionToggle 
                                                                        key={act.key}
                                                                        label={act.label}
                                                                        module="RFA"
                                                                        action={act.key}
                                                                        site={site}
                                                                        isAllowedByRole={isAllowedByRole(site, 'RFA', act.key)}
                                                                        override={allOverrides[site.id]?.['RFA']?.[act.key]}
                                                                        onToggle={(mod: string, act: string, ov: boolean | undefined, base: boolean) => handleCheckboxClick(site.id, mod, act, ov, base)}
                                                                    />
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Work Request Section */}
                                                        <div>
                                                            <h4 className="text-sm font-bold text-orange-600 mb-3 uppercase tracking-wider flex items-center">
                                                                <span className="w-2 h-2 bg-orange-600 rounded-full mr-2"></span> Work Request
                                                            </h4>
                                                            <div className="space-y-2">
                                                                {ACTIONS_CONFIG.WORK_REQUEST.map(act => (
                                                                    <PermissionToggle 
                                                                        key={act.key}
                                                                        label={act.label}
                                                                        module="WORK_REQUEST"
                                                                        action={act.key}
                                                                        site={site}
                                                                        isAllowedByRole={isAllowedByRole(site, 'WORK_REQUEST', act.key)}
                                                                        override={allOverrides[site.id]?.['WORK_REQUEST']?.[act.key]}
                                                                        onToggle={(mod: string, act: string, ov: boolean | undefined, base: boolean) => handleCheckboxClick(site.id, mod, act, ov, base)}
                                                                    />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-center p-10 border-2 border-dashed rounded-lg text-gray-400 bg-white">
                                    <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
                                    ผู้ใช้นี้ไม่ได้เป็นสมาชิกในโครงการใด
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-5 border-t bg-white rounded-b-lg flex justify-end gap-3 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                    <div className="mr-auto flex items-center gap-4 text-xs text-gray-500">
                        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-gray-200 border border-gray-400"></div> สิทธิ์จากตำแหน่ง</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-100 border border-green-500"></div> สิทธิ์พิเศษ (เพิ่ม)</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-50 border border-red-400"></div> ถูกระงับสิทธิ์</div>
                    </div>
                    <button onClick={onClose} className="px-6 py-2 text-gray-700 bg-white border rounded-lg hover:bg-gray-100">ปิด</button>
                    <button 
                        onClick={handleSaveAll} 
                        disabled={isSaving}
                        className="flex items-center px-8 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed shadow-md"
                    >
                        {isSaving ? <Spinner className="w-4 h-4 mr-2 text-white" /> : <Save size={18} className="mr-2" />}
                        บันทึกทั้งหมด
                    </button>
                </div>
            </div>
        </div>
    );
}

interface PermissionToggleProps {
    label: string;
    module: string;
    action: string;
    site: Site;
    isAllowedByRole: boolean;
    override: boolean | undefined;
    onToggle: (module: string, action: string, override: boolean | undefined, baseAllowed: boolean) => void;
}

function PermissionToggle({ label, module, action, site, isAllowedByRole, override, onToggle }: PermissionToggleProps) {
    
    const isEffectiveAllowed = override !== undefined ? override : isAllowedByRole;

    let containerClass = "bg-white border-gray-200 hover:border-gray-300";
    let indicatorClass = "bg-gray-200 border-gray-400"; 
    let textClass = "text-gray-600";

    if (override === true) {
        containerClass = "bg-green-50 border-green-300";
        indicatorClass = "bg-green-500 border-green-600 text-white";
        textClass = "text-green-800 font-medium";
    } else if (override === false) {
        containerClass = "bg-red-50 border-red-300";
        indicatorClass = "bg-white border-red-400";
        textClass = "text-red-800 line-through decoration-red-400";
    } else if (isAllowedByRole) {
        containerClass = "bg-gray-50 border-gray-300";
        indicatorClass = "bg-gray-400 border-gray-500 text-white";
        textClass = "text-gray-800";
    }

    return (
        <div 
            onClick={() => onToggle(module, action, override, isAllowedByRole)}
            className={`flex items-center justify-between p-3 rounded-md border cursor-pointer transition-all duration-200 ${containerClass}`}
        >
            <span className={`text-sm ${textClass}`}>{label}</span>
            
            <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${indicatorClass}`}>
                {isEffectiveAllowed && <Check size={14} strokeWidth={3} />}
            </div>
        </div>
    );
}