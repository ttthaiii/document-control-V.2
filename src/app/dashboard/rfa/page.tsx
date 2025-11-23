// src/app/dashboard/rfa/page.tsx
'use client'

import React, { Suspense, useMemo, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/useAuth'
import { AuthGuard } from '@/lib/components/shared/AuthGuard'
import RFAListTable from '@/components/rfa/RFAListTable'
import DashboardStats from '@/components/rfa/DashboardStats'
import CreateRFAForm from '@/components/rfa/CreateRFAForm'
import { RFADocument, Site as SiteType, Category } from '@/types/rfa'
import { STATUSES, STATUS_LABELS, Role } from '@/lib/config/workflow'
import { Plus, RefreshCw } from 'lucide-react'
import SmartRFAModal from '@/components/rfa/SmartRFAModal'
import FilterBar from '@/components/rfa/FilterBar' 
import { db } from '@/lib/firebase/client'
import { collection, query, where, onSnapshot, orderBy, documentId, collectionGroup } from 'firebase/firestore'
import { PERMISSION_KEYS, PERMISSION_DEFAULTS } from '@/lib/config/permissions'

interface Site extends SiteType {
    userOverrides?: {
        [userId: string]: Record<string, any>
    }
}

interface Filters {
  rfaType: 'ALL' | 'RFA-SHOP' | 'RFA-GEN' | 'RFA-MAT'
  status: string
  siteId: string | 'ALL'
  showAllRevisions: boolean;
  categoryId: string | 'ALL';
  responsibleParty: 'ALL' | 'SITE' | 'CM' | string;
}
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

    useEffect(() => {
        const docIdFromUrl = searchParams.get('docId');
        if (docIdFromUrl) {
        setSelectedDocumentId(docIdFromUrl);
        }
    }, [searchParams]);

    useEffect(() => {
        const typeFromUrl = (searchParams.get('type') as Filters['rfaType']) || 'ALL';
        if (typeFromUrl !== filters.rfaType) {
        handleFilterChange('rfaType', typeFromUrl);
        }
    }, [searchParams, filters.rfaType]);
    
    useEffect(() => {
        if (!user?.sites || user.sites.length === 0) {
            setSites([]);
            setCategories([]);
            return;
        }
    
        const sitesQuery = query(collection(db, "sites"), where(documentId(), "in", user.sites));
        const unsubscribeSites = onSnapshot(sitesQuery, (snapshot) => {
            const sitesData: Site[] = snapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data() 
            } as Site));
            setSites(sitesData);
        });
    
        const categoriesQuery = query(collectionGroup(db, 'categories'), where('siteId', 'in', user.sites));
        const unsubscribeCategories = onSnapshot(categoriesQuery, (snapshot) => {
            const categoriesData: Category[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
            const uniqueCategories = Array.from(new Map(categoriesData.map(cat => [cat.id, cat])).values());
            setCategories(uniqueCategories);
        });
    
        return () => {
            unsubscribeSites();
            unsubscribeCategories();
        };
    }, [user]);

    const canCreateCurrentType = useMemo(() => {
        if (!user || filters.rfaType === 'ALL') return false;

        let permKey = '';
        if (filters.rfaType === 'RFA-SHOP') permKey = `RFA.${PERMISSION_KEYS.RFA.CREATE_SHOP}`;
        else if (filters.rfaType === 'RFA-GEN') permKey = `RFA.${PERMISSION_KEYS.RFA.CREATE_GEN}`;
        else if (filters.rfaType === 'RFA-MAT') permKey = `RFA.${PERMISSION_KEYS.RFA.CREATE_MAT}`;
        else return false;

        const [group, key] = permKey.split('.');
        const defaultRoles = PERMISSION_DEFAULTS[permKey] || [];
        const defaultAllowed = defaultRoles.includes(user.role as Role);

        return sites.some(site => {
            const override = site.userOverrides?.[user.id]?.[group]?.[key];
            if (override !== undefined) return override === true;
            return defaultAllowed;
        });

    }, [user, filters.rfaType, sites]);

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

    const handleFilterChange = (key: keyof Filters, value: any) => {
        setFilters(prev => ({ ...prev, [key]: value }))
    }
    const handleDocumentClick = (doc: RFADocument) => { setSelectedDocumentId(doc.id); };
    const handleCloseModal = () => { setSelectedDocumentId(null); router.push(`/dashboard/rfa?${new URLSearchParams(window.location.search).toString().replace(/&?docId=[^&]*/, '')}`, { scroll: false }); };
    const handleCreateClick = () => { setIsCreateModalOpen(true); };
    const handleModalClose = () => { setIsCreateModalOpen(false); };
    const handleChartFilter = (key: string, value: string) => { setFilters(prev => ({ ...prev, [key]: value })); };
    const resetFilters = () => {
        const currentRfaType = filters.rfaType;
        setFilters({ rfaType: currentRfaType, status: 'ALL', siteId: 'ALL', showAllRevisions: false, categoryId: 'ALL', responsibleParty: 'ALL' })
        setSearchTerm('')
    }
    const availableResponsibleParties = useMemo(() => { return [{ value: 'ALL', label: 'ทุกคน' }]; }, []); 
    const availableStatuses = useMemo(() => Object.values(STATUSES), []);
    const getStatusColor = (status: string) => 'text-gray-600 bg-gray-50'; 
    const getRFATypeColor = (type: string) => 'bg-gray-100 text-gray-800'; 

    // ✅ ย้าย useMemo ขึ้นมาไว้ก่อน if (!user) return null
    const filteredDocuments = useMemo(() => {
        const sitesMap = new Map(sites.map(s => [s.id, s.name]));
        const documentsWithSiteNames = allDocuments.map(doc => ({
            ...doc,
            site: { ...doc.site, name: sitesMap.get(doc.site.id) || 'N/A' }
        }));
        
        let docsToShow: RFADocument[] = documentsWithSiteNames;
        
        if (filters.rfaType !== 'ALL') {
            docsToShow = docsToShow.filter(doc => doc.rfaType === filters.rfaType);
        }
        
        if (filters.status !== 'ALL') {
            docsToShow = docsToShow.filter(doc => doc.status === filters.status);
        }

        if (filters.siteId !== 'ALL') {
            docsToShow = docsToShow.filter(doc => doc.site.id === filters.siteId);
        }

        if (filters.categoryId !== 'ALL') {
            docsToShow = docsToShow.filter(doc => doc.category?.id === filters.categoryId);
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

    // ✅ ย้ายจุดเช็ค user มาไว้ตรงนี้ (หลังจากประกาศ Hooks ทั้งหมดแล้ว)
    if (!user) return null

    return (
        <AuthGuard>
        <div className="max-w-screen-2xl mx-auto"> 
            
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
                        
                        {/* ปุ่มสร้าง: แสดงเฉพาะเมื่อเลือก Type แล้ว และมีสิทธิ์สร้างใน Type นั้น */}
                        {filters.rfaType !== 'ALL' && canCreateCurrentType && (
                            <button onClick={handleCreateClick} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                <Plus className="w-4 h-4 mr-2" />
                                สร้าง {RFA_TYPE_DISPLAY_NAMES[filters.rfaType]}
                            </button>
                        )}
                    </div>
                </div>

            <DashboardStats 
                allDocuments={filteredDocuments}
                onChartFilter={handleChartFilter}
                activeFilters={filters}
                categories={categories}
            />

            <div className='mb-6'>
                <FilterBar 
                    filters={filters} handleFilterChange={handleFilterChange} searchTerm={searchTerm} setSearchTerm={setSearchTerm} resetFilters={resetFilters}
                    sites={sites} categories={categories} availableStatuses={availableStatuses} availableResponsibleParties={availableResponsibleParties}
                />
            </div>
            
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