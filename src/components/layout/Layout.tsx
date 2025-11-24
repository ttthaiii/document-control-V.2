'use client'

import React, { useState } from 'react'
import { useAuth } from '@/lib/auth/useAuth'
import Sidebar from './Sidebar'
import { Menu, Bell, Building2 } from 'lucide-react'
import { useLoading } from '@/lib/context/LoadingContext'
import { GlobalSpinner } from '@/lib/context/LoadingContext'

interface LayoutProps extends React.PropsWithChildren {}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  
  // 1. ✅ ดึง requestNotificationPermission มาใช้
  const { user, requestNotificationPermission } = useAuth()
  
  const { isLoading } = useLoading()

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen)
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 z-50">
        <div className="flex items-center justify-between h-full px-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              <Menu size={20} />
            </button>
            <h1 className="text-xl font-semibold text-gray-900">
              🏗️ ttsdoc v2
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            
            {/* 2. ✅ ผูกปุ่มกระดิ่ง: กดปุ่มนี้เพื่อเปิดแจ้งเตือน (สำคัญสำหรับ iOS) */}
            <button 
              onClick={() => requestNotificationPermission()}
              className="p-2 rounded-md text-gray-600 hover:bg-gray-100 hover:text-blue-600 transition-colors relative"
              title="เปิดการแจ้งเตือน"
            >
              <Bell size={18} />
            </button>

            {user && (
              <span className="hidden sm:block text-sm text-gray-600">
                👋 สวัสดี, {user.email.split('@')[0]}
              </span>
            )}
            <div className="hidden md:flex items-center space-x-2 text-gray-600">
              <Building2 size={18} />
              <span className="text-sm font-medium">
                T.T.S. Engineering
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        <Sidebar isOpen={isSidebarOpen} onToggle={toggleSidebar} />

          <main 
            className={`
              relative flex-1 transition-all duration-300 ease-in-out
              ${isSidebarOpen ? 'lg:ml-64' : 'lg:ml-0'}
              overflow-x-hidden
            `}
          >
          {isLoading && <GlobalSpinner />}
          
          <div className="h-full overflow-y-auto">
            <div className="pt-16">
              <div className="p-4 sm:p-6 lg:p-8">
                {children}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default Layout