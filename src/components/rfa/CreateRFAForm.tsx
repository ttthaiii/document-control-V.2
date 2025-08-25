// src/components/rfa/CreateRFAForm.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Upload, CheckCircle, ChevronRight, ChevronLeft, X, AlertCircle, Clock } from 'lucide-react'

// Types
interface RFAFormData {
  rfaType: 'RFA-SHOP' | 'RFA-GEN' | 'RFA-MAT' | ''
  categoryId: string
  title: string
  description: string
  files: File[]
  googleSheetsTask?: {
    taskId: string
    taskName: string
    category: string
  }
}

interface Category {
  id: string
  categoryCode: string
  categoryName: string
  rfaTypes: string[]
}

interface User {
  id: string
  email: string
  role: 'BIM' | 'Site Admin' | 'CM' | 'Admin'
  sites: string[]
}

const INITIAL_FORM_DATA: RFAFormData = {
  rfaType: '',
  categoryId: '',
  title: '',
  description: '',
  files: []
}

const RFA_TYPE_CONFIG = {
  'RFA-SHOP': {
    title: 'RFA-SHOP',
    subtitle: 'Shop Drawing Approval',
    icon: '🏗️',
    description: 'สำหรับการขออนุมัติ Shop Drawing',
    workflow: 'BIM → Site Admin → CM',
    allowedRoles: ['BIM', 'Admin'],
    color: 'blue'
  },
  'RFA-GEN': {
    title: 'RFA-GEN', 
    subtitle: 'General Submission',
    icon: '📋',
    description: 'สำหรับการส่งเอกสารทั่วไป',
    workflow: 'BIM/Site Admin → CM',
    allowedRoles: ['BIM', 'Site Admin', 'Admin'],
    color: 'green'
  },
  'RFA-MAT': {
    title: 'RFA-MAT',
    subtitle: 'Material Approval', 
    icon: '🧱',
    description: 'สำหรับการขออนุมัติวัสดุ',
    workflow: 'Site Admin → CM',
    allowedRoles: ['Site Admin', 'Admin'],
    color: 'orange'
  }
}

export default function CreateRFAForm({ 
  onClose, 
  isModal = false,
  user 
}: { 
  onClose?: () => void
  isModal?: boolean
  user?: User
}) {
  // State
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState<RFAFormData>(INITIAL_FORM_DATA)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  
  // Hooks
  const router = useRouter()

  // Load categories when RFA type changes
  useEffect(() => {
    if (formData.rfaType) {
      fetchCategories(formData.rfaType)
    }
  }, [formData.rfaType])

  const fetchCategories = async (rfaType: string) => {
    try {
      setLoading(true)
      const response = await fetch(`/api/rfa/categories?rfaType=${rfaType}`)
      const data = await response.json()
      
      if (data.success) {
        setCategories(data.categories)
      } else {
        throw new Error(data.error || 'Failed to fetch categories')
      }
    } catch (error) {
      console.error('Error fetching categories:', error)
      setErrors({ general: 'ไม่สามารถโหลดหมวดหมู่ได้' })
    } finally {
      setLoading(false)
    }
  }

  // Form validation
  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {}

    switch (step) {
      case 1: // RFA Type Selection
        if (!formData.rfaType) {
          newErrors.rfaType = 'กรุณาเลือกประเภท RFA'
        } else {
          // Check user role permission
          const config = RFA_TYPE_CONFIG[formData.rfaType]
          if (user && !config.allowedRoles.includes(user.role)) {
            newErrors.rfaType = `คุณไม่มีสิทธิ์สร้าง ${formData.rfaType} (สำหรับ ${config.allowedRoles.join(', ')} เท่านั้น)`
          }
        }
        break

      case 2: // Basic Information
        if (!formData.title.trim()) {
          newErrors.title = 'กรุณาใส่หัวข้อเอกสาร'
        } else if (formData.title.length < 5) {
          newErrors.title = 'หัวข้อต้องมีความยาวอย่างน้อย 5 ตัวอักษร'
        }
        
        if (!formData.categoryId) {
          newErrors.categoryId = 'กรุณาเลือกหมวดหมู่'
        }
        
        if (!formData.description.trim()) {
          newErrors.description = 'กรุณาใส่รายละเอียด'
        } else if (formData.description.length < 10) {
          newErrors.description = 'รายละเอียดต้องมีความยาวอย่างน้อย 10 ตัวอักษร'
        }
        break

      case 3: // File Upload
        if (formData.files.length === 0) {
          newErrors.files = 'กรุณาเลือกไฟล์อย่างน้อย 1 ไฟล์'
        }
        
        // Validate file sizes
        const oversizedFiles = formData.files.filter(file => file.size > 100 * 1024 * 1024) // 100MB
        if (oversizedFiles.length > 0) {
          newErrors.files = `ไฟล์ ${oversizedFiles.map(f => f.name).join(', ')} มีขนาดใหญ่เกิน 100MB`
        }
        break
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Step navigation
  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 4))
    }
  }

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1))
    setErrors({}) // Clear errors when going back
  }

  // Form handlers
  const updateFormData = (updates: Partial<RFAFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }))
    
    // Clear related errors
    const newErrors = { ...errors }
    Object.keys(updates).forEach(key => {
      delete newErrors[key]
    })
    setErrors(newErrors)
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return
    
    const fileArray = Array.from(files)
    const validFiles: File[] = []
    const invalidFiles: string[] = []
    
    fileArray.forEach(file => {
      // File size validation (max 100MB for now)
      if (file.size > 100 * 1024 * 1024) {
        invalidFiles.push(`${file.name} (ขนาดใหญ่เกิน 100MB)`)
        return
      }
      
      // File type validation
      const allowedExtensions = ['.dwg', '.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.docx', '.zip']
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
      if (!allowedExtensions.includes(fileExtension)) {
        invalidFiles.push(`${file.name} (ประเภทไฟล์ไม่รองรับ)`)
        return
      }
      
      validFiles.push(file)
    })

    if (invalidFiles.length > 0) {
      setErrors({ files: `ไฟล์ไม่ถูกต้อง: ${invalidFiles.join(', ')}` })
    }

    if (validFiles.length > 0) {
      updateFormData({ files: [...formData.files, ...validFiles] })
    }
  }

  const removeFile = (index: number) => {
    const newFiles = formData.files.filter((_, i) => i !== index)
    updateFormData({ files: newFiles })
  }

  // Submit form
  const submitForm = async () => {
    if (!validateStep(3)) return

    setUploading(true)
    try {
      // Create FormData for file upload
      const submitData = new FormData()
      submitData.append('rfaType', formData.rfaType)
      submitData.append('categoryId', formData.categoryId)
      submitData.append('title', formData.title)
      submitData.append('description', formData.description)
      
      // Add files
      formData.files.forEach((file) => {
        submitData.append('files', file)
      })

      const response = await fetch('/api/rfa/create', {
        method: 'POST',
        body: submitData
      })

      const result = await response.json()

      if (result.success) {
        // Success - redirect or close
        if (onClose) {
          onClose()
        } else {
          router.push('/dashboard')
        }
        
        // Show success message (you might want to use a toast library)
        alert(`สร้าง RFA สำเร็จ! หมายเลขเอกสาร: ${result.documentNumber}`)
      } else {
        throw new Error(result.error || 'เกิดข้อผิดพลาด')
      }
    } catch (error) {
      console.error('Error creating RFA:', error)
      setErrors({ general: error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการสร้าง RFA' })
    } finally {
      setUploading(false)
    }
  }

  // Get user role permission for RFA types
  const getAvailableRFATypes = () => {
    if (!user) return Object.keys(RFA_TYPE_CONFIG)
    
    return Object.entries(RFA_TYPE_CONFIG)
      .filter(([_, config]) => config.allowedRoles.includes(user.role))
      .map(([key, _]) => key)
  }

  // Get filtered categories based on RFA type
  const filteredCategories = categories.filter(cat => 
    cat.rfaTypes.includes(formData.rfaType)
  )

  const steps = [
    { number: 1, title: 'เลือกประเภท', icon: FileText, description: 'เลือกประเภท RFA ที่ต้องการสร้าง' },
    { number: 2, title: 'ข้อมูลพื้นฐาน', icon: FileText, description: 'กรอกรายละเอียดเอกสาร' },
    { number: 3, title: 'แนบไฟล์', icon: Upload, description: 'อัปโหลดไฟล์เอกสาร' },
    { number: 4, title: 'ตรวจสอบ', icon: CheckCircle, description: 'ตรวจสอบข้อมูลก่อนส่ง' }
  ]

  const availableRFATypes = getAvailableRFATypes()

  return (
    <div className={`${isModal ? 'max-w-4xl mx-auto' : 'min-h-screen'} bg-white ${isModal ? 'rounded-lg shadow-lg' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b bg-gray-50">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">สร้าง RFA Document</h2>
          <p className="text-sm text-gray-600 mt-1">
            {user && `สวัสดี ${user.email} (${user.role})`}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={uploading}
          >
            <X className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Progress Steps */}
      <div className="px-6 py-4 bg-gray-50 border-b">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          {steps.map((step, index) => {
            const Icon = step.icon
            const isActive = currentStep === step.number
            const isCompleted = currentStep > step.number
            const isAccessible = currentStep >= step.number
            
            return (
              <div key={step.number} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className={`
                    flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all duration-200
                    ${isActive 
                      ? 'bg-blue-600 border-blue-600 text-white shadow-lg' 
                      : isCompleted 
                        ? 'bg-green-600 border-green-600 text-white'
                        : isAccessible
                          ? 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                          : 'bg-gray-100 border-gray-200 text-gray-400'
                    }
                  `}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="mt-2 text-center">
                    <p className={`text-xs font-medium ${
                      isActive ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-400'
                    }`}>
                      ขั้นตอนที่ {step.number}
                    </p>
                    <p className={`text-xs ${
                      isActive ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-400'
                    }`}>
                      {step.title}
                    </p>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div className={`w-8 h-0.5 mx-4 ${
                    currentStep > step.number ? 'bg-green-600' : 'bg-gray-300'
                  }`} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Form Content */}
      <div className="p-6 min-h-96">
        {/* Error Display */}
        {errors.general && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-red-800">เกิดข้อผิดพลาด</h4>
              <p className="text-sm text-red-600 mt-1">{errors.general}</p>
            </div>
          </div>
        )}

        {/* Step 1: RFA Type Selection */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h3 className="text-xl font-semibold mb-2">เลือกประเภท RFA Document</h3>
              <p className="text-gray-600">
                เลือกประเภท RFA ที่ต้องการสร้าง ตามบทบาทของคุณ
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {Object.entries(RFA_TYPE_CONFIG).map(([type, config]) => {
                const isAllowed = availableRFATypes.includes(type)
                const isSelected = formData.rfaType === type
                
                return (
                  <div 
                    key={type}
                    className={`
                      relative p-6 border-2 rounded-lg cursor-pointer transition-all duration-200 transform hover:scale-105
                      ${isSelected 
                        ? 'border-blue-500 bg-blue-50 shadow-lg' 
                        : isAllowed
                          ? 'border-gray-200 hover:border-gray-300 hover:shadow-md' 
                          : 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-60'
                      }
                    `}
                    onClick={() => isAllowed && updateFormData({ rfaType: type as any })}
                  >
                    {!isAllowed && (
                      <div className="absolute top-2 right-2">
                        <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center">
                          <X className="w-4 h-4 text-red-600" />
                        </div>
                      </div>
                    )}
                    
                    <div className="text-center">
                      <div className="text-4xl mb-4">{config.icon}</div>
                      <h4 className="font-semibold text-gray-900 mb-2">{config.title}</h4>
                      <p className="text-sm text-gray-600 mb-3">{config.subtitle}</p>
                      <p className="text-xs text-gray-500 mb-4">{config.description}</p>
                      <div className="text-xs text-gray-400">
                        <div className="mb-2">
                          <strong>ขั้นตอน:</strong> {config.workflow}
                        </div>
                        <div>
                          <strong>สิทธิ์:</strong> {config.allowedRoles.join(', ')}
                        </div>
                      </div>
                      
                      {!isAllowed && (
                        <div className="mt-3 text-xs text-red-600 font-medium">
                          ไม่มีสิทธิ์สร้าง
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            
            {errors.rfaType && (
              <div className="text-center">
                <p className="text-red-600 text-sm mt-4">{errors.rfaType}</p>
              </div>
            )}
            
            {formData.rfaType && (
              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-blue-800 mb-2">
                  คุณเลือก: {RFA_TYPE_CONFIG[formData.rfaType].title}
                </h4>
                <p className="text-blue-700 text-sm">
                  {RFA_TYPE_CONFIG[formData.rfaType].description}
                </p>
                <p className="text-blue-600 text-xs mt-2">
                  ขั้นตอนการอนุมัติ: {RFA_TYPE_CONFIG[formData.rfaType].workflow}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Basic Information */}
        {currentStep === 2 && (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h3 className="text-xl font-semibold mb-2">ข้อมูลพื้นฐานของเอกสาร</h3>
              <p className="text-gray-600">
                กรอกรายละเอียดของเอกสาร {formData.rfaType ? RFA_TYPE_CONFIG[formData.rfaType]?.title : 'RFA'}
              </p>
            </div>

            {/* Category Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                หมวดหมู่ <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.categoryId}
                onChange={(e) => updateFormData({ categoryId: e.target.value })}
                className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.categoryId ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={loading || filteredCategories.length === 0}
              >
                <option value="">
                  {loading ? 'กำลังโหลด...' : 'เลือกหมวดหมู่'}
                </option>
                {filteredCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.categoryCode} - {cat.categoryName}
                  </option>
                ))}
              </select>
              {errors.categoryId && (
                <p className="text-red-600 text-sm mt-1">{errors.categoryId}</p>
              )}
              {filteredCategories.length === 0 && !loading && (
                <p className="text-amber-600 text-sm mt-1">
                  ไม่พบหมวดหมู่สำหรับ {formData.rfaType}
                </p>
              )}
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                หัวข้อเอกสาร <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => updateFormData({ title: e.target.value })}
                className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.title ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="เช่น: Shop Drawing สำหรับโครงสร้างชั้น 2"
                maxLength={200}
              />
              <div className="flex justify-between items-center mt-1">
                {errors.title ? (
                  <p className="text-red-600 text-sm">{errors.title}</p>
                ) : (
                  <span></span>
                )}
                <span className="text-xs text-gray-500">
                  {formData.title.length}/200
                </span>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                รายละเอียด <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => updateFormData({ description: e.target.value })}
                rows={4}
                className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.description ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="อธิบายรายละเอียดของเอกสาร, วัตถุประสงค์, และข้อมูลสำคัญอื่นๆ"
                maxLength={1000}
              />
              <div className="flex justify-between items-center mt-1">
                {errors.description ? (
                  <p className="text-red-600 text-sm">{errors.description}</p>
                ) : (
                  <span></span>
                )}
                <span className="text-xs text-gray-500">
                  {formData.description.length}/1000
                </span>
              </div>
            </div>

            {/* Preview */}
            {formData.title && formData.categoryId && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-800 mb-2">ตัวอย่างหมายเลขเอกสาร:</h4>
                <p className="text-sm text-gray-600">
                  {(() => {
                    const category = filteredCategories.find(c => c.id === formData.categoryId)
                    const prefix = formData.rfaType === 'RFA-SHOP' ? 'RFS' :
                                  formData.rfaType === 'RFA-GEN' ? 'RFG' : 'RFM'
                    return `${prefix}-001 (${category?.categoryCode})`
                  })()}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  หมายเลขจริงจะถูกสร้างอัตโนมัติเมื่อส่งเอกสาร
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: File Upload */}
        {currentStep === 3 && (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h3 className="text-xl font-semibold mb-2">แนบไฟล์เอกสาร</h3>
              <p className="text-gray-600">
                อัปโหลดไฟล์ที่เกี่ยวข้องกับ {formData.rfaType ? RFA_TYPE_CONFIG[formData.rfaType]?.title : 'RFA'}
              </p>
            </div>

            {/* File Upload Area */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h4 className="text-lg font-medium text-gray-900 mb-2">
                ลากไฟล์มาวาง หรือคลิกเพื่อเลือกไฟล์
              </h4>
              <p className="text-sm text-gray-500 mb-4">
                รองรับ: DWG, PDF, Excel, Word, รูปภาพ, ZIP (สูงสุด 100MB ต่อไฟล์)
              </p>
              <input
                type="file"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
                accept=".dwg,.pdf,.jpg,.jpeg,.png,.xlsx,.docx,.zip"
              />
              <label
                htmlFor="file-upload"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors"
              >
                <Upload className="w-4 h-4 mr-2" />
                เลือกไฟล์
              </label>
            </div>

            {/* File List */}
            {formData.files.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">ไฟล์ที่เลือก ({formData.files.length} ไฟล์)</h4>
                {formData.files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                        <FileText className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{file.name}</p>
                        <p className="text-xs text-gray-500">
                          {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFile(index)}
                      className="text-red-600 hover:text-red-800 p-1"
                      disabled={uploading}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {errors.files && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{errors.files}</p>
              </div>
            )}

            {/* File Guidelines */}
            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-800 mb-2">คำแนะนำการอัปโหลดไฟล์:</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• ไฟล์ DWG: สำหรับ Shop Drawing และแบบทางเทคนิค</li>
                <li>• ไฟล์ PDF: สำหรับเอกสารที่ต้องการความแม่นยำในการแสดงผล</li>
                <li>• ไฟล์ Excel/Word: สำหรับรายงานและเอกสารประกอบ</li>
                <li>• รูปภาพ: สำหรับภาพประกอบและหลักฐาน</li>
                <li>• ขนาดไฟล์ไม่เกิน 100MB ต่อไฟล์ (ระบบจะรองรับไฟล์ขนาดใหญ่ขึ้นในอนาคต)</li>
              </ul>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {currentStep === 4 && (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h3 className="text-xl font-semibold mb-2">ตรวจสอบข้อมูล</h3>
              <p className="text-gray-600">
                กรุณาตรวจสอบข้อมูลให้ถูกต้องก่อนส่งเอกสาร
              </p>
            </div>

            {/* Review Summary */}
            <div className="space-y-6">
              {/* RFA Type */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-800 mb-3">ประเภทเอกสาร</h4>
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">{formData.rfaType ? RFA_TYPE_CONFIG[formData.rfaType]?.icon : '📄'}</span>
                  <div>
                    <p className="font-medium">{formData.rfaType ? RFA_TYPE_CONFIG[formData.rfaType]?.title : 'ไม่ระบุ'}</p>
                    <p className="text-sm text-gray-600">{formData.rfaType ? RFA_TYPE_CONFIG[formData.rfaType]?.subtitle : ''}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      ขั้นตอนการอนุมัติ: {formData.rfaType ? RFA_TYPE_CONFIG[formData.rfaType]?.workflow : ''}
                    </p>
                  </div>
                </div>
              </div>

              {/* Basic Information */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-800 mb-3">ข้อมูลเอกสาร</h4>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-600">หมวดหมู่:</p>
                    <p className="font-medium">
                      {(() => {
                        const category = filteredCategories.find(c => c.id === formData.categoryId)
                        return category ? `${category.categoryCode} - ${category.categoryName}` : 'ไม่ระบุ'
                      })()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">หัวข้อเอกสาร:</p>
                    <p className="font-medium">{formData.title}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">รายละเอียด:</p>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{formData.description}</p>
                  </div>
                </div>
              </div>

              {/* Files */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-800 mb-3">ไฟล์แนบ ({formData.files.length} ไฟล์)</h4>
                {formData.files.length > 0 ? (
                  <div className="space-y-2">
                    {formData.files.map((file, index) => (
                      <div key={index} className="flex items-center space-x-3 text-sm">
                        <FileText className="w-4 h-4 text-gray-500" />
                        <span className="flex-1">{file.name}</span>
                        <span className="text-gray-500">
                          {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                      </div>
                    ))}
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <p className="text-xs text-gray-600">
                        ขนาดรวม: {(formData.files.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">ไม่มีไฟล์แนบ</p>
                )}
              </div>

              {/* Expected Document Number */}
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-800 mb-2">หมายเลขเอกสารที่จะได้รับ</h4>
                <p className="text-blue-700">
                  {(() => {
                    const prefix = formData.rfaType === 'RFA-SHOP' ? 'RFS' :
                                  formData.rfaType === 'RFA-GEN' ? 'RFG' : 'RFM'
                    return `${prefix}-XXX`
                  })()} (จะถูกสร้างอัตโนมัติ)
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  สถานะเริ่มต้น: DRAFT → รอการดำเนินการ
                </p>
              </div>

              {/* Next Steps Preview */}
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <h4 className="font-medium text-green-800 mb-2">ขั้นตอนถัดไป</h4>
                <div className="space-y-2 text-sm text-green-700">
                  {formData.rfaType === 'RFA-SHOP' && (
                    <>
                      <div className="flex items-center space-x-2">
                        <Clock className="w-4 h-4" />
                        <span>1. Site Admin จะได้รับแจ้งเตือนเพื่อทำการตรวจสอบ</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Clock className="w-4 h-4" />
                        <span>2. หลังจาก Site Admin อนุมัติ จะส่งไปยัง CM</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="w-4 h-4" />
                        <span>3. CM ทำการอนุมัติขั้นสุดท้าย</span>
                      </div>
                    </>
                  )}
                  {formData.rfaType === 'RFA-GEN' && (
                    <>
                      <div className="flex items-center space-x-2">
                        <Clock className="w-4 h-4" />
                        <span>1. เอกสารจะส่งไปยัง CM โดยตรง</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="w-4 h-4" />
                        <span>2. CM ทำการอนุมัติ</span>
                      </div>
                    </>
                  )}
                  {formData.rfaType === 'RFA-MAT' && (
                    <>
                      <div className="flex items-center space-x-2">
                        <Clock className="w-4 h-4" />
                        <span>1. เอกสารจะส่งไปยัง CM เพื่อตรวจสอบ</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="w-4 h-4" />
                        <span>2. CM ทำการอนุมัติวัสดุ</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Footer */}
      <div className="flex justify-between items-center p-6 border-t bg-gray-50">
        <button
          onClick={prevStep}
          disabled={currentStep === 1 || uploading}
          className={`
            flex items-center px-4 py-2 rounded-lg transition-colors
            ${currentStep === 1 || uploading
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }
          `}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          ย้อนกลับ
        </button>

        <div className="text-sm text-gray-500">
          ขั้นตอน {currentStep} จาก {steps.length}
        </div>

        {currentStep < 4 ? (
          <button
            onClick={nextStep}
            disabled={uploading}
            className={`
              flex items-center px-4 py-2 rounded-lg transition-colors
              ${uploading
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
              }
            `}
          >
            ถัดไป
            <ChevronRight className="w-4 h-4 ml-1" />
          </button>
        ) : (
          <button
            onClick={submitForm}
            disabled={uploading}
            className={`
              flex items-center px-6 py-2 rounded-lg transition-colors font-medium
              ${uploading
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
              }
            `}
          >
            {uploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                กำลังสร้างเอกสาร...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                สร้างเอกสาร RFA
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}