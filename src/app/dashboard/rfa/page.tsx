'use client'

import { useState, useEffect, Suspense } from 'react'
import { useAuth } from '@/lib/auth/useAuth'
import { AuthGuard } from '@/lib/components/shared/AuthGuard'
import Layout from '@/components/layout/Layout'
import RFAListTable from '@/components/rfa/RFAListTable'
import RFADetailModal from '@/components/rfa/RFADetailModal'
import CreateRFAForm from '@/components/rfa/CreateRFAForm' 
import { FileText, Plus, Filter, Search, BarChart3, RefreshCw } from 'lucide-react'
import { RFADocument } from '@/types/rfa'
import { useSearchParams, useRouter } from 'next/navigation'

interface Filters {
  rfaType: 'ALL' | 'RFA-SHOP' | 'RFA-GEN' | 'RFA-MAT'
  status: 'ALL' | 'DRAFT' | 'PENDING_SITE_ADMIN' | 'PENDING_CM' | 'APPROVED' | 'REJECTED'
  siteId: string | 'ALL'
}

function RFAContent() {
  const { user, firebaseUser } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const rfaTypeParam = searchParams.get('type') as Filters['rfaType'] | null

  const [documents, setDocuments] = useState<RFADocument[]>([])
  const [filteredDocuments, setFilteredDocuments] = useState<RFADocument[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDocument, setSelectedDocument] = useState<RFADocument | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
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
    draft: 0,
    assignedToMe: 0
  })

  useEffect(() => {
    if (firebaseUser) {
      loadDocuments()
    }
  }, [firebaseUser])
  
  useEffect(() => {
    if (rfaTypeParam) {
      setFilters(prev => ({ ...prev, rfaType: rfaTypeParam }))
    }
  }, [rfaTypeParam]);

  useEffect(() => {
    applyFilters()
  }, [documents, filters, searchTerm])

  useEffect(() => {
    calculateStats()
  }, [documents])

  const loadDocuments = async () => {
    if (!firebaseUser) return;
    try {
      setLoading(true)
      const token = await firebaseUser.getIdToken();
      const queryParams = new URLSearchParams()
      const response = await fetch(`/api/rfa/list?${queryParams}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (response.ok && data.success) {
        setDocuments(data.documents)
      } else {
        console.error('Failed to load documents:', data.error || response.statusText)
      }
    } catch (error) {
      console.error('Error loading documents:', error)
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = [...documents]
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(doc => 
        doc.documentNumber.toLowerCase().includes(search) ||
        doc.title.toLowerCase().includes(search) ||
        doc.site.name.toLowerCase().includes(search) ||
        doc.category.categoryCode.toLowerCase().includes(search)
      )
    }
    if (filters.rfaType !== 'ALL') {
      filtered = filtered.filter(doc => doc.rfaType === filters.rfaType)
    }
    if (filters.status !== 'ALL') {
      filtered = filtered.filter(doc => doc.status === filters.status)
    }
    if (filters.siteId !== 'ALL') {
      filtered = filtered.filter(doc => doc.site.id === filters.siteId)
    }
    setFilteredDocuments(filtered)
  }

  const calculateStats = () => {
    const stats = {
      total: documents.length,
      pending: documents.filter(doc => ['PENDING_SITE_ADMIN', 'PENDING_CM'].includes(doc.status)).length,
      approved: documents.filter(doc => doc.status === 'APPROVED').length,
      draft: documents.filter(doc => doc.status === 'DRAFT').length,
      assignedToMe: documents.filter(doc => doc.assignedTo === user?.id).length
    }
    setStats(stats)
  }

  const handleFilterChange = (key: keyof Filters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'text-green-600 bg-green-50'
      case 'REJECTED': return 'text-red-600 bg-red-50'
      case 'PENDING_CM': return 'text-orange-600 bg-orange-50'
      case 'PENDING_SITE_ADMIN': return 'text-blue-600 bg-blue-50'
      case 'DRAFT': return 'text-gray-600 bg-gray-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'อนุมัติแล้ว'
      case 'REJECTED': return 'ไม่อนุมัติ'
      case 'PENDING_CM': return 'รออนุมัติ CM'
      case 'PENDING_SITE_ADMIN': return 'รออนุมัติ Site Admin'
      case 'DRAFT': return 'ร่าง'
      default: return status
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
          {/* Page Header */}
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

          {/* Statistics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
             <div className="bg-white p-4 rounded-lg shadow"><div className="flex items-center"><FileText className="w-8 h-8 text-blue-500" /><div className="ml-3"><p className="text-2xl font-bold text-gray-900">{stats.total}</p><p className="text-gray-600 text-sm">ทั้งหมด</p></div></div></div>
            <div className="bg-white p-4 rounded-lg shadow"><div className="flex items-center"><BarChart3 className="w-8 h-8 text-orange-500" /><div className="ml-3"><p className="text-2xl font-bold text-gray-900">{stats.pending}</p><p className="text-gray-600 text-sm">รออนุมัติ</p></div></div></div>
            <div className="bg-white p-4 rounded-lg shadow"><div className="flex items-center"><div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center"><span className="text-green-600 font-bold">✓</span></div><div className="ml-3"><p className="text-2xl font-bold text-gray-900">{stats.approved}</p><p className="text-gray-600 text-sm">อนุมัติแล้ว</p></div></div></div>
            <div className="bg-white p-4 rounded-lg shadow"><div className="flex items-center"><div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center"><span className="text-gray-600 font-bold">📝</span></div><div className="ml-3"><p className="text-2xl font-bold text-gray-900">{stats.draft}</p><p className="text-gray-600 text-sm">ร่าง</p></div></div></div>
            <div className="bg-white p-4 rounded-lg shadow"><div className="flex items-center"><div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center"><span className="text-purple-600 font-bold">👤</span></div><div className="ml-3"><p className="text-2xl font-bold text-gray-900">{stats.assignedToMe}</p><p className="text-gray-600 text-sm">มอบหมายให้ฉัน</p></div></div></div>
          </div>

          {/* Filters Section */}
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="p-4 border-b border-gray-200">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                {/* Search */}
                <div className="flex-1 max-w-md">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="ค้นหาเลขที่เอกสาร, ชื่อเอกสาร, หมวดหมู่..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Mobile Filter Toggle */}
                <button
                  onClick={() => setShowMobileFilters(!showMobileFilters)}
                  className="lg:hidden flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg"
                >
                  <Filter className="w-4 h-4 mr-2" />
                  ตัวกรอง
                </button>

                {/* Desktop Filters */}
                <div className="hidden lg:flex items-center space-x-4">
                  <select
                    value={filters.rfaType}
                    onChange={(e) => handleFilterChange('rfaType', e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ALL">ทุกประเภท</option>
                    <option value="RFA-SHOP">RFA-SHOP</option>
                    <option value="RFA-GEN">RFA-GEN</option>
                    <option value="RFA-MAT">RFA-MAT</option>
                  </select>

                  <select
                    value={filters.status}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ALL">ทุกสถานะ</option>
                    <option value="DRAFT">ร่าง</option>
                    <option value="PENDING_SITE_ADMIN">รออนุมัติ Site Admin</option>
                    <option value="PENDING_CM">รออนุมัติ CM</option>
                    <option value="APPROVED">อนุมัติแล้ว</option>
                    <option value="REJECTED">ไม่อนุมัติ</option>
                  </select>

                  <button
                    onClick={resetFilters}
                    className="flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    รีเซ็ต
                  </button>
                </div>
              </div>

              {/* Mobile Filters */}
              {showMobileFilters && (
                <div className="lg:hidden mt-4 pt-4 border-t border-gray-200 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
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
                      <option value="DRAFT">ร่าง</option>
                      <option value="PENDING_SITE_ADMIN">รออนุมัติ Site Admin</option>
                      <option value="PENDING_CM">รออนุมัติ CM</option>
                      <option value="APPROVED">อนุมัติแล้ว</option>
                      <option value="REJECTED">ไม่อนุมัติ</option>
                    </select>
                  </div>

                  <button
                    onClick={resetFilters}
                    className="w-full flex items-center justify-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    รีเซ็ตตัวกรอง
                  </button>
                </div>
              )}
            </div>
            
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  แสดง {filteredDocuments.length} จากทั้งหมด {documents.length} เอกสาร
                </p>
                
                {(searchTerm || filters.rfaType !== 'ALL' || filters.status !== 'ALL') && (
                  <button
                    onClick={resetFilters}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    ล้างตัวกรอง
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Document List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-600">กำลังโหลดเอกสาร...</p>
              </div>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {documents.length === 0 ? 'ยังไม่มีเอกสาร RFA' : 'ไม่พบเอกสารที่ตรงกับเงื่อนไข'}
              </h3>
              <p className="text-gray-600 mb-4">
                {documents.length === 0 
                  ? 'เริ่มต้นด้วยการสร้างเอกสาร RFA แรก'
                  : 'ลองปรับเงื่อนไขการค้นหาหรือตัวกรอง'
                }
              </p>
              {documents.length === 0 && (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  สร้าง RFA แรก
                </button>
              )}
            </div>
          ) : (
            <RFAListTable
              documents={filteredDocuments}
              onDocumentClick={setSelectedDocument}
              getStatusColor={getStatusColor}
              getStatusText={getStatusText}
              getRFATypeColor={getRFATypeColor}
            />
          )}

          {/* Create RFA Modal */}
          {showCreateForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-screen overflow-hidden">
                <CreateRFAForm
                  onClose={() => {
                    setShowCreateForm(false)
                    loadDocuments() // Refresh list after creation
                  }}
                  isModal={true}
                  userProp={user ? {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    sites: user.sites || []
                  } : undefined}
                />
              </div>
            </div>
          )}

          {/* Document Detail Modal */}
          {selectedDocument && (
            <RFADetailModal
              document={selectedDocument}
              onClose={() => setSelectedDocument(null)}
              onUpdate={(updatedDoc) => {
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
    <Suspense fallback={<div>Loading Filters...</div>}>
      <RFAContent />
    </Suspense>
  )
}