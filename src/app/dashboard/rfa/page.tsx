// src/app/dashboard/rfa/page.tsx
'use client'

import { useState, useEffect, Suspense } from 'react'
import { useAuth } from '@/lib/auth/useAuth'
import { AuthGuard } from '@/lib/components/shared/AuthGuard'
import Layout from '@/components/layout/Layout'
import RFAListTable from '@/components/rfa/RFAListTable'
import RFADetailModal from '@/components/rfa/RFADetailModal'
import { FileText, Plus, Filter, Search, BarChart3, RefreshCw } from 'lucide-react'
import { RFADocument } from '@/types/rfa'
import { useSearchParams, useRouter } from 'next/navigation'
// --- 1. Import ค่าคงที่ STATUSES ---
import { STATUSES } from '@/lib/config/workflow'


interface Filters {
  rfaType: 'ALL' | 'RFA-SHOP' | 'RFA-GEN' | 'RFA-MAT'
  status: string // เปลี่ยนเป็น string เพื่อรองรับค่า 'ALL' และค่าจาก STATUSES
  siteId: string | 'ALL'
}

function RFAContent() {
  const { user, firebaseUser } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const rfaTypeParam = searchParams.get('type') as Filters['rfaType'] | null

  const [documents, setDocuments] = useState<RFADocument[]>([])
  // ไม่ต้องใช้ filteredDocuments แล้ว เพราะจะให้ API กรองมาให้
  const [loading, setLoading] = useState(true)
  const [selectedDocument, setSelectedDocument] = useState<RFADocument | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  
  const [filters, setFilters] = useState<Filters>({
    rfaType: rfaTypeParam || 'ALL',
    status: 'ALL',
    siteId: 'ALL'
  })

  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    draft: 0, // อาจจะเอาออกถ้าไม่ได้ใช้แล้ว
    assignedToMe: 0
  })

  // --- 2. ปรับปรุง useEffect ให้เรียก loadDocuments เมื่อ filter เปลี่ยน ---
  useEffect(() => {
    if (firebaseUser) {
      loadDocuments()
    }
  }, [firebaseUser, filters]) // ให้เรียกใหม่ทุกครั้งที่ filter เปลี่ยน
  
  useEffect(() => {
    if (rfaTypeParam) {
      setFilters(prev => ({ ...prev, rfaType: rfaTypeParam }))
    }
  }, [rfaTypeParam]);

  // ลบ useEffect ของ applyFilters ออก

  useEffect(() => {
    calculateStats()
  }, [documents])

  // --- 3. ปรับปรุง loadDocuments ให้ส่ง Filter ไปกับ Request ---
  const loadDocuments = async () => {
    if (!firebaseUser) return;
    try {
      setLoading(true)
      const token = await firebaseUser.getIdToken();
      
      const queryParams = new URLSearchParams()
      queryParams.append('rfaType', filters.rfaType)
      queryParams.append('status', filters.status)
      queryParams.append('siteId', filters.siteId)
      // สามารถเพิ่ม searchTerm ได้ถ้า API รองรับ
      // queryParams.append('search', searchTerm)

      const response = await fetch(`/api/rfa/list?${queryParams}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (response.ok && data.success) {
        // กรอง searchTerm ในฝั่ง Client ชั่วคราวก่อน
        let finalDocs = data.documents;
        if (searchTerm.trim()) {
            const search = searchTerm.toLowerCase();
            finalDocs = finalDocs.filter((doc: RFADocument) => 
                doc.documentNumber.toLowerCase().includes(search) ||
                doc.title.toLowerCase().includes(search)
            );
        }
        setDocuments(finalDocs)

      } else {
        console.error('Failed to load documents:', data.error || response.statusText)
        setDocuments([]) // Clear documents on error
      }
    } catch (error) {
      console.error('Error loading documents:', error)
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }

  const calculateStats = () => {
    // Logic การคำนวณ stats อาจจะต้องดึงข้อมูลแยกอีกที หรือใช้ข้อมูลที่ได้มา
    // สำหรับตอนนี้ยังใช้ documents ที่ fetch มาได้
    const pendingStatuses = [STATUSES.PENDING_REVIEW, STATUSES.PENDING_CM_APPROVAL]
    const approvedStatuses = [STATUSES.APPROVED, STATUSES.APPROVED_WITH_COMMENTS, STATUSES.APPROVED_REVISION_REQUIRED]

    const newStats = {
      total: documents.length, // อาจจะไม่ใช่ทั้งหมดถ้ามี pagination
      pending: documents.filter(doc => pendingStatuses.includes(doc.status)).length,
      approved: documents.filter(doc => approvedStatuses.includes(doc.status)).length,
      draft: 0, // ไม่มีสถานะ Draft แล้ว
      assignedToMe: documents.filter(doc => doc.assignedTo === user?.id).length
    }
    setStats(newStats)
  }

  const handleFilterChange = (key: keyof Filters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const handleSearch = (e: React.FormEvent) => {
      e.preventDefault();
      loadDocuments(); // เรียก load document เพื่อ re-filter
  }

  const resetFilters = () => {
    setFilters({
      rfaType: 'ALL',
      status: 'ALL',
      siteId: 'ALL'
    })
    setSearchTerm('')
    router.push('/dashboard/rfa')
  }
  
  const handleCreateClick = () => {
    const type = filters.rfaType;
    if (type && type !== 'ALL') {
      const path = `/rfa/${type.replace('RFA-', '').toLowerCase()}/create`;
      router.push(path);
    } else {
      router.push('/dashboard/rfa/create');
    }
  };

  // --- 4. อัปเดต getStatusText และ getStatusColor ให้ตรงกับ Workflow ใหม่ ---
  const getStatusText = (status: string) => {
    return Object.entries(STATUSES).find(([key, value]) => value === status)?.[1] || status;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case STATUSES.APPROVED:
      case STATUSES.APPROVED_WITH_COMMENTS:
      case STATUSES.APPROVED_REVISION_REQUIRED:
        return 'text-green-600 bg-green-50'
      case STATUSES.REJECTED:
        return 'text-red-600 bg-red-50'
      case STATUSES.PENDING_CM_APPROVAL:
        return 'text-orange-600 bg-orange-50'
      case STATUSES.PENDING_REVIEW:
        return 'text-blue-600 bg-blue-50'
      case STATUSES.REVISION_REQUIRED:
          return 'text-yellow-600 bg-yellow-50'
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
          {/* Page Header (ไม่เปลี่ยนแปลง) */}
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-2">
                  📋 RFA Documents
                </h1>
                <p className="text-gray-600">
                  จัดการเอกสาร Request for Approval
                </p>
              </div>
              
              <div className="flex items-center space-x-3 mt-4 sm:mt-0">
                <button
                  onClick={() => loadDocuments()}
                  className="flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  disabled={loading}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  รีเฟรช
                </button>
                
                <button
                  onClick={handleCreateClick}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  สร้าง RFA
                </button>
              </div>
            </div>
          </div>

          {/* Statistics Cards (ไม่เปลี่ยนแปลง) */}
           <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
             <div className="bg-white p-4 rounded-lg shadow"><div className="flex items-center"><FileText className="w-8 h-8 text-blue-500" /><div className="ml-3"><p className="text-2xl font-bold text-gray-900">{stats.total}</p><p className="text-gray-600 text-sm">ทั้งหมด</p></div></div></div>
            <div className="bg-white p-4 rounded-lg shadow"><div className="flex items-center"><BarChart3 className="w-8 h-8 text-orange-500" /><div className="ml-3"><p className="text-2xl font-bold text-gray-900">{stats.pending}</p><p className="text-gray-600 text-sm">รออนุมัติ</p></div></div></div>
            <div className="bg-white p-4 rounded-lg shadow"><div className="flex items-center"><div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center"><span className="text-green-600 font-bold">✓</span></div><div className="ml-3"><p className="text-2xl font-bold text-gray-900">{stats.approved}</p><p className="text-gray-600 text-sm">อนุมัติแล้ว</p></div></div></div>
            <div className="bg-white p-4 rounded-lg shadow"><div className="flex items-center"><div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center"><span className="text-gray-600 font-bold">📝</span></div><div className="ml-3"><p className="text-2xl font-bold text-gray-900">{stats.draft}</p><p className="text-gray-600 text-sm">ร่าง</p></div></div></div>
            <div className="bg-white p-4 rounded-lg shadow"><div className="flex items-center"><div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center"><span className="text-purple-600 font-bold">👤</span></div><div className="ml-3"><p className="text-2xl font-bold text-gray-900">{stats.assignedToMe}</p><p className="text-gray-600 text-sm">มอบหมายให้ฉัน</p></div></div></div>
          </div>
          {/* Filters Section */}
          <div className="bg-white rounded-lg shadow mb-6">
            <form onSubmit={handleSearch} className="p-4 border-b border-gray-200">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                {/* Search */}
                <div className="flex-1 max-w-md">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="ค้นหาเลขที่เอกสาร, ชื่อเอกสาร..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>

                {/* --- 5. อัปเดต Status Filter ให้ใช้ค่าจาก STATUSES --- */}
                <div className="hidden lg:flex items-center space-x-4">
                  <select
                    value={filters.rfaType}
                    onChange={(e) => handleFilterChange('rfaType', e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="ALL">ทุกประเภท</option>
                    <option value="RFA-SHOP">RFA-SHOP</option>
                    <option value="RFA-GEN">RFA-GEN</option>
                    <option value="RFA-MAT">RFA-MAT</option>
                  </select>

                  <select
                    value={filters.status}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="ALL">ทุกสถานะ</option>
                    {Object.values(STATUSES).map(status => (
                        <option key={status} value={status}>{status}</option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={resetFilters}
                    className="flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    รีเซ็ต
                  </button>
                </div>
              </div>
            </form>
            
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
               <p className="text-sm text-gray-600">
                  แสดง {documents.length} เอกสาร
                </p>
            </div>
          </div>

          {/* Document List */}
          {loading ? (
             <div className="text-center py-12"><p>กำลังโหลดเอกสาร...</p></div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12"><p>ไม่พบเอกสาร</p></div>
          ) : (
            <RFAListTable
              documents={documents} // ใช้ documents ที่กรองแล้ว
              onDocumentClick={setSelectedDocument}
              getStatusColor={getStatusColor}
              getStatusText={getStatusText}
              getRFATypeColor={getRFATypeColor}
            />
          )}

          {/* Modals */}
          {selectedDocument && (
            <RFADetailModal
              document={selectedDocument}
              onClose={() => setSelectedDocument(null)}
              onUpdate={(updatedDoc) => {
                // อัปเดต state ใน list ทันทีหลัง action
                setDocuments(prev => 
                  prev.map(doc => doc.id === updatedDoc.id ? updatedDoc : doc)
                )
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