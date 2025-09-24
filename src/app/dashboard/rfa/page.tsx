'use client'

import { useState, useEffect, Suspense, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/useAuth'
import { AuthGuard } from '@/lib/components/shared/AuthGuard'
import Layout from '@/components/layout/Layout'
import RFAListTable from '@/components/rfa/RFAListTable'
import RFADetailModal from '@/components/rfa/RFADetailModal'
import DashboardStats from '@/components/rfa/DashboardStats'
import CreateRFAForm from '@/components/rfa/CreateRFAForm'
import { RFADocument } from '@/types/rfa'
import { STATUSES, STATUS_LABELS, CREATOR_ROLES, REVIEWER_ROLES, APPROVER_ROLES } from '@/lib/config/workflow'
import { Plus, Search, RefreshCw, User } from 'lucide-react'
import { db } from '@/lib/firebase/client'
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore'
import SmartRFAModal from '@/components/rfa/SmartRFAModal'

type CreatorRole = typeof CREATOR_ROLES[number];

interface Filters {
  rfaType: 'ALL' | 'RFA-SHOP' | 'RFA-GEN' | 'RFA-MAT'
  status: string
  siteId: string | 'ALL'
  showAllRevisions: boolean;
  categoryId: string | 'ALL';
  responsibleParty: 'ALL' | 'SITE' | 'CM' | CreatorRole;
}

interface Category {
  id: string;
  categoryCode: string;
  categoryName: string;
}

const RFA_TYPE_DISPLAY_NAMES: { [key: string]: string } = {
  'RFA-SHOP': 'Shop Drawing',
  'RFA-GEN': 'General',
  'RFA-MAT': 'Material',
};

function RFAContent() {
  const { user, firebaseUser } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [allDocuments, setAllDocuments] = useState<RFADocument[]>([]);
  // const [filteredDocuments, setFilteredDocuments] = useState<RFADocument[]>([]); // <-- จะถูกแทนที่ด้วย useMemo
  const [loading, setLoading] = useState(true)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('')
  const [categories, setCategories] = useState<Category[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

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
    // เมื่อปิด Modal, กลับไปยัง URL เดิมที่ไม่มี docId
    const currentQuery = new URLSearchParams(window.location.search);
    currentQuery.delete('docId');
    router.push(`/dashboard/rfa?${currentQuery.toString()}`);
  };

  useEffect(() => {
    const typeFromUrl = (searchParams.get('type') as Filters['rfaType']) || 'ALL';
    if (typeFromUrl !== filters.rfaType) {
      handleFilterChange('rfaType', typeFromUrl);
    }
  }, [searchParams, filters.rfaType]);
  
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
            // ✅ FIX 2: ปรับ Logic การดึง categoryCode ที่นี่
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

  // ✅ KEY CHANGE: รวม Logic การกรองทั้งหมดไว้ใน useMemo ที่เดียว
  const filteredDocuments = useMemo(() => {
    const isCM = user && APPROVER_ROLES.includes(user.role);
    const statusesHiddenFromCM = [STATUSES.PENDING_REVIEW, STATUSES.REVISION_REQUIRED];

    let docsToShow: RFADocument[];

    if (filters.showAllRevisions) {
      docsToShow = allDocuments;
    } else {
      const familyMap = new Map<string, RFADocument[]>();
      allDocuments.forEach(doc => {
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

            if (filter === 'SITE') {
                // Site จะรับผิดชอบเฉพาะเมื่อสถานะคือ "รอตรวจสอบ"
                return status === STATUSES.PENDING_REVIEW;
            }
            if (filter === 'CM') {
                // CM จะรับผิดชอบเฉพาะเมื่อสถานะคือ "ส่ง CM"
                return status === STATUSES.PENDING_CM_APPROVAL;
            }
            if (creatorRole && CREATOR_ROLES.includes(creatorRole as CreatorRole)) {
                 // Creator (BIM, ME, SN) จะรับผิดชอบเมื่อ:
                 const isRevisionState = status === STATUSES.REVISION_REQUIRED || status === STATUSES.APPROVED_REVISION_REQUIRED;
                 const isRejectedAndLatest = status === STATUSES.REJECTED && doc.isLatest;

                 // ต้องเป็นสถานะ "แก้ไข" หรือ "ไม่อนุมัติ (ล่าสุด)" และ role ต้องตรงกับที่เลือก
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
  }, [allDocuments, filters, user, searchTerm]);


  const loadCategories = async () => {
    if (!firebaseUser) return;
    try {
      const token = await firebaseUser.getIdToken();
      const response = await fetch(`/api/rfa/categories?rfaType=ALL`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        const uniqueCategories = Array.from(new Map(data.categories.map((cat: Category) => [cat.id, cat])).values());
        setCategories(uniqueCategories as Category[]);
      }
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  useEffect(() => {
    if (firebaseUser) {
      loadCategories();
    }
  }, [firebaseUser])

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

  return (
    <AuthGuard>
      <Layout>
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">
                📋 RFA Documents
                {filters.rfaType && filters.rfaType !== 'ALL' && (
                  <span className="text-orange-600"> - {RFA_TYPE_DISPLAY_NAMES[filters.rfaType]}</span>
                )}
              </h1>
              <p className="text-gray-600 mt-1">จัดการเอกสาร Request for Approval</p>
            </div>
            <div className="flex items-center space-x-3 mt-4 sm:mt-0">
              <button onClick={() => {}} className="flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200" disabled={loading}>
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

          {/* Filter Bar */}
          <div className="bg-white rounded-lg shadow mb-6 p-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-3">
                <label htmlFor="search-filter" className="text-sm font-medium text-gray-700">ค้นหา</label>
                <div className="relative mt-1">
                   <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                   <input
                      id="search-filter"
                      type="text"
                      placeholder="เลขที่เอกสาร, ชื่อเอกสาร..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
                    />
                </div>
              </div>

              <div className="md:col-span-2">
                <label htmlFor="status-filter" className="text-sm font-medium text-gray-700">สถานะ</label>
                 <select
                    id="status-filter"
                    value={filters.status}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="ALL">ทุกสถานะ</option>
                    {availableStatuses.map(statusKey => (
                      <option key={statusKey} value={statusKey}>
                        {STATUS_LABELS[statusKey] || statusKey}
                      </option>
                    ))}
                  </select>
              </div>
              
              <div className="md:col-span-2">
                <label htmlFor="responsible-party-filter" className="text-sm font-medium text-gray-700">ผู้รับผิดชอบ</label>
                <select
                  id="responsible-party-filter"
                  value={filters.responsibleParty}
                  onChange={(e) => handleFilterChange('responsibleParty', e.target.value as Filters['responsibleParty'])}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg"
                >
                  {availableResponsibleParties.map(party => (
                      <option key={party.value} value={party.value}>{party.label}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label htmlFor="category-filter" className="text-sm font-medium text-gray-700">หมวดงาน</label>
                <select 
                  id="category-filter" 
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg"
                  value={filters.categoryId}
                  onChange={(e) => handleFilterChange('categoryId', e.target.value)}
                >
                    <option value="ALL">ทุกหมวดงาน</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.categoryCode}
                      </option>
                    ))}
                </select>
              </div>

               <div className="md:col-span-1 flex items-center h-10">
                 <input
                    id="show-all-revisions"
                    type="checkbox"
                    checked={filters.showAllRevisions}
                    onChange={(e) => handleFilterChange('showAllRevisions', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <label htmlFor="show-all-revisions" className="ml-2 text-sm text-gray-700">ทุกฉบับ</label>
              </div>
              <div className="md:col-span-2">
                 <button onClick={resetFilters} className="w-full px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">
                    รีเซ็ต
                  </button>
              </div>
            </div>
          </div>
          
          {/* Document Table */}
          {loading ? (
             <div className="text-center p-8">กำลังโหลดเอกสาร...</div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center bg-white rounded-lg shadow p-8">
              <p className="text-gray-500">ไม่พบเอกสารที่ตรงกับเงื่อนไข</p>
            </div>
          ) : (
            <RFAListTable
              documents={filteredDocuments}
              onDocumentClick={handleDocumentClick}
              getStatusColor={getStatusColor}
              statusLabels={STATUS_LABELS}
              getRFATypeColor={getRFATypeColor}
            />
          )}

          {/* Create Modal */}
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
      </Layout>
    </AuthGuard>
  )
}

export default function RFAListPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RFAContent />
    </Suspense>
  )
}