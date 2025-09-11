// src/app/dashboard/rfa/page.tsx (Updated to use Modal)
'use client'

import { useState, useEffect, Suspense, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/useAuth'
import { AuthGuard } from '@/lib/components/shared/AuthGuard'
import Layout from '@/components/layout/Layout'
import RFAListTable from '@/components/rfa/RFAListTable'
import RFADetailModal from '@/components/rfa/RFADetailModal'
import DashboardStats from '@/components/rfa/DashboardStats'
import CreateRFAForm from '@/components/rfa/CreateRFAForm' // <-- เพิ่ม Import นี้
import { RFADocument } from '@/types/rfa'
import { STATUSES, STATUS_LABELS } from '@/lib/config/workflow' 
import { Plus, Search, RefreshCw } from 'lucide-react'

interface Filters {
  rfaType: 'ALL' | 'RFA-SHOP' | 'RFA-GEN' | 'RFA-MAT'
  status: string
  siteId: string | 'ALL'
  latestOnly: boolean
  categoryId: string | 'ALL';
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
  const [filteredDocuments, setFilteredDocuments] = useState<RFADocument[]>([]);
  const [loading, setLoading] = useState(true)
  const [selectedDocument, setSelectedDocument] = useState<RFADocument | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [categories, setCategories] = useState<Category[]>([]);
  
  // ✅ 1. เพิ่ม State สำหรับควบคุม Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [filters, setFilters] = useState<Filters>({
    rfaType: (searchParams.get('type') as Filters['rfaType']) || 'ALL',
    status: 'ALL',
    siteId: 'ALL',
    latestOnly: true,
    categoryId: 'ALL',
  })

  useEffect(() => {
    const typeFromUrl = (searchParams.get('type') as Filters['rfaType']) || 'ALL';
    if (typeFromUrl !== filters.rfaType) {
      handleFilterChange('rfaType', typeFromUrl);
    }
  }, [searchParams]);

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
      loadDocuments();
      loadCategories();
    }
  }, [firebaseUser, filters])

  const loadDocuments = async () => {
    if (!firebaseUser) return
    setLoading(true)
    try {
      const token = await firebaseUser.getIdToken()
      const queryParams = new URLSearchParams()
      // ส่ง filter ทั้งหมดไปให้ API
      Object.entries(filters).forEach(([key, value]) => {
        queryParams.append(key, String(value))
      })
      
      const response = await fetch(`/api/rfa/list?${queryParams}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const data = await response.json()
      if (data.success) {
        setAllDocuments(data.documents)
      } else {
        console.error('Failed to load documents:', data.error)
        setAllDocuments([])
      }
    } catch (error) {
      console.error('Error loading documents:', error)
      setAllDocuments([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let docs = [...allDocuments];
    if (searchTerm.trim()) {
        const search = searchTerm.toLowerCase();
        docs = docs.filter((doc: RFADocument) => 
            doc.documentNumber.toLowerCase().includes(search) ||
            doc.title.toLowerCase().includes(search)
        );
    }
    setFilteredDocuments(docs);
  }, [searchTerm, allDocuments]);

  const handleFilterChange = (key: keyof Filters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const resetFilters = () => {
    setFilters({ rfaType: 'ALL', status: 'ALL', siteId: 'ALL', latestOnly: true, categoryId: 'ALL' })
    setSearchTerm('')
  }
  
  // ✅ 2. เปลี่ยน handleCreateClick ให้เป็นการเปิด Modal
  const handleCreateClick = () => {
    setIsCreateModalOpen(true);
  };

  // ✅ 3. สร้างฟังก์ชันสำหรับปิด Modal และโหลดข้อมูลใหม่
  const handleModalClose = () => {
    setIsCreateModalOpen(false);
    loadDocuments(); 
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
              <button onClick={loadDocuments} className="flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200" disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                รีเฟรช
              </button>
              <button onClick={handleCreateClick} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                สร้าง RFA
              </button>
            </div>
          </div>

          <DashboardStats 
            onChartFilter={handleChartFilter}
            activeFilters={filters}
            categories={categories}
          />

          {/* Filters Section */}
          <div className="bg-white rounded-lg shadow mb-6 p-4">
             {/* ... (Filter JSX remains the same) ... */}
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
              onDocumentClick={setSelectedDocument}
              getStatusColor={getStatusColor}
              statusLabels={STATUS_LABELS}
              getRFATypeColor={getRFATypeColor}
            />
          )}

          {/* ✅ 4. เพิ่ม Modal สำหรับสร้างเอกสาร */}
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

          {/* Detail Modal */}
          {selectedDocument && (
            <RFADetailModal
              document={selectedDocument}
              onClose={() => setSelectedDocument(null)}
              onUpdate={(updatedDoc) => {
                setAllDocuments(prev => prev.map(doc => doc.id === updatedDoc.id ? updatedDoc : doc))
                setSelectedDocument(updatedDoc)
              }}
            />
          )}
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