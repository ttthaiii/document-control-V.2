'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/useAuth'
import { 
  FileText, 
  HelpCircle, 
  Wrench, 
  Building, 
  BarChart3, 
  ChevronDown, 
  ChevronRight,
  LogOut,
  Menu,
  X
} from 'lucide-react'

interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
}

interface SiteData {
  id: string
  name: string
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onToggle }) => {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  
  // State for dropdown menus
  const [showRfaDropdown, setShowRfaDropdown] = useState(false)
  const [userSites, setUserSites] = useState<SiteData[]>([])
  
  // Check if user is authorized for RFA functions
  const isRFAAuthorized = () => {
    const authorizedRoles = ['BIM', 'Site Admin', 'CM', 'Admin']
    return authorizedRoles.includes(user?.role || '')
  }

  // Fetch user sites data
  useEffect(() => {
    const fetchUserSites = async () => {
      if (!user?.sites || user.sites.length === 0) return
      
      try {
        // Fetch site details from Firebase
        // This will be implemented when we have the sites API ready
        // For now, we'll use mock data based on user.sites
        const sites = user.sites.map((siteId: string, index: number) => ({
          id: siteId,
          name: `Site ${index + 1}` // Temporary until we implement sites API
        }))
        setUserSites(sites)
      } catch (error) {
        console.error('Error fetching sites:', error)
      }
    }

    if (user) {
      fetchUserSites()
    }
  }, [user])

  // Auto-expand RFA dropdown if we're on any RFA page
  useEffect(() => {
    if (pathname.includes('/rfa/') || pathname.includes('/rfa-')) {
      setShowRfaDropdown(true)
    }
  }, [pathname])

  const handleLogout = async () => {
    try {
      await logout()
      router.push('/')
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  const toggleRfaDropdown = () => {
    setShowRfaDropdown(!showRfaDropdown)
  }

  // Helper function to check if path is active
  const isPathActive = (path: string) => {
    return pathname === path || pathname.startsWith(path + '/')
  }

  if (!user) {
    return null // Don't render sidebar if not authenticated
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-gradient-to-b from-amber-50 to-orange-50 
        border-r border-orange-200
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${!isOpen ? 'lg:w-0 lg:overflow-hidden' : ''}
        flex flex-col h-full
      `}>
        
        {/* User Info Section */}
        <div className="bg-gradient-to-r from-orange-600 to-orange-700 text-white p-4 lg:p-6">
          {/* Mobile close button */}
          <div className="lg:hidden flex justify-end mb-2">
            <button 
              onClick={onToggle}
              className="p-1 rounded-md hover:bg-white hover:bg-opacity-20"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="space-y-1">
            <h3 className="font-semibold text-lg truncate">
              Welcome {user.email?.split('@')[0]}
            </h3>
            <p className="text-orange-100 text-sm">
              Role: {user.role}
            </p>
            {userSites.length > 0 && (
              <p className="text-orange-100 text-xs truncate">
                Site: {userSites.map(site => site.name).join(', ')}
              </p>
            )}
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          
          {/* Dashboard */}
          <Link
            href="/dashboard"
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
              transition-colors duration-200
              ${isPathActive('/dashboard') 
                ? 'bg-orange-200 text-orange-900' 
                : 'text-gray-700 hover:bg-orange-100 hover:text-orange-800'
              }
            `}
          >
            <BarChart3 size={18} />
            <span>Dashboard</span>
          </Link>

          {/* RFA Section - Only show if authorized */}
          {isRFAAuthorized() && (
            <div className="space-y-1">
              {/* RFA Parent Menu */}
              <button
                onClick={toggleRfaDropdown}
                className={`
                  w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-colors duration-200
                  ${pathname.includes('/rfa') 
                    ? 'bg-orange-200 text-orange-900' 
                    : 'text-gray-700 hover:bg-orange-100 hover:text-orange-800'
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <FileText size={18} />
                  <span>RFA</span>
                </div>
                {showRfaDropdown ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
              </button>

              {/* RFA Submenu */}
              {showRfaDropdown && (
                <div className="ml-6 space-y-1 border-l-2 border-orange-200 pl-4">
                  
                  {/* Shop Drawing */}
                  <Link
                    href="/rfa/shop/create"
                    className={`
                      flex items-center gap-3 px-3 py-2 rounded-md text-sm
                      transition-colors duration-200
                      ${isPathActive('/rfa/shop') 
                        ? 'bg-blue-100 text-blue-900 font-medium' 
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                      }
                    `}
                  >
                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                    <span>🏗️ Shop Drawing</span>
                  </Link>

                  {/* General Submission */}
                  <Link
                    href="/rfa/general/create"
                    className={`
                      flex items-center gap-3 px-3 py-2 rounded-md text-sm
                      transition-colors duration-200
                      ${isPathActive('/rfa/general') 
                        ? 'bg-green-100 text-green-900 font-medium' 
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                      }
                    `}
                  >
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span>📋 General</span>
                  </Link>

                  {/* Material Approval */}
                  <Link
                    href="/rfa/material/create"
                    className={`
                      flex items-center gap-3 px-3 py-2 rounded-md text-sm
                      transition-colors duration-200
                      ${isPathActive('/rfa/material') 
                        ? 'bg-orange-100 text-orange-900 font-medium' 
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                      }
                    `}
                  >
                    <div className="w-2 h-2 bg-orange-500 rounded-full" />
                    <span>🧱 Material</span>
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* RFI */}
          {isRFAAuthorized() && (
            <Link
              href="/rfi"
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-colors duration-200
                ${isPathActive('/rfi') 
                  ? 'bg-orange-200 text-orange-900' 
                  : 'text-gray-700 hover:bg-orange-100 hover:text-orange-800'
                }
              `}
            >
              <HelpCircle size={18} />
              <span>RFI</span>
            </Link>
          )}

          {/* Construction Info */}
          {isRFAAuthorized() && (
            <Link
              href="/construction-info"
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-colors duration-200
                ${isPathActive('/construction-info') 
                  ? 'bg-orange-200 text-orange-900' 
                  : 'text-gray-700 hover:bg-orange-100 hover:text-orange-800'
                }
              `}
            >
              <Building size={18} />
              <span>Construction Info</span>
            </Link>
          )}

          {/* Work Request */}
          <Link
            href="/work-request"
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
              transition-colors duration-200
              ${isPathActive('/work-request') 
                ? 'bg-orange-200 text-orange-900' 
                : 'text-gray-700 hover:bg-orange-100 hover:text-orange-800'
              }
            `}
          >
            <Wrench size={18} />
            <span>Work Request</span>
          </Link>
        </nav>

        {/* Logout Button */}
        <div className="p-4 border-t border-orange-200">
          <button
            onClick={handleLogout}
            className="
              w-full flex items-center justify-center gap-2 
              px-4 py-2.5 rounded-lg text-sm font-medium
              bg-red-500 hover:bg-red-600 text-white
              transition-colors duration-200
            "
          >
            <LogOut size={16} />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </div>
    </>
  )
}

export default Sidebar