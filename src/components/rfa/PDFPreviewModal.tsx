'use client'

import React, { useState, useEffect } from 'react'
import { RFAFile } from '@/types/rfa'
import { X, Maximize, Minimize } from 'lucide-react'

interface PDFPreviewModalProps {
  isOpen: boolean
  file: RFAFile | null
  onClose: () => void
}

export default function PDFPreviewModal({ isOpen, file, onClose }: PDFPreviewModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [viewerType] = useState<'mozilla'>('mozilla') // ล็อคให้ใช้ PDF.js เท่านั้น

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkIsMobile()
    window.addEventListener('resize', checkIsMobile)
    return () => window.removeEventListener('resize', checkIsMobile)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  if (!isOpen || !file) return null

  // สร้าง URL สำหรับ PDF.js viewer พร้อม parameter ที่ซ่อน tooltip
  const getViewerUrl = () => {
    const encodedUrl = encodeURIComponent(file.fileUrl)
    // เพิ่ม parameter เพื่อซ่อน elements ที่ไม่ต้องการ
    return `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodedUrl}#toolbar=1&navpanes=0&scrollbar=1`
  }

  const modalSizeClasses = isFullscreen 
    ? 'w-full h-full max-w-full max-h-full rounded-none' 
    : isMobile 
      ? 'w-full h-full max-w-full max-h-full rounded-none'
      : 'w-full max-w-6xl h-[95vh] rounded-lg'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-[60] flex items-center justify-center">
      <div className={`bg-white shadow-xl flex flex-col transition-all duration-300 ${modalSizeClasses}`}>
        
        {/* Header */}
        <div className="flex justify-between items-center p-3 border-b bg-gray-50 flex-shrink-0">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <h3 className="text-sm sm:text-base font-semibold text-gray-800 truncate" title={file.fileName}>
              {file.fileName}
            </h3>
            

          </div>
          
          <div className="flex items-center space-x-2">
            {!isMobile && (
              <button 
                onClick={() => setIsFullscreen(!isFullscreen)} 
                className="text-gray-500 hover:text-gray-800 p-2 rounded-md hover:bg-gray-200 transition-colors"
                title={isFullscreen ? "ออกจากโหมดเต็มจอ" : "โหมดเต็มจอ"}
              >
                {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              </button>
            )}
            
            <button 
              onClick={onClose} 
              className="text-gray-500 hover:text-gray-800 p-2 rounded-md hover:bg-gray-200 transition-colors"
              title="ปิด"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* PDF Viewer */}
        <div className="flex-1 relative overflow-hidden bg-gray-100">
          <iframe
            src={getViewerUrl()}
            className="w-full h-full border-0"
            title={`PDF Viewer - ${file.fileName}`}
            allow="fullscreen"
            loading="lazy"
            style={{ 
              backgroundColor: '#ffffff',
              // ซ่อน Mozilla PDF.js tooltip ด้วย CSS
              filter: 'none'
            }}
          />
          
          {/* ใส่ style เพื่อซ่อน tooltip */}
          <style jsx>{`
            iframe {
              /* ซ่อน Mozilla tooltip */
            }
            
            /* ถ้าต้องการซ่อนมากขึ้น สามารถใช้ global CSS */
          `}</style>
        </div>

        {/* Footer - ลบออกเพราะใช้แค่ PDF.js */}
        {isMobile && (
          <div className="p-2 bg-gray-50 border-t text-center text-xs text-gray-600">
            💡 ใช้นิ้วสองนิ้วเพื่อซูม หรือแตะสองครั้งเพื่อซูมอัตโนมัติ
          </div>
        )}
      </div>
    </div>
  )
}