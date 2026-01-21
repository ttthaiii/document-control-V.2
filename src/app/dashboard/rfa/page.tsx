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
import { STATUSES, STATUS_LABELS, Role, STATUS_COLORS } from '@/lib/config/workflow'
import { Plus, RefreshCw,ClipboardList } from 'lucide-react'
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

    const availableResponsibleParties = [
        { value: 'ALL', label: 'ทุกคน' },
        { value: 'SITE', label: 'Site (รอตรวจสอบ/รออนุมัติขั้นสุดท้าย)' },
        { value: 'CM', label: 'CM (รออนุมัติ)' },
        { value: 'BIM', label: 'BIM (ต้องแก้ไข)' },
        { value: 'APPROVED', label: 'อนุมัติแล้ว' },
        { value: 'REJECTED', label: 'ไม่อนุมัติ' }
    ];

    const availableStatuses = useMemo(() => Object.values(STATUSES), []);
    const getStatusColor = (status: string) => {
        switch (status) {
            // กลุ่มรออนุมัติ (โทนหิน/เทาอมฟ้า)
            case STATUSES.PENDING_REVIEW: 
                return 'bg-[#78909C]/20 text-[#546E7A]'; // Slate
            case STATUSES.PENDING_CM_APPROVAL: 
                return 'bg-[#546E7A]/20 text-[#37474F]'; // Deep Slate
            case STATUSES.PENDING_FINAL_APPROVAL: 
                return 'bg-[#607D8B]/20 text-[#455A64]'; // Blue Grey

            // กลุ่มแก้ไข (โทนเหลือง/ส้มดินเผา)
            case STATUSES.REVISION_REQUIRED: 
                return 'bg-[#C0CA33]/20 text-[#827717]'; // Muted Lime (ตัวหนังสือเขียวขี้ม้าเข้ม)
            case STATUSES.APPROVED_REVISION_REQUIRED: 
                return 'bg-[#D87D4A]/20 text-[#BF360C]'; // Terracotta (ตัวหนังสือส้มอิฐเข้ม)

            // กลุ่มอนุมัติ (โทนเขียวธรรมชาติ/เขียวอมฟ้า)
            case STATUSES.APPROVED: 
                return 'bg-[#558B2F]/20 text-[#33691E]'; // Moss Green (ตัวหนังสือเขียวป่า)
            case STATUSES.APPROVED_WITH_COMMENTS: 
                return 'bg-[#4DB6AC]/20 text-[#00695C]'; // Muted Teal (ตัวหนังสือเขียวหัวเป็ด)

            // กลุ่มไม่อนุมัติ (โทนแดงสนิม)
            case STATUSES.REJECTED: 
                return 'bg-[#A5574C]/20 text-[#8D3930]'; // Rust Red (ตัวหนังสือแดงเลือดหมู)

            default: 
                return 'bg-gray-100 text-gray-600';
        }
    };
    const getRFATypeColor = (type: string) => {
        switch (type) {
            case 'RFA-SHOP': 
                // โทนฟ้าหม่น (Stone Blue)
                return 'bg-[#78909C]/10 text-[#546E7A] border border-[#78909C]/30';
            case 'RFA-GEN': 
                // โทนเขียวหม่น (Sage Green)
                return 'bg-[#558B2F]/10 text-[#33691E] border border-[#558B2F]/30';
            case 'RFA-MAT': 
                // โทนส้มอิฐ (Clay/Terracotta)
                return 'bg-[#D87D4A]/10 text-[#BF360C] border border-[#D87D4A]/30';
            default: 
                return 'bg-gray-50 text-gray-600 border border-gray-200';
        }
    };
    // ✅ ย้าย useMemo ขึ้นมาไว้ก่อน if (!user) return null
    const filteredDocuments = useMemo(() => {
        const sitesMap = new Map(sites.map(s => [s.id, s.name]));
        const documentsWithSiteNames = allDocuments.map(doc => ({
            ...doc,
            site: { ...doc.site, name: sitesMap.get(doc.site.id) || 'N/A' }
        }));
        
        let docsToShow: RFADocument[] = documentsWithSiteNames;

        // 1. กรอง Revision (Show All)
        if (!filters.showAllRevisions) {
            docsToShow = docsToShow.filter(doc => doc.isLatest);
        }  
        
        // 2. กรอง RFA Type
        if (filters.rfaType !== 'ALL') {
            docsToShow = docsToShow.filter(doc => doc.rfaType === filters.rfaType);
        }
        
        // 3. กรอง Status
        if (filters.status !== 'ALL') {
            docsToShow = docsToShow.filter(doc => doc.status === filters.status);
        }

        // 4. กรอง Site
        if (filters.siteId !== 'ALL') {
            docsToShow = docsToShow.filter(doc => doc.site.id === filters.siteId);
        }

        // 5. กรอง Category
        if (filters.categoryId !== 'ALL') {
            docsToShow = docsToShow.filter(doc => doc.category?.id === filters.categoryId);
        }

        // 🔥🔥🔥 [ส่วนที่เพิ่มใหม่] 6. กรอง Responsible Party 🔥🔥🔥
        if (filters.responsibleParty !== 'ALL') {
            const rp = filters.responsibleParty;
            docsToShow = docsToShow.filter(doc => {
                switch (rp) {
                    case 'SITE':
                        // Site รับผิดชอบเมื่อ: รอตรวจสอบ หรือ รออนุมัติขั้นสุดท้าย
                        return [STATUSES.PENDING_REVIEW, STATUSES.PENDING_FINAL_APPROVAL].includes(doc.status);
                    
                    case 'CM':
                        // CM รับผิดชอบเมื่อ: รออนุมัติจาก CM
                        return doc.status === STATUSES.PENDING_CM_APPROVAL;
                    
                    case 'BIM':
                        // BIM รับผิดชอบเมื่อ: ต้องแก้ไข (ทั้งแก้แล้วส่งใหม่ หรือ อนุมัติแบบมีเงื่อนไข)
                        return [STATUSES.REVISION_REQUIRED, STATUSES.APPROVED_REVISION_REQUIRED].includes(doc.status);
                    
                    case 'APPROVED':
                        // เสร็จสิ้น (อนุมัติแล้ว)
                        return [STATUSES.APPROVED, STATUSES.APPROVED_WITH_COMMENTS].includes(doc.status);
                    
                    case 'REJECTED':
                        // ไม่อนุมัติ
                        return doc.status === STATUSES.REJECTED;
                        
                    default:
                        return true;
                }
            });
        }
        // 🔥🔥🔥 [จบส่วนที่เพิ่ม] 🔥🔥🔥

        // 7. กรอง Search Term
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
                        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-3">
                            <ClipboardList className="text-blue-600" size={32} />
                            RFA Documents
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