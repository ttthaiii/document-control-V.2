// src/app/dashboard/rfa/page.tsx (โค้ดฉบับสมบูรณ์)
'use client'

import React, { Suspense, useMemo, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/useAuth'
import { AuthGuard } from '@/lib/components/shared/AuthGuard'
import RFAListTable from '@/components/rfa/RFAListTable'
import DashboardStats from '@/components/rfa/DashboardStats'
import CreateRFAForm from '@/components/rfa/CreateRFAForm'
import { RFADocument, Site, Category } from '@/types/rfa'
import { STATUSES, STATUS_LABELS, CREATOR_ROLES, APPROVER_ROLES } from '@/lib/config/workflow'
import { Plus, RefreshCw } from 'lucide-react'
import SmartRFAModal from '@/components/rfa/SmartRFAModal'
import FilterBar from '@/components/rfa/FilterBar' 

// v 1. Import สิ่งที่จำเป็นจาก Firestore SDK
import { db } from '@/lib/firebase/client'
import { collection, query, where, onSnapshot, orderBy, documentId, collectionGroup } from 'firebase/firestore'


// --- Interfaces (เหมือนเดิม) ---
interface Filters {
  rfaType: 'ALL' | 'RFA-SHOP' | 'RFA-GEN' | 'RFA-MAT'
  status: string
  siteId: string | 'ALL'
  showAllRevisions: boolean;
  categoryId: string | 'ALL';
  responsibleParty: 'ALL' | 'SITE' | 'CM' | CreatorRole;
}
type CreatorRole = typeof CREATOR_ROLES[number];
const RFA_TYPE_DISPLAY_NAMES: { [key: string]: string } = {
  'RFA-SHOP': 'Shop Drawing', 'RFA-GEN': 'General', 'RFA-MAT': 'Material',
};


function RFAContent() {
    const { user, firebaseUser } = useAuth()
    const router = useRouter()
    const searchParams = useSearchParams()

    const [allDocuments, setAllDocuments] = useState<RFADocument[]>([]);
    const [loading, setLoading] = useState(true)
    const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('')
    const [categories, setCategories] = useState<Category[]>([]);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [sites, setSites] = useState<Site[]>([]);
    const [filters, setFilters] = useState<Filters>({
        rfaType: (searchParams.get('type') as Filters['rfaType']) || 'ALL',
        status: 'ALL',
        siteId: 'ALL',
        showAllRevisions: false,
        categoryId: 'ALL',
        responsibleParty: 'ALL',
    })

    const availableStatuses = useMemo(() => {
        const allStatusKeys = Object.values(STATUSES);
        if (user && APPROVER_ROLES.includes(user.role)) {
        const statusesToHide = [STATUSES.PENDING_REVIEW, STATUSES.REVISION_REQUIRED];
        return allStatusKeys.filter(status => !statusesToHide.includes(status));
        }
        return allStatusKeys;
    }, [user]);

    const availableResponsibleParties = useMemo(() => {
        if (user && APPROVER_ROLES.includes(user.role)) {
        return [
            { value: 'ALL', label: 'ทุกคน' },
            { value: 'CM', label: 'CM' },
        ];
        }
        return [
        { value: 'ALL', label: 'ทุกคน' },
        ...CREATOR_ROLES.map(role => ({ value: role, label: role })),
        { value: 'SITE', label: 'Site' },
        { value: 'CM', label: 'CM' },
        ];
    }, [user]);

    useEffect(() => {
        const docIdFromUrl = searchParams.get('docId');
        if (docIdFromUrl) {
        setSelectedDocumentId(docIdFromUrl);
        }
    }, [searchParams]);

    const handleDocumentClick = (doc: RFADocument) => {
        setSelectedDocumentId(doc.id);
    };

    const handleCloseModal = () => {
        setSelectedDocumentId(null);
        const currentQuery = new URLSearchParams(window.location.search);
        currentQuery.delete('docId');
        router.push(`/dashboard/rfa?${currentQuery.toString()}`, { scroll: false });
    };

    useEffect(() => {
        const typeFromUrl = (searchParams.get('type') as Filters['rfaType']) || 'ALL';
        if (typeFromUrl !== filters.rfaType) {
        handleFilterChange('rfaType', typeFromUrl);
        }
    }, [searchParams, filters.rfaType]);
    
    // useEffect หลักสำหรับดึงเอกสาร RFA (เหมือนเดิม)
    useEffect(() => {
        if (!firebaseUser || !user?.sites || user.sites.length === 0) {
        setLoading(false);
        return;
        }

        setLoading(true);
        const q = query(
        collection(db, 'rfaDocuments'),
        where('siteId', 'in', user.sites),
        orderBy('updatedAt', 'desc')
        );
        
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const documentsFromDb: RFADocument[] = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            documentsFromDb.push({
                id: doc.id,
                ...data,
                site: { id: data.siteId, name: data.siteName || 'N/A' },
                category: { 
                    id: data.categoryId, 
                    categoryCode: data.taskData?.taskCategory || data.categoryId || 'N/A', 
                    categoryName: '' 
                },
                createdByInfo: { 
                    email: data.workflow?.[0]?.userName || 'N/A', 
                    role: data.workflow?.[0]?.role || 'N/A' 
                },
                permissions: {},
            } as RFADocument);
        });
        setAllDocuments(documentsFromDb);
        setLoading(false);
        }, (error) => {
        console.error("Error fetching realtime documents:", error);
        setLoading(false);
        });

        return () => unsubscribe();
    }, [firebaseUser, user]);

    // v 2. เปลี่ยนจากการเรียก API มาใช้ onSnapshot เพื่อดึงข้อมูล Site และ Category
    useEffect(() => {
        if (!user?.sites || user.sites.length === 0) {
            setSites([]);
            setCategories([]);
            return;
        }
    
        // Fetch Sites
        const sitesQuery = query(collection(db, "sites"), where(documentId(), "in", user.sites));
        const unsubscribeSites = onSnapshot(sitesQuery, (snapshot) => {
            const sitesData: Site[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Site));
            setSites(sitesData);
        });
    
        // Fetch All Categories from user's sites
        const categoriesQuery = query(collectionGroup(db, 'categories'), where('siteId', 'in', user.sites));
        const unsubscribeCategories = onSnapshot(categoriesQuery, (snapshot) => {
            const categoriesData: Category[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
            // ทำให้ Category ไม่ซ้ำกัน
            const uniqueCategories = Array.from(new Map(categoriesData.map(cat => [cat.id, cat])).values());
            setCategories(uniqueCategories);
        });
    
        return () => {
            unsubscribeSites();
            unsubscribeCategories();
        };
    }, [user]);


    const filteredDocuments = useMemo(() => {
        const sitesMap = new Map(sites.map(s => [s.id, s.name]));
        const documentsWithSiteNames = allDocuments.map(doc => ({
            ...doc,
            site: { ...doc.site, name: sitesMap.get(doc.site.id) || 'N/A' }
        }));
        
        let docsToShow: RFADocument[] = documentsWithSiteNames;

        const isCM = user && APPROVER_ROLES.includes(user.role);
        const statusesHiddenFromCM = [STATUSES.PENDING_REVIEW, STATUSES.REVISION_REQUIRED];

        if (filters.showAllRevisions) {
          docsToShow = documentsWithSiteNames;
        } else {
          const familyMap = new Map<string, RFADocument[]>();
          documentsWithSiteNames.forEach(doc => {
              const familyId = doc.parentRfaId || doc.id;
              if (!familyMap.has(familyId)) {
              familyMap.set(familyId, []);
              }
              familyMap.get(familyId)!.push(doc);
          });

          const latestVisibleDocs: RFADocument[] = [];
          familyMap.forEach(group => {
              if (group.length === 0) return;
              group.sort((a, b) => (b.revisionNumber || 0) - (a.revisionNumber || 0));
              const latestRev = group[0];

              if (isCM) {
              const isLatestVisibleToCM = latestRev && !statusesHiddenFromCM.includes(latestRev.status);
              if (isLatestVisibleToCM) {
                  latestVisibleDocs.push(latestRev);
              } else {
                  const previousVisibleRev = group.find(doc => !statusesHiddenFromCM.includes(doc.status));
                  if (previousVisibleRev) {
                  latestVisibleDocs.push(previousVisibleRev);
                  }
              }
              } else {
              latestVisibleDocs.push(latestRev);
              }
          });
          docsToShow = latestVisibleDocs;
        }

        if (isCM) {
        docsToShow = docsToShow.filter(doc => !statusesHiddenFromCM.includes(doc.status));
        }
        if (filters.siteId !== 'ALL') {
        docsToShow = docsToShow.filter(doc => doc.site.id === filters.siteId);
        }        
        if (filters.rfaType !== 'ALL') {
        docsToShow = docsToShow.filter(doc => doc.rfaType === filters.rfaType);
        }
        if (filters.status !== 'ALL') {
        docsToShow = docsToShow.filter(doc => doc.status === filters.status);
        }
        if (filters.categoryId !== 'ALL') {
        docsToShow = docsToShow.filter(doc => doc.category?.id === filters.categoryId);
        }
        if (filters.responsibleParty !== 'ALL') {
            docsToShow = docsToShow.filter(doc => {
                const filter = filters.responsibleParty;
                const status = doc.status;
                const creatorRole = doc.createdByInfo?.role;

                if (filter === 'SITE') return status === STATUSES.PENDING_REVIEW;
                if (filter === 'CM') return status === STATUSES.PENDING_CM_APPROVAL;
                
                if (creatorRole && CREATOR_ROLES.includes(creatorRole as CreatorRole)) {
                    const isRevisionState = status === STATUSES.REVISION_REQUIRED || status === STATUSES.APPROVED_REVISION_REQUIRED;
                    const isRejectedAndLatest = status === STATUSES.REJECTED && doc.isLatest;
                    return (isRevisionState || isRejectedAndLatest) && creatorRole === filter;
                }
                return false;
            });
        }
        if (searchTerm.trim()) {
            const search = searchTerm.toLowerCase();
            docsToShow = docsToShow.filter((doc: RFADocument) => 
                doc.documentNumber.toLowerCase().includes(search) ||
                doc.title.toLowerCase().includes(search)
            );
        }

        return docsToShow;
    }, [allDocuments, filters, user, searchTerm, sites]);


    const handleFilterChange = (key: keyof Filters, value: any) => {
        setFilters(prev => ({ ...prev, [key]: value }))
    }

    const resetFilters = () => {
        const currentRfaType = filters.rfaType;
        setFilters({ 
        rfaType: currentRfaType, 
        status: 'ALL', 
        siteId: 'ALL', 
        showAllRevisions: false, 
        categoryId: 'ALL',
        responsibleParty: 'ALL'
        })
        setSearchTerm('')
    }
    
    const handleCreateClick = () => {
        setIsCreateModalOpen(true);
    };
    
    const handleModalClose = () => {
        setIsCreateModalOpen(false);
    };

    const handleChartFilter = (key: string, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const getStatusColor = (status: string) => {
        switch (status) {
        case STATUSES.APPROVED:
        case STATUSES.APPROVED_WITH_COMMENTS:
        case STATUSES.APPROVED_REVISION_REQUIRED:
            return 'text-green-600 bg-green-50'
        case STATUSES.REJECTED: return 'text-red-600 bg-red-50'
        case STATUSES.PENDING_CM_APPROVAL: return 'text-orange-600 bg-orange-50'
        case STATUSES.PENDING_REVIEW: return 'text-blue-600 bg-blue-50'
        case STATUSES.REVISION_REQUIRED: return 'text-yellow-600 bg-yellow-50'
        case STATUSES.PENDING_FINAL_APPROVAL: return 'text-purple-600 bg-purple-50'
        default: return 'text-gray-600 bg-gray-50'
        }
    }
    
    const getRFATypeColor = (type: string) => {
        switch (type) {
        case 'RFA-SHOP': return 'bg-blue-100 text-blue-800'
        case 'RFA-GEN': return 'bg-green-100 text-green-800'
        case 'RFA-MAT': return 'bg-orange-100 text-orange-800'
        default: return 'bg-gray-100 text-gray-800'
        }
    }

    if (!user) return null
    
    const filterBarProps = {
        filters, handleFilterChange, searchTerm, setSearchTerm, resetFilters,
        sites, categories, availableStatuses, availableResponsibleParties
    };

    return (
        <AuthGuard>
        {/* v 1. แก้ไข Layout หลักให้เป็น Flexbox แนวตั้ง และกำหนดความสูงให้เต็มพื้นที่ที่เหลือ */}
        <div className="max-w-screen-2xl mx-auto"> 
            
            {/* --- ส่วน Header, Filter, Chart จะเรียงลำดับลงมาตามปกติ --- */}
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">
                            📋 RFA Documents
                            {filters.rfaType && filters.rfaType !== 'ALL' && (
                            <span className="text-orange-600"> - {RFA_TYPE_DISPLAY_NAMES[filters.rfaType]}</span>
                            )}
                        </h1>
                    </div>
                    <div className="flex items-center space-x-3 mt-4 sm:mt-0">
                        <button onClick={() => {}} className="flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg" disabled={loading}>
                            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            {loading ? 'Syncing...' : 'Real-time'}
                        </button>
                        <button onClick={handleCreateClick} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                            <Plus className="w-4 h-4 mr-2" />
                            สร้าง RFA
                        </button>
                    </div>
                </div>

            <DashboardStats 
                allDocuments={filteredDocuments}
                onChartFilter={handleChartFilter}
                activeFilters={filters}
                categories={categories}
            />

            <div className='mb-6'>
                <FilterBar {...filterBarProps} />
            </div>
            
            {/* v 2. เพิ่ม mt-6 (margin-top) ให้กับตาราง */}
            <div className="mt-6">
                {loading ? (
                    <div className="text-center p-8 h-full flex items-center justify-center bg-white rounded-lg shadow">กำลังโหลดเอกสาร...</div>
                ) : (
                    <RFAListTable
                        documents={filteredDocuments}
                        isLoading={loading}
                        onDocumentClick={handleDocumentClick}
                        getStatusColor={getStatusColor}
                        statusLabels={STATUS_LABELS}
                        getRFATypeColor={getRFATypeColor}
                    />
                )}
            </div>

            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                    <CreateRFAForm
                        onClose={handleModalClose}
                        isModal={true}
                        userProp={user ? {
                            id: user.id,
                            email: user.email,
                            role: user.role,
                            sites: user.sites || []
                        } : undefined}
                        presetRfaType={filters.rfaType !== 'ALL' ? filters.rfaType : undefined}
                    />
                </div>
            )}

            <SmartRFAModal
            documentId={selectedDocumentId}
            onClose={handleCloseModal}
            />
        </div>
        </AuthGuard>
    )
}

export default function RFAListPage() {
  return (
    <Suspense fallback={<div>Loading Page...</div>}>
      <RFAContent />
    </Suspense>
  )
}