// src/app/dashboard/work-request/page.tsx (โค้ดฉบับสมบูรณ์)
'use client';

import { useState, useEffect, Suspense, useMemo } from 'react'; // v 1. เพิ่ม useMemo
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/useAuth';
import { AuthGuard } from '@/lib/components/shared/AuthGuard';
import WorkRequestListTable from '@/components/work-request/WorkRequestListTable';
import WorkRequestDetailModal from '@/components/work-request/WorkRequestDetailModal';
import CreateWorkRequestForm from '@/components/work-request/CreateWorkRequestForm';
import { WorkRequest, WorkRequestStatus } from '@/types/work-request';
import { Plus, RefreshCw } from 'lucide-react';
import { ROLES, REVIEWER_ROLES } from '@/lib/config/workflow';

import { db } from '@/lib/firebase/client';
import { collection, query, where, onSnapshot, orderBy, DocumentData } from 'firebase/firestore';

interface ApiSite {
  id: string;
  name: string;
}

function WorkRequestDashboardContent() {
    const { user, firebaseUser } = useAuth();
    const router = useRouter();
    // v 2. แยก State สำหรับเก็บข้อมูลเอกสารดิบ และข้อมูล Site
    const [allDocuments, setAllDocuments] = useState<WorkRequest[]>([]);
    const [sites, setSites] = useState<ApiSite[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // v 3. สร้าง useEffect แยกสำหรับดึงข้อมูล Site แค่ครั้งเดียว
    useEffect(() => {
        const fetchSites = async () => {
            if (!firebaseUser) return;
            try {
                const token = await firebaseUser.getIdToken();
                const response = await fetch('/api/sites', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();
                if (data.success) {
                    setSites(data.sites || []);
                }
            } catch (error) {
                console.error("Sidebar: Failed to fetch sites", error);
            }
        };
        fetchSites();
    }, [firebaseUser]);

    // v 4. useEffect สำหรับ onSnapshot จะทำงานแค่ดึงข้อมูล Work Request เท่านั้น
    useEffect(() => {
        if (!firebaseUser || !user?.sites || user.sites.length === 0) {
            setLoading(false);
            return;
        }

        setLoading(true);

        const q = query(
            collection(db, 'workRequests'),
            where('siteId', 'in', user.sites),
            orderBy('updatedAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const documentsFromDb: WorkRequest[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data() as DocumentData;
                documentsFromDb.push({
                    id: doc.id,
                    documentNumber: data.documentNumber || '',
                    runningNumber: data.runningNumber || '',
                    taskName: data.taskName || '',
                    description: data.description || '',
                    status: data.status as WorkRequestStatus,
                    createdAt: data.createdAt,
                    updatedAt: data.updatedAt,
                    createdBy: data.createdBy || '',
                    assignedTo: data.assignedTo || undefined,
                    planStartDate: data.planStartDate,
                    dueDate: data.dueDate,
                    taskData: data.taskData || null,
                    revisionNumber: data.revisionNumber || 0,
                    isLatest: data.isLatest || false,
                    parentWorkRequestId: data.parentWorkRequestId || undefined,
                    files: data.files || [],
                    workflow: data.workflow || [],
                    usersInfo: data.usersInfo || {},
                    site: { id: data.siteId, name: '...' }, // ใช้ชื่อชั่วคราว
                });
            });

            setAllDocuments(documentsFromDb);
            setLoading(false); // <--- setLoading(false) ทันที ทำให้ Spinner หายไป
        }, (error) => {
            console.error("Failed to fetch real-time work requests:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [firebaseUser, user]);

    // v 5. ใช้ useMemo เพื่อรวมข้อมูลเอกสาร กับ ข้อมูล Site เข้าด้วยกัน
    // โค้ดส่วนนี้จะทำงานเมื่อ allDocuments หรือ sites มีการเปลี่ยนแปลง
    const documentsWithSiteNames = useMemo(() => {
        if (sites.length === 0) {
            return allDocuments;
        }
        const sitesMap = new Map(sites.map(site => [site.id, site.name]));
        return allDocuments.map(doc => ({
            ...doc,
            site: {
                id: doc.site.id,
                name: sitesMap.get(doc.site.id) || 'Unknown Site'
            }
        }));
    }, [allDocuments, sites]);


    const handleDocumentClick = (doc: WorkRequest) => {
        setSelectedDocId(doc.id);
    };
    
    const handleCloseDetailModal = () => {
        setSelectedDocId(null);
    };

    const handleCloseCreateModal = () => {
        setIsCreateModalOpen(false);
    };
    
    const canCreate = user && (REVIEWER_ROLES.includes(user.role) || user.role === ROLES.ADMIN);

    return (
        // v 1. เปลี่ยน max-w-7xl เป็น max-w-screen-2xl และทำให้เป็น Flexbox Layout
        <div className="max-w-screen-2xl mx-auto flex flex-col h-full">
            {/* --- ส่วนที่ไม่ต้อง Scroll --- */}
            <div>
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">
                            ✍️ Work Requests
                        </h1>
                        <p className="text-gray-600 mt-1">รายการคำร้องของานทั้งหมด (Real-time)</p>
                    </div>
                    <div className="flex items-center space-x-3 mt-4 sm:mt-0">
                        <button className="flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg cursor-default" disabled>
                            <RefreshCw className={`w-4 h-4 mr-2 ${!loading ? '' : 'animate-spin'}`} />
                            Real-time Sync
                        </button>
                        {canCreate && (
                             <button onClick={() => setIsCreateModalOpen(true)} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                <Plus className="w-4 h-4 mr-2" />
                                สร้าง Work Request
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* v 2. สร้าง Container ให้ตารางยืดขยายเต็มพื้นที่ที่เหลือ */}
            <div className="flex-1 min-h-0">
                <WorkRequestListTable
                    documents={documentsWithSiteNames}
                    isLoading={loading}
                    onDocumentClick={handleDocumentClick}
                />
            </div>
            
            {selectedDocId && (
                <WorkRequestDetailModal
                    documentId={selectedDocId}
                    onClose={handleCloseDetailModal}
                    onUpdate={() => {}}
                />
            )}

            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-4xl bg-white rounded-lg shadow-xl p-6">
                        <CreateWorkRequestForm
                            onClose={handleCloseCreateModal}
                            userProp={user || undefined}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default function WorkRequestDashboardPage() {
  return (
    <AuthGuard requiredRoles={[ROLES.ADMIN, ROLES.SITE_ADMIN, ROLES.BIM, ROLES.ME, ROLES.SN]}>
        <Suspense fallback={<div className="text-center p-8">Loading Page...</div>}>
            <WorkRequestDashboardContent />
        </Suspense>
    </AuthGuard>
  );
}