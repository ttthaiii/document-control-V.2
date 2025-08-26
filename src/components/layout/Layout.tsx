'use client'

import React, { useState } from 'react'
import { useAuth } from '@/lib/auth/useAuth'
import Sidebar from './Sidebar'
import { Menu, Bell, Building2 } from 'lucide-react'

interface LayoutProps {
  children: React.ReactNode
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const { user } = useAuth()

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen)
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top Navbar */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 z-30">
        <div className="flex items-center justify-between h-full px-4">
          {/* Left side - Toggle + App name */}
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

          {/* Right side - User info + Company */}
          <div className="flex items-center space-x-4">
            {/* Notifications - placeholder for future */}
            <button className="p-2 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
              <Bell size={18} />
            </button>
            
            {/* User greeting */}
            {user && (
              <span className="hidden sm:block text-sm text-gray-600">
                👋 สวัสดี, {user.email.split('@')[0]}
              </span>
            )}
            
            {/* Company info */}
            <div className="hidden md:flex items-center space-x-2 text-gray-600">
              <Building2 size={18} />
              <span className="text-sm font-medium">
                T.T.S. Engineering
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main layout container */}
      <div className="flex pt-16">
        {/* Sidebar */}
        <Sidebar isOpen={isSidebarOpen} onToggle={toggleSidebar} />
        
        {/* Main content area */}
        <main 
          className={`
            flex-1 transition-all duration-300 ease-in-out
            ${isSidebarOpen ? 'lg:ml-0' : 'lg:ml-0'}
            min-h-screen
          `}
        >
          {/* Content wrapper with proper spacing */}
          <div className="p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

export default Layout