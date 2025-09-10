// src/app/dashboard/rfa/page.tsx (ยกเครื่องใหม่)
'use client'

import { useState, useEffect, Suspense, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/useAuth'
import { AuthGuard } from '@/lib/components/shared/AuthGuard'
import Layout from '@/components/layout/Layout'
import RFAListTable from '@/components/rfa/RFAListTable'
import RFADetailModal from '@/components/rfa/RFADetailModal'
import DashboardStats from '@/components/rfa/DashboardStats'
import { RFADocument } from '@/types/rfa'
import { STATUSES, STATUS_LABELS } from '@/lib/config/workflow' 
import { Plus, Search, RefreshCw } from 'lucide-react'

// --- เพิ่ม: categoryId ใน interface ---
interface Filters {
  rfaType: 'ALL' | 'RFA-SHOP' | 'RFA-GEN' | 'RFA-MAT'
  status: string
  siteId: string | 'ALL'
  latestOnly: boolean
  categoryId: string | 'ALL'; // <-- เพิ่ม field นี้
}

interface Category {
  id: string;
  categoryCode: string;
  categoryName: string;
}

function RFAContent() {
  const { user, firebaseUser } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [allDocuments, setAllDocuments] = useState<RFADocument[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<RFADocument[]>([]);

  const [loading, setLoading] = useState(true)
  const [selectedDocument, setSelectedDocument] = useState<RFADocument | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [categories, setCategories] = useState<Category[]>([]); // <-- เพิ่ม State สำหรับเก็บหมวดงาน

  const [filters, setFilters] = useState<Filters>({
    rfaType: (searchParams.get('type') as Filters['rfaType']) || 'ALL',
    status: 'ALL',
    siteId: 'ALL',
    latestOnly: true,
    categoryId: 'ALL', // <-- เพิ่มค่าเริ่มต้น
  })

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
      Object.entries(filters).forEach(([key, value]) => {
        queryParams.append(key, String(value))
      })
      
      const response = await fetch(`/api/rfa/list?${queryParams}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const data = await response.json()
      if (data.success) {
        setAllDocuments(data.documents) // <-- เก็บข้อมูลดิบไว้ที่นี่
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
  
  // (Function อื่นๆ เช่น handleCreateClick, getStatusColor, etc. ยังคงเดิม)
  const handleCreateClick = () => {
    const type = filters.rfaType;
    if (type && type !== 'ALL') {
      const path = `/rfa/${type.replace('RFA-', '').toLowerCase()}/create`;
      router.push(path);
    } else {
      router.push('/dashboard/rfa/create');
    }
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
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">📋 RFA Documents</h1>
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

          {/* --- Dashboard Charts --- */}
          <DashboardStats 
            onChartFilter={handleChartFilter}
            activeFilters={filters}
            categories={categories}
          />

          {/* --- Filters Section --- */}
          <div className="bg-white rounded-lg shadow mb-6 p-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-4">
                <label className="text-sm font-medium text-gray-700">ค้นหา</label>
                <div className="relative mt-1">
                   <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                   <input
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
                    {/* --- ✅ 2. แก้ไขการสร้าง Option ตรงนี้ --- */}
                    {Object.values(STATUSES).map(statusKey => (
                      <option key={statusKey} value={statusKey}>
                        {STATUS_LABELS[statusKey] || statusKey}
                      </option>
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

               <div className="md:col-span-2 flex items-center h-10">
                 <input
                    id="latest-only"
                    type="checkbox"
                    checked={filters.latestOnly}
                    onChange={(e) => handleFilterChange('latestOnly', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <label htmlFor="latest-only" className="ml-2 text-sm text-gray-700">แสดงเฉพาะฉบับล่าสุด</label>
              </div>
              <div className="md:col-span-2">
                 <button onClick={resetFilters} className="w-full px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">
                    รีเซ็ต
                  </button>
              </div>
            </div>
          </div>
          
          {/* --- Document Table --- */}
          {loading ? (
             <div className="text-center p-8">กำลังโหลดเอกสาร...</div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center bg-white rounded-lg shadow p-8">
              <p className="text-gray-500">ไม่พบเอกสารที่ตรงกับเงื่อนไข</p>
            </div>
          ) : (
            <RFAListTable
              documents={filteredDocuments} // <-- แสดงผลจาก State ที่กรองแล้ว
              onDocumentClick={setSelectedDocument}
              getStatusColor={getStatusColor}
              statusLabels={STATUS_LABELS}
              getRFATypeColor={getRFATypeColor}
            />
          )}

          {/* Modal */}
          {selectedDocument && (
            <RFADetailModal
              document={selectedDocument}
              onClose={() => setSelectedDocument(null)}
              onUpdate={(updatedDoc) => {
                // When a document is updated in the modal, we need to update both lists.
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