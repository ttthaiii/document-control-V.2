// src/components/rfa/RFAListTable.tsx
'use client'

import React, { useState, useEffect } from 'react'
import { 
  FileText, 
  Calendar, 
  User, 
  Download, 
  Eye,
  ChevronDown,
  Clock,
  Building,
  Tag
} from 'lucide-react'

import { RFADocument } from '@/types/rfa'


interface RFAListTableProps {
  documents: RFADocument[]
  onDocumentClick: (document: RFADocument) => void
  getStatusColor: (status: string) => string
  getStatusText: (status: string) => string
  getRFATypeColor: (type: string) => string
}

export default function RFAListTable({
  documents,
  onDocumentClick,
  getStatusColor,
  getStatusText,
  getRFATypeColor
}: RFAListTableProps) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    
    checkIsMobile()
    window.addEventListener('resize', checkIsMobile)
    return () => window.removeEventListener('resize', checkIsMobile)
  }, [])

  const formatDate = (date: Date | string) => {
    const d = new Date(date)
    return d.toLocaleDateString('th-TH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const calculatePendingDays = (document: RFADocument) => {
    const lastUpdate = new Date(document.updatedAt)
    const today = new Date()
    const diffTime = today.getTime() - lastUpdate.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  const getResponsibleUser = (document: RFADocument) => {
    if (document.assignedTo && document.assignedUserInfo) {
      return document.assignedUserInfo.email.split('@')[0]
    }
    
    // Fallback based on current step
    switch (document.currentStep) {
      case 'SITE_ADMIN_REVIEW':
        return 'Site Admin'
      case 'CM_APPROVAL':
        return 'CM'
      default:
        return document.createdByInfo.email.split('@')[0]
    }
  }

  // Mobile Card View
  if (isMobile) {
    return (
      <div className="space-y-4">
        {documents.map((doc) => (
          <div
            key={doc.id}
            onClick={() => onDocumentClick(doc)}
            className="bg-white rounded-lg shadow border border-gray-200 p-4 cursor-pointer hover:shadow-md transition-shadow"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getRFATypeColor(doc.rfaType)}`}>
                    {doc.rfaType}
                  </span>
                </div>
                
                <h3 className="font-medium text-gray-900 text-sm mb-1">
                  {doc.documentNumber}
                </h3>
                <p className="text-sm text-gray-600 line-clamp-2">
                  {doc.title}
                </p>
              </div>

              <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(doc.status)}`}>
                {getStatusText(doc.status)}
              </span>
            </div>

            {/* Details */}
            <div className="space-y-2 text-xs text-gray-600">
              <div className="flex items-center">
                <Building className="w-3 h-3 mr-2" />
                <span>{doc.site.name}</span>
              </div>
              
              <div className="flex items-center">
                <Tag className="w-3 h-3 mr-2" />
                <span>{doc.category.categoryCode}</span>
              </div>
              
              <div className="flex items-center">
                <User className="w-3 h-3 mr-2" />
                <span>ผู้รับผิดชอบ: {getResponsibleUser(doc)}</span>
              </div>
              
              <div className="flex items-center">
                <Calendar className="w-3 h-3 mr-2" />
                <span>อัปเดต: {formatDate(doc.updatedAt)}</span>
              </div>

              {doc.filesCount > 0 && (
                <div className="flex items-center">
                  <FileText className="w-3 h-3 mr-2" />
                  <span>{doc.filesCount} ไฟล์ ({formatFileSize(doc.totalFileSize)})</span>
                </div>
              )}

              {['PENDING_SITE_ADMIN', 'PENDING_CM'].includes(doc.status) && (
                <div className="flex items-center text-orange-600">
                  <Clock className="w-3 h-3 mr-2" />
                  <span>ค้างดำเนินการ: {calculatePendingDays(doc)} วัน</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Desktop Table View
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                เอกสาร
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ข้อมูลโครงการ
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                สถานะ
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ผู้รับผิดชอบ
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                วันที่
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ไฟล์
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                การดำเนินการ
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {documents.map((doc) => (
              <tr
                key={doc.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => onDocumentClick(doc)}
              >
                {/* Document Info */}
                <td className="px-6 py-4">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getRFATypeColor(doc.rfaType)}`}>
                        {doc.rfaType}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {doc.documentNumber}
                      </p>
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {doc.title}
                      </p>
                    </div>
                  </div>
                </td>

                {/* Project Info */}
                <td className="px-6 py-4">
                  <div className="text-sm">
                    <p className="text-gray-900 font-medium">{doc.site.name}</p>
                    <p className="text-gray-600">{doc.category.categoryCode}</p>
                  </div>
                </td>

                {/* Status */}
                <td className="px-6 py-4">
                  <div className="flex flex-col space-y-1">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(doc.status)}`}>
                      {getStatusText(doc.status)}
                    </span>
                    
                    {['PENDING_SITE_ADMIN', 'PENDING_CM'].includes(doc.status) && (
                      <span className="text-xs text-orange-600">
                        ค้าง {calculatePendingDays(doc)} วัน
                      </span>
                    )}
                  </div>
                </td>

                {/* Responsible User */}
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <User className="w-4 h-4 text-gray-400 mr-2" />
                    <div className="text-sm">
                      <p className="text-gray-900">{getResponsibleUser(doc)}</p>
                      <p className="text-gray-600 capitalize">
                        {doc.assignedUserInfo?.role?.toLowerCase() || 
                         (doc.currentStep === 'SITE_ADMIN_REVIEW' ? 'site admin' : 'cm')}
                      </p>
                    </div>
                  </div>
                </td>

                {/* Dates */}
                <td className="px-6 py-4">
                  <div className="text-sm">
                    <div className="flex items-center text-gray-900 mb-1">
                      <Calendar className="w-3 h-3 mr-1" />
                      <span>สร้าง: {formatDate(doc.createdAt)}</span>
                    </div>
                    <div className="flex items-center text-gray-600">
                      <Calendar className="w-3 h-3 mr-1" />
                      <span>อัปเดต: {formatDate(doc.updatedAt)}</span>
                    </div>
                  </div>
                </td>

                {/* Files */}
                <td className="px-6 py-4">
                  {doc.filesCount > 0 ? (
                    <div className="flex items-center text-sm">
                      <FileText className="w-4 h-4 text-gray-400 mr-2" />
                      <div>
                        <p className="text-gray-900">{doc.filesCount} ไฟล์</p>
                        <p className="text-gray-600 text-xs">{formatFileSize(doc.totalFileSize)}</p>
                      </div>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">ไม่มีไฟล์</span>
                  )}
                </td>

                {/* Actions */}
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDocumentClick(doc)
                      }}
                      className="inline-flex items-center px-2 py-1 border border-gray-300 rounded text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      ดู
                    </button>

                    {doc.permissions.canApprove && (
                      <span className="inline-flex px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                        สามารถอนุมัติ
                      </span>
                    )}

                    {doc.permissions.canEdit && (
                      <span className="inline-flex px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                        แก้ไขได้
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}