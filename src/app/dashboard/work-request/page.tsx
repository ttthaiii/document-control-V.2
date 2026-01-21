// src/app/dashboard/work-request/page.tsx
'use client';

import { useState, useEffect, Suspense, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/useAuth';
import { AuthGuard } from '@/lib/components/shared/AuthGuard';
import WorkRequestListTable from '@/components/work-request/WorkRequestListTable';
import WorkRequestDetailModal from '@/components/work-request/WorkRequestDetailModal';
import CreateWorkRequestForm from '@/components/work-request/CreateWorkRequestForm';
import { WorkRequest, WorkRequestStatus } from '@/types/work-request';
import { Plus, RefreshCw, ThumbsUp, ThumbsDown, AlertTriangle, X, PenTool } from 'lucide-react';
import { ROLES, WR_APPROVER_ROLES, WR_CREATOR_ROLES, WR_STATUSES, Role, STATUS_LABELS } from '@/lib/config/workflow';
import { db } from '@/lib/firebase/client';
import { collection, query, where, onSnapshot, orderBy, DocumentData, documentId } from 'firebase/firestore';
import { useNotification } from '@/lib/context/NotificationContext';
import Spinner from '@/components/shared/Spinner';
import { PERMISSION_KEYS, PERMISSION_DEFAULTS } from '@/lib/config/permissions';
import FilterBar from '@/components/rfa/FilterBar';

interface ApiSite {
  id: string;
  name: string;
  userOverrides?: {
    [userId: string]: Record<string, any>
  };
}

interface Filters {
    rfaType: string;
    status: string;
    siteId: string;
    showAllRevisions: boolean;
    categoryId: string;
    responsibleParty: string;
}

const RejectReasonModal = ({
    isOpen,
    onClose,
    onSubmit,
    isSubmitting
}: {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (reason: string) => void;
    isSubmitting: boolean;
}) => {
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = () => {
        if (!reason.trim()) {
            setError('กรุณากรอกเหตุผล');
            return;
        }
        onSubmit(reason);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[70] flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="flex justify-between items-center p-4 border-b">
                    <h3 className="text-lg font-bold text-gray-800">เหตุผลในการไม่อนุมัติ</h3>
                    <button onClick={onClose} disabled={isSubmitting} className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
                        <X size={24} />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <textarea
                        value={reason}
                        onChange={(e) => { setReason(e.target.value); setError(''); }}
                        rows={4}
                        placeholder="กรุณาระบุเหตุผล..."
                        className={`w-full p-2 border rounded-md ${error ? 'border-red-500' : 'border-gray-300'} bg-white text-gray-900`}
                        disabled={isSubmitting}
                    />
                    {error && <p className="text-red-500 text-sm">{error}</p>}
                </div>
                <div className="flex justify-end gap-4 p-4 border-t bg-gray-50">
                    <button onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-sm text-gray-700 bg-white border rounded-lg hover:bg-gray-100 disabled:opacity-50">
                        ยกเลิก
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="flex items-center px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:bg-red-300"
                    >
                        {isSubmitting ? <Spinner className="w-4 h-4 mr-2" /> : <ThumbsDown size={16} className="mr-2" />}
                        ยืนยันไม่อนุมัติ
                    </button>
                </div>
            </div>
        </div>
    );
};

function WorkRequestDashboardContent() {
    const { user, firebaseUser } = useAuth();
    const router = useRouter();
    const [allDocuments, setAllDocuments] = useState<WorkRequest[]>([]);
    const [sites, setSites] = useState<ApiSite[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const { showNotification } = useNotification();

    const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
    const [isBatchSubmitting, setIsBatchSubmitting] = useState(false);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [docIdToRejectSingle, setDocIdToRejectSingle] = useState<string | null>(null);

    // Filter States
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState<Filters>({
        rfaType: 'ALL',
        status: 'ALL',
        siteId: 'ALL',
        showAllRevisions: false,
        categoryId: 'ALL',
        responsibleParty: 'ALL',
    });

    // 1. ✅ แก้ไขตัวเลือกผู้รับผิดชอบ ให้ตรงกับ Work Request Flow
    const availableResponsibleParties = [
        { value: 'ALL', label: 'ทุกคน' },
        { value: 'PM', label: 'PM (รออนุมัติ)' },
        { value: 'BIM', label: 'BIM (รับงาน/แก้ไข)' },
        { value: 'SITE', label: 'Site (รอตรวจรับ)' },
        { value: 'COMPLETED', label: 'เสร็จสิ้น' },
        { value: 'REJECTED', label: 'ไม่อนุมัติ (PM)' }
    ];

    const availableStatuses = useMemo(() => Object.values(WR_STATUSES), []);

    useEffect(() => {
        const fetchSites = async () => {
            if (!firebaseUser) return;
            try {
                if (user?.sites && user.sites.length > 0) {
                    const q = query(collection(db, "sites"), where(documentId(), "in", user.sites));
                    onSnapshot(q, (snapshot) => {
                        const sitesData = snapshot.docs.map(doc => ({
                            id: doc.id,
                            name: doc.data().name,
                            userOverrides: doc.data().userOverrides
                        }));
                        setSites(sitesData);
                    });
                }
            } catch (error) {
                console.error("Failed to fetch sites", error);
            }
        };
        fetchSites();
    }, [firebaseUser, user]);

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
                    site: { id: data.siteId, name: '...' },
                });
            });

            setAllDocuments(documentsFromDb);
            setLoading(false);
        }, (error) => {
            console.error("Failed to fetch real-time work requests:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [firebaseUser, user]);

    const canCreateWR = useMemo(() => {
        if (!user) return false;
        const permKey = `WR.${PERMISSION_KEYS.WORK_REQUEST.CREATE}`;
        const [group, key] = permKey.split('.');
        
        const defaultRoles = PERMISSION_DEFAULTS[permKey] || [];
        const defaultAllowed = defaultRoles.includes(user.role as Role);

        return sites.some(site => {
            const override = site.userOverrides?.[user.id]?.[group]?.[key];
            if (override !== undefined) return override === true;
            return defaultAllowed;
        });
    }, [user, sites]);

    const filteredDocuments = useMemo(() => {
        const sitesMap = new Map(sites.map(s => [s.id, s.name]));
        
        const documentsWithSiteNames = allDocuments.map(doc => ({
            ...doc,
            site: {
                id: doc.site.id,
                name: sitesMap.get(doc.site.id) || 'Unknown Site'
            }
        }));
        
        let docsToShow = documentsWithSiteNames;

        if (!filters.showAllRevisions) {
            docsToShow = docsToShow.filter(doc => doc.isLatest);
        }

        if (filters.status !== 'ALL') {
            docsToShow = docsToShow.filter(doc => doc.status === filters.status);
        }

        if (filters.siteId !== 'ALL') {
            docsToShow = docsToShow.filter(doc => doc.site.id === filters.siteId);
        }

        // 2. ✅ เพิ่ม Logic การกรอง Responsible Party ให้ตรงกับ WR Workflow
        if (filters.responsibleParty !== 'ALL') {
            const rp = filters.responsibleParty;
            docsToShow = docsToShow.filter(doc => {
                switch (rp) {
                    case 'PM':
                        return doc.status === WR_STATUSES.DRAFT;
                    case 'BIM':
                        // BIM ดูแล: รอรับงาน, กำลังทำ, หรือต้องแก้
                        return ([WR_STATUSES.PENDING_BIM, WR_STATUSES.IN_PROGRESS, WR_STATUSES.REVISION_REQUESTED] as WorkRequestStatus[]).includes(doc.status);
                    case 'SITE':
                        // Site ดูแล: รอตรวจรับ
                        return doc.status === WR_STATUSES.PENDING_ACCEPTANCE;
                    case 'COMPLETED':
                        return doc.status === WR_STATUSES.COMPLETED;
                    case 'REJECTED':
                        return doc.status === WR_STATUSES.REJECTED_BY_PM;
                    default:
                        return true;
                }
            });
        }

        if (searchTerm.trim()) {
            const search = searchTerm.toLowerCase();
            docsToShow = docsToShow.filter(doc => 
                doc.documentNumber.toLowerCase().includes(search) ||
                doc.taskName.toLowerCase().includes(search)
            );
        }

        return docsToShow;
    }, [allDocuments, filters, sites, searchTerm]);

    const handleFilterChange = (key: keyof Filters, value: any) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const resetFilters = () => {
        setFilters({ rfaType: 'ALL', status: 'ALL', siteId: 'ALL', showAllRevisions: false, categoryId: 'ALL', responsibleParty: 'ALL' });
        setSearchTerm('');
    };

    const handleDocumentClick = (doc: WorkRequest) => { setSelectedDocId(doc.id); };
    const handleCloseDetailModal = () => { setSelectedDocId(null); };

    const handleBatchAction = useCallback(async (action: 'APPROVE_DRAFT' | 'REJECT_DRAFT', reason?: string) => {
        const idsToUpdate = docIdToRejectSingle ? [docIdToRejectSingle] : selectedDraftIds;
        if (idsToUpdate.length === 0) return;

        setIsBatchSubmitting(true);
        try {
            if (!firebaseUser) throw new Error('กรุณาล็อกอินก่อน');
            const token = await firebaseUser.getIdToken();

            const response = await fetch('/api/work-request/batch-update', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ids: idsToUpdate,
                    action: action,
                    payload: { comments: reason || '' }
                }),
            });
            const result = await response.json();

            if (result.success) {
                const actionText = action === 'APPROVE_DRAFT' ? 'อนุมัติ' : 'ไม่อนุมัติ';
                showNotification('success', 'ดำเนินการสำเร็จ!', `${actionText} ${result.updatedCount} รายการเรียบร้อยแล้ว`);
                setSelectedDraftIds([]);
                setShowRejectModal(false);
                setDocIdToRejectSingle(null);
            } else {
                throw new Error(result.error || `เกิดข้อผิดพลาดในการ ${action}`);
            }
        } catch (error) {
            showNotification('error', 'เกิดข้อผิดพลาด', error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setIsBatchSubmitting(false);
        }
    }, [firebaseUser, selectedDraftIds, docIdToRejectSingle, showNotification]);

    const handleBatchApprove = () => {
        if (selectedDraftIds.length === 0) return;
        handleBatchAction('APPROVE_DRAFT');
    };

    const handleBatchRejectClick = () => {
        if (selectedDraftIds.length === 0) return;
        setDocIdToRejectSingle(null);
        setShowRejectModal(true);
    };

    const handleSingleRejectClick = (docId: string) => {
        setDocIdToRejectSingle(docId);
        setShowRejectModal(true);
    };

    const handleRejectSubmit = (reason: string) => {
        handleBatchAction('REJECT_DRAFT', reason);
    };

    const handleSingleAction = useCallback(async (action: 'APPROVE_DRAFT' | 'REJECT_DRAFT', docId: string, reason?: string) => {
        setIsBatchSubmitting(true);
        try {
            if (!firebaseUser) throw new Error('กรุณาล็อกอินก่อน');
            const token = await firebaseUser.getIdToken();

            const response = await fetch(`/api/work-request/${docId}/update`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: action,
                    payload: { comments: reason || '' }
                }),
            });
            const result = await response.json();

            if (result.success) {
                 const actionText = action === 'APPROVE_DRAFT' ? 'อนุมัติ' : 'ไม่อนุมัติ';
                showNotification('success', 'ดำเนินการสำเร็จ!', `${actionText}เอกสารเรียบร้อยแล้ว`);
                setShowRejectModal(false);
                setDocIdToRejectSingle(null);
            } else {
                throw new Error(result.error || `เกิดข้อผิดพลาดในการ ${action}`);
            }
        } catch (error) {
             showNotification('error', 'เกิดข้อผิดพลาด', error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setIsBatchSubmitting(false);
        }
    }, [firebaseUser, showNotification]);

     const handleSingleApproveClickNew = (docId: string) => {
        handleSingleAction('APPROVE_DRAFT', docId);
    };

    const handleSingleRejectClickNew = (docId: string) => {
        setDocIdToRejectSingle(docId);
        setShowRejectModal(true);
    };

    const handleRejectSubmitSingle = (reason: string) => {
        if(docIdToRejectSingle) {
            handleSingleAction('REJECT_DRAFT', docIdToRejectSingle, reason);
        }
    };
    
    const isApprover = user && WR_APPROVER_ROLES.includes(user.role);

    return (
        <div className="max-w-screen-2xl mx-auto flex flex-col h-full">
            <div>
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-3">
                            <PenTool className="text-orange-600" size={32} />
                            Work Requests
                        </h1>
                        <p className="text-gray-600 mt-1">รายการคำร้องของานทั้งหมด (Real-time)</p>
                    </div>
                    <div className="flex items-center space-x-3 mt-4 sm:mt-0">
                        <button className="flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg cursor-default" disabled>
                            <RefreshCw className={`w-4 h-4 mr-2 ${!loading ? '' : 'animate-spin'}`} />
                            Real-time Sync
                        </button>
                        
                        {canCreateWR && (
                             <button onClick={() => setIsCreateModalOpen(true)} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                <Plus className="w-4 h-4 mr-2" />
                                สร้าง Work Request
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className='mb-6'>
                <FilterBar 
                    filters={filters} 
                    handleFilterChange={handleFilterChange} 
                    searchTerm={searchTerm} 
                    setSearchTerm={setSearchTerm} 
                    resetFilters={resetFilters}
                    sites={sites} 
                    categories={[]} 
                    availableStatuses={availableStatuses} 
                    availableResponsibleParties={availableResponsibleParties}
                />
            </div>

            {isApprover && (
                <div className="bg-white p-3 rounded-lg shadow border border-gray-200 flex items-center space-x-3">
                    <span className="text-sm font-medium text-gray-700">รายการที่เลือก ({selectedDraftIds.length}):</span>
                    <button
                        onClick={handleBatchApprove}
                        disabled={selectedDraftIds.length === 0 || isBatchSubmitting}
                        className="flex items-center px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        {isBatchSubmitting ? <Spinner className="w-4 h-4 mr-1" /> : <ThumbsUp size={14} className="mr-1" />} อนุมัติ
                    </button>
                    <button
                        onClick={handleBatchRejectClick}
                        disabled={selectedDraftIds.length === 0 || isBatchSubmitting}
                        className="flex items-center px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        {isBatchSubmitting ? <Spinner className="w-4 h-4 mr-1" /> : <ThumbsDown size={14} className="mr-1" />} ไม่อนุมัติ
                    </button>
                    {isBatchSubmitting && <span className="text-xs text-gray-500 italic">กำลังดำเนินการ...</span>}
                </div>
            )}

            <div className="flex-1 min-h-0">
                <WorkRequestListTable
                    documents={filteredDocuments}
                    isLoading={loading}
                    onDocumentClick={handleDocumentClick}
                    selectedIds={selectedDraftIds}
                    onSelectionChange={setSelectedDraftIds}
                    onApproveRejectClick={(action, docId) => {
                        if(action === 'APPROVE_DRAFT') handleSingleApproveClickNew(docId);
                        else if(action === 'REJECT_DRAFT') handleSingleRejectClickNew(docId);
                    }}
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
                            onClose={() => setIsCreateModalOpen(false)}
                            userProp={user || undefined}
                        />
                    </div>
                </div>
            )}

            <RejectReasonModal
                isOpen={showRejectModal}
                onClose={() => { setShowRejectModal(false); setDocIdToRejectSingle(null); }}
                onSubmit={docIdToRejectSingle ? handleRejectSubmitSingle : handleRejectSubmit}
                isSubmitting={isBatchSubmitting}
            />            
        </div>
    );
}

export default function WorkRequestDashboardPage() {
    return (
        <AuthGuard requiredRoles={[
            ROLES.ADMIN, ROLES.SITE_ADMIN, ROLES.BIM, ...WR_CREATOR_ROLES, ...WR_APPROVER_ROLES
        ]}>
            <Suspense fallback={<div className="text-center p-8">Loading Page...</div>}>
                <WorkRequestDashboardContent />
            </Suspense>
        </AuthGuard>
    );
}