'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { db } from '@/lib/firebase/client';
import { collection, getDocs } from 'firebase/firestore';
import Spinner from '@/components/shared/Spinner';
import { useAuth } from '@/lib/auth/useAuth';
import { useNotification } from '@/lib/context/NotificationContext';

// Reuse interface from page
interface UserData {
    id: string;
    email: string;
    name: string;
    role: string;
    sites?: string[];
}

interface Site {
    id: string;
    name: string;
}

interface UserSiteModalProps {
    user: UserData;
    onClose: () => void;
    onSave: () => void; // Trigger list refresh
}

export default function UserSiteModal({ user, onClose, onSave }: UserSiteModalProps) {
    const { firebaseUser } = useAuth();
    const { showNotification } = useNotification();

    const [loadingSites, setLoadingSites] = useState(true);
    const [saving, setSaving] = useState(false);
    const [availableSites, setAvailableSites] = useState<Site[]>([]);

    // Maintain local state of selected site IDs
    const [selectedSites, setSelectedSites] = useState<string[]>(user.sites || []);

    useEffect(() => {
        const fetchSites = async () => {
            try {
                // ดึงโครงการทั้งหมดมาจาก 'categories' หรือ 'sites'
                // หมายเหตุ: ตาม Architecture ล่าสุดคือ 'sites' -> getDocs จาก /api/sites หรือ firebase/client ตรงๆ
                const sitesRef = collection(db, 'sites');
                const snapshot = await getDocs(sitesRef);

                const loaded: Site[] = [];
                snapshot.forEach(doc => {
                    loaded.push({ id: doc.id, name: doc.data().name });
                });
                setAvailableSites(loaded);
            } catch (error) {
                console.error("Error fetching sites:", error);
                showNotification('error', 'โหลดรายชื่อโครงการไม่สำเร็จ');
            } finally {
                setLoadingSites(false);
            }
        };
        fetchSites();
    }, []);

    const handleCheckboxChange = (siteId: string, isChecked: boolean) => {
        setSelectedSites(prev =>
            isChecked ? [...prev, siteId] : prev.filter(id => id !== siteId)
        );
    };

    const submitSave = async () => {
        if (!firebaseUser) return;
        setSaving(true);
        try {
            const token = await firebaseUser.getIdToken();
            const response = await fetch('/api/admin/users/sites', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    targetUserId: user.id,
                    sites: selectedSites
                })
            });

            if (!response.ok) {
                throw new Error('Failed to update sites');
            }

            showNotification('success', 'บันทึกข้อมูลโครงการสำเร็จ');
            onSave(); // trigger refresh and close
            onClose();
        } catch (error) {
            showNotification('error', 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">

                <div className="flex justify-between items-center p-5 border-b bg-white">
                    <div>
                        <h3 className="text-xl font-bold text-gray-800">จัดการโครงการ 🏢</h3>
                        <p className="text-sm text-gray-500 mt-1">
                            ผู้ใช้: <span className="font-semibold text-blue-600">{user.email}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <X size={24} className="text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                    {loadingSites ? (
                        <div className="flex justify-center py-8"><Spinner /></div>
                    ) : availableSites.length === 0 ? (
                        <div className="text-center py-6 text-gray-500 flex flex-col items-center">
                            <AlertCircle className="w-8 h-8 text-gray-300 mb-2" />
                            <p className="text-sm">ยังไม่มีโครงการในระบบ</p>
                        </div>
                    ) : (
                        <div>
                            <p className="text-sm text-gray-700 font-medium mb-3">เลือกโครงการที่ต้องการให้เข้าใช้งาน ({selectedSites.length} เลือกแล้ว):</p>
                            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2">
                                {availableSites.map(site => (
                                    <label
                                        key={site.id}
                                        className={`flex items-center p-3 rounded-lg border cursor-pointer hover:bg-blue-50 transition-colors
                            ${selectedSites.includes(site.id) ? 'border-blue-500 bg-blue-50/50' : 'bg-white'}
                        `}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedSites.includes(site.id)}
                                            onChange={(e) => handleCheckboxChange(site.id, e.target.checked)}
                                            className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-3"
                                        />
                                        <span className={`font-medium ${selectedSites.includes(site.id) ? 'text-blue-700' : 'text-gray-700'}`}>
                                            {site.name}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t bg-white flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-medium text-sm transition-colors"
                        disabled={saving}
                    >
                        ยกเลิก
                    </button>
                    <button
                        onClick={submitSave}
                        disabled={saving || loadingSites}
                        className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-sm disabled:bg-blue-300 transition-colors"
                    >
                        {saving ? <Spinner className="w-4 h-4 mr-2 border-white" /> : <Save size={16} className="mr-2" />}
                        บันทึกข้อมูล
                    </button>
                </div>

            </div>
        </div>
    );
}
