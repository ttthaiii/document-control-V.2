// src/components/rfa/RFADetailModal.tsx
'use client'

import React, { useState } from 'react'
import { 
  X, 
  FileText, 
  Download, 
  User, 
  Building, 
  Calendar, 
  Tag, 
  CheckCircle, 
  XCircle, 
  Clock,
  ArrowRight,
  MessageSquare,
  Upload
} from 'lucide-react'
import { useAuth } from '@/lib/auth/useAuth'
import { RFADocument } from '@/types/rfa'

interface RFADetailModalProps {
  document: RFADocument
  onClose: () => void
  onUpdate: (updatedDocument: RFADocument) => void
}

export default function RFADetailModal({ document: rfaDocument, onClose, onUpdate }: RFADetailModalProps) {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'details' | 'files' | 'workflow'>('details')
  const [isProcessing, setIsProcessing] = useState(false)
  const [comments, setComments] = useState('')
  const [showApprovalSection, setShowApprovalSection] = useState(false)

  // Helper functions
  const downloadFile = (file: any) => {
    const downloadUrl = file.fileUrl
    const link = window.document.createElement('a')
    link.href = downloadUrl
    link.download = file.fileName
    link.target = '_blank'
    window.document.body.appendChild(link)
    link.click()
    window.document.body.removeChild(link)
  }

  const getWorkflowStepText = (step: string) => {
    switch (step) {
      case 'BIM_DRAFT': return 'สร้างเอกสาร'
      case 'SITE_ADMIN_REVIEW': return 'ตรวจสอบโดย Site Admin'
      case 'CM_APPROVAL': return 'อนุมัติโดย CM'
      default: return step
    }
  }

  const formatDate = (date: Date | string) => {
    const d = new Date(date)
    return d.toLocaleDateString('th-TH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'text-green-600 bg-green-50 border-green-200'
      case 'REJECTED': return 'text-red-600 bg-red-50 border-red-200'
      case 'PENDING_CM': return 'text-orange-600 bg-orange-50 border-orange-200'
      case 'PENDING_SITE_ADMIN': return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'DRAFT': return 'text-gray-600 bg-gray-50 border-gray-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
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

  const handleAction = async (action: 'approve' | 'reject' | 'forward' | 'return_to_creator', comments?: string) => {
    try {
      setIsProcessing(true)

      const response = await fetch(`/api/rfa/${rfaDocument.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action,
          comments: comments || undefined
        })
      })

      const data = await response.json()

      if (data.success) {
        // Refresh document data
        const updatedResponse = await fetch(`/api/rfa/${rfaDocument.id}`)
        const updatedData = await updatedResponse.json()
        
        if (updatedData.success) {
          onUpdate(updatedData.document)
        }
        
        setComments('')
        setShowApprovalSection(false)
      } else {
        alert('เกิดข้อผิดพลาด: ' + (data.error || 'ไม่สามารถดำเนินการได้'))
      }
    } catch (error) {
      console.error('Error processing action:', error)
      alert('เกิดข้อผิดพลาดในการดำเนินการ')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {rfaDocument.documentNumber}
              </h2>
              <p className="text-gray-600">{rfaDocument.title}</p>
            </div>
            
            <div className="flex items-center space-x-3">
              <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(rfaDocument.status)}`}>
                {getStatusText(rfaDocument.status)}
              </span>
              
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {['details', 'files', 'workflow'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`flex-1 px-4 py-3 text-sm font-medium ${
                activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'details' && '📋 รายละเอียด'}
              {tab === 'files' && '📁 ไฟล์แนบ'}
              {tab === 'workflow' && '🔄 ขั้นตอนการทำงาน'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto max-h-96">
          {/* Details Tab */}
          {activeTab === 'details' && (
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Document Information */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">ข้อมูลเอกสาร</h3>
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <Tag className="w-4 h-4 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">ประเภท</p>
                        <p className="text-sm text-gray-600">{rfaDocument.rfaType}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center">
                      <Building className="w-4 h-4 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">โครงการ</p>
                        <p className="text-sm text-gray-600">{rfaDocument.site.name}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center">
                      <FileText className="w-4 h-4 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">หมวดหมู่</p>
                        <p className="text-sm text-gray-600">
                          {rfaDocument.category.categoryCode} - {rfaDocument.category.categoryName}
                        </p>
                      </div>
                    </div>

                    {rfaDocument.revisionNumber && (
                      <div className="flex items-center">
                        <span className="w-4 h-4 text-gray-400 mr-3">🔄</span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">Revision</p>
                          <p className="text-sm text-gray-600">Rev. {rfaDocument.revisionNumber}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* User Information */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">ข้อมูลผู้ใช้</h3>
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <User className="w-4 h-4 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">ผู้สร้าง</p>
                        <p className="text-sm text-gray-600">
                          {rfaDocument.createdByInfo.email} ({rfaDocument.createdByInfo.role})
                        </p>
                      </div>
                    </div>
                    
                    {rfaDocument.assignedUserInfo && (
                      <div className="flex items-center">
                        <User className="w-4 h-4 text-gray-400 mr-3" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">ผู้รับผิดชอบ</p>
                          <p className="text-sm text-gray-600">
                            {rfaDocument.assignedUserInfo.email} ({rfaDocument.assignedUserInfo.role})
                          </p>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">วันที่สร้าง</p>
                        <p className="text-sm text-gray-600">{formatDate(rfaDocument.createdAt)}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">อัปเดตล่าสุด</p>
                        <p className="text-sm text-gray-600">{formatDate(rfaDocument.updatedAt)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description */}
              {rfaDocument.description && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">รายละเอียด</h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-gray-700 whitespace-pre-wrap">{rfaDocument.description}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Files Tab */}
          {activeTab === 'files' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  ไฟล์แนบ ({rfaDocument.filesCount} ไฟล์)
                </h3>
                
                {rfaDocument.permissions.canAddFiles && (
                  <button className="inline-flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    <Upload className="w-4 h-4 mr-2" />
                    เพิ่มไฟล์
                  </button>
                )}
              </div>

              {rfaDocument.files.length > 0 ? (
                <div className="space-y-3">
                  {rfaDocument.files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border"
                    >
                      <div className="flex items-center space-x-3">
                        <FileText className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {file.fileName}
                          </p>
                          <div className="flex items-center space-x-4 text-xs text-gray-500">
                            <span>{formatFileSize(file.size)}</span>
                            <span>อัปโหลดโดย: {file.uploadedBy}</span>
                            <span>{formatDate(file.uploadedAt)}</span>
                          </div>
                        </div>
                      </div>
                      
                      {rfaDocument.permissions.canDownloadFiles && (
                        <button
                          onClick={() => downloadFile(file)}
                          className="inline-flex items-center px-3 py-1 bg-white border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Download className="w-4 h-4 mr-1" />
                          ดาวน์โหลด
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">ไม่มีไฟล์แนบ</p>
                </div>
              )}
            </div>
          )}

          {/* Workflow Tab */}
          {activeTab === 'workflow' && (
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">ขั้นตอนการทำงาน</h3>
              
              {rfaDocument.workflow.length > 0 ? (
                <div className="space-y-4">
                  {rfaDocument.workflow.map((step, index) => (
                    <div key={index} className="flex items-start space-x-4">
                      <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-600 font-bold text-sm">{index + 1}</span>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <p className="text-sm font-medium text-gray-900">
                            {getWorkflowStepText(step.step)}
                          </p>
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(step.status)}`}>
                            {getStatusText(step.status)}
                          </span>
                        </div>
                        
                        <div className="text-sm text-gray-600">
                          <p>โดย: {step.userId} ({step.userRole})</p>
                          <p>เวลา: {formatDate(step.timestamp)}</p>
                          {step.comments && (
                            <div className="mt-2 p-2 bg-gray-50 rounded border-l-4 border-blue-500">
                              <p className="text-sm">{step.comments}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">ยังไม่มีประวัติการทำงาน</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex flex-col space-y-4">
            {/* Approval Section */}
            {(rfaDocument.permissions.canApprove || rfaDocument.permissions.canReject) && (
              <div className="space-y-3">
                {!showApprovalSection ? (
                  <button
                    onClick={() => setShowApprovalSection(true)}
                    className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    ดำเนินการอนุมัติ/ไม่อนุมัติ
                  </button>
                ) : (
                  <div className="space-y-3">
                    <textarea
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                      placeholder="ความคิดเห็น (ไม่บังคับ)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      rows={3}
                    />
                    
                    <div className="flex items-center justify-end space-x-3">
                      <button
                        onClick={() => {
                          setShowApprovalSection(false)
                          setComments('')
                        }}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800"
                        disabled={isProcessing}
                      >
                        ยกเลิก
                      </button>
                      
                      {rfaDocument.permissions.canReject && (
                        <button
                          onClick={() => handleAction('reject', comments)}
                          disabled={isProcessing}
                          className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          {isProcessing ? 'กำลังดำเนินการ...' : 'ไม่อนุมัติ'}
                        </button>
                      )}
                      
                      {rfaDocument.permissions.canApprove && (
                        <button
                          onClick={() => handleAction('approve', comments)}
                          disabled={isProcessing}
                          className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          {isProcessing ? 'กำลังดำเนินการ...' : 'อนุมัติ'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Other Action Buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {rfaDocument.permissions.canForward && (
                  <button
                    onClick={() => handleAction('forward')}
                    disabled={isProcessing}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    <ArrowRight className="w-4 h-4 mr-2" />
                    ส่งต่อ
                  </button>
                )}

                {rfaDocument.permissions.canEdit && (
                  <button
                    className="inline-flex items-center px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    แก้ไข
                  </button>
                )}
              </div>

              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}