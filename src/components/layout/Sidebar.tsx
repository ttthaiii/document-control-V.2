// src/components/layout/Sidebar.tsx (แก้ไขแล้ว)
'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
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
import { CREATOR_ROLES, REVIEWER_ROLES, APPROVER_ROLES } from '@/lib/config/workflow'


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
  const searchParams = useSearchParams()
  const { user, logout } = useAuth()
  
  const [showRfaDropdown, setShowRfaDropdown] = useState(false)
  const [userSites, setUserSites] = useState<SiteData[]>([])
  
  const isRFAAuthorized = () => {
    if (!user) return false;
    const authorizedRoles = [
      ...CREATOR_ROLES, 
      ...REVIEWER_ROLES, 
      ...APPROVER_ROLES, 
      'Admin'
    ];
    return authorizedRoles.includes(user.role);
  }

  useEffect(() => {
    const fetchUserSites = async () => {
      if (!user?.sites || user.sites.length === 0) return
      
      try {
        const sites = user.sites.map((siteId: string, index: number) => ({
          id: siteId,
          name: `Site ${index + 1}`
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

  useEffect(() => {
    if (pathname.includes('/rfa') || pathname.includes('/dashboard/rfa')) {
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

  const isPathActive = (path: string) => {
    return pathname === path || pathname.startsWith(path + '/')
  }

  if (!user) {
    return null
  }

  return (
    <>
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30" 
          onClick={onToggle}
        />
      )}
      <div className={`
        fixed inset-y-0 left-0 z-40
        w-64 bg-gradient-to-b from-amber-50 to-orange-50
        border-r border-orange-200
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        flex flex-col h-screen pt-16
      `}>
        
        <div className="bg-gradient-to-r from-orange-600 to-orange-700 text-white p-4 lg:p-6">
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

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          
          <Link
            href="/dashboard"
            className={`
              flex items-center px-3 py-2 rounded-lg transition-colors
              ${isPathActive('/dashboard') && pathname === '/dashboard'
                ? 'bg-blue-100 text-blue-700' 
                : 'text-gray-700 hover:bg-gray-100'
              }
            `}
          >
            <BarChart3 className="w-5 h-5 mr-3" />
            Dashboard
          </Link>

          {isRFAAuthorized() && (
            <div className="space-y-1">
              <button
                onClick={toggleRfaDropdown}
                className={`
                  w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-colors duration-200
                  ${pathname.startsWith('/dashboard/rfa') || pathname.startsWith('/rfa/')
                    ? 'bg-orange-200 text-orange-900' 
                    : 'text-gray-700 hover:bg-orange-100 hover:text-orange-800'
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <FileText size={18} />
                  <span>RFA Documents</span>
                </div>
                {showRfaDropdown ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              
              {showRfaDropdown && (
                <div className="ml-6 space-y-1 border-l-2 border-orange-200 pl-4">
                  <Link
                    href="/dashboard/rfa?type=RFA-SHOP"
                    className={`
                      flex items-center gap-3 px-3 py-2 rounded-md text-sm
                      transition-colors duration-200
                      ${(pathname === '/dashboard/rfa' && searchParams.get('type') === 'RFA-SHOP')
                        ? 'bg-blue-100 text-blue-900 font-medium' 
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                      }
                    `}
                  >
                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                    <span>🏗️ Shop Drawing</span>
                  </Link>

                  <Link
                    href="/dashboard/rfa?type=RFA-GEN"
                    className={`
                      flex items-center gap-3 px-3 py-2 rounded-md text-sm
                      transition-colors duration-200
                      ${(pathname === '/dashboard/rfa' && searchParams.get('type') === 'RFA-GEN')
                        ? 'bg-green-100 text-green-900 font-medium' 
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                      }
                    `}
                  >
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span>📋 General</span>
                  </Link>

                  <Link
                    href="/dashboard/rfa?type=RFA-MAT"
                    className={`
                      flex items-center gap-3 px-3 py-2 rounded-md text-sm
                      transition-colors duration-200
                      ${(pathname === '/dashboard/rfa' && searchParams.get('type') === 'RFA-MAT')
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