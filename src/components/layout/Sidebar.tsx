// src/components/layout/Sidebar.tsx
'use client'

import React, { useState, useEffect, useMemo, Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/useAuth'
import { useLoading } from '@/lib/context/LoadingContext'
import { 
  FileText, BarChart3, ChevronDown, 
  ChevronRight, LogOut, X, Users, Wrench
} from 'lucide-react'
import { CREATOR_ROLES, REVIEWER_ROLES, APPROVER_ROLES, ROLES, Role } from '@/lib/config/workflow'
import { db } from '@/lib/firebase/client'
import { collection, query, where, onSnapshot } from 'firebase/firestore'

interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
}

interface Site {
  id: string;
  name: string;
  roleSettings?: any;
  userOverrides?: any;
}

function SidebarContent({ isOpen, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, logout } = useAuth()
  const { showLoader } = useLoading()

  const [showRfaDropdown, setShowRfaDropdown] = useState(false)
  const [sites, setSites] = useState<Site[]>([]);

  // 1. ดึงข้อมูล Site (ใช้ members query ที่ตรงกับ Rules ใหม่)
  useEffect(() => {
    if (!user?.id) {
        setSites([]);
        return;
    }

    console.group("🔍 DEBUG: Sidebar Permission");
    console.log("User ID (from Auth):", `"${user.id}"`); // ใส่ "" เพื่อดูว่ามีเว้นวรรคเกินมาไหม
    console.log("Length:", user.id.length);
    console.groupEnd();
    
    const q = query(
      collection(db, "sites"), 
      where("members", "array-contains", user.id)
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const sitesFromDb: Site[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        sitesFromDb.push({ 
            id: doc.id, 
            name: data.name,
            roleSettings: data.roleSettings,
            userOverrides: data.userOverrides
        });
      });
      setSites(sitesFromDb);
    }, (error) => {
      console.error("Sidebar fetch error:", error);
    });

    return () => unsubscribe();
  }, [user]); 

  // 2. ฟังก์ชันเช็คสิทธิ์รายเมนู (Shop / Gen / Mat)
  const checkMenuAccess = (rfaType: 'SHOP' | 'GEN' | 'MAT') => {
      if (!user) return false;
      if (user.role === 'Admin') return true;

      // A. เช็ค Default Role
      let defaultAllowedRoles: Role[] = [];
      if (rfaType === 'SHOP') defaultAllowedRoles = [ROLES.BIM, ROLES.ME, ROLES.SN, ROLES.SITE_ADMIN, ROLES.ADMIN];
      else if (rfaType === 'GEN') defaultAllowedRoles = [ROLES.BIM, ROLES.SITE_ADMIN, ROLES.ADMIN, ROLES.ME, ROLES.SN];
      else if (rfaType === 'MAT') defaultAllowedRoles = [ROLES.SITE_ADMIN, ROLES.ADMIN, ROLES.OE, ROLES.PE];
      
      if (defaultAllowedRoles.includes(user.role)) return true;

      // B. เช็ค Override (สิทธิ์พิเศษ)
      return sites.some(site => {
          const overrides = site.userOverrides?.[user.id]?.RFA;
          
          const createAction = rfaType === 'SHOP' ? 'create_shop' : rfaType === 'GEN' ? 'create_gen' : 'create_mat';
          const commonActions = ['review', 'approve'];

          if (overrides) {
              // ถ้าได้รับอนุญาตให้สร้าง Type นี้โดยเฉพาะ -> ให้เห็น
              if (overrides[createAction] === true) return true; 
              // ถ้าเป็นคนตรวจ/อนุมัติ -> ให้เห็นหมดทุกเมนู
              if (commonActions.some(act => overrides[act] === true)) return true; 
          }
          return false;
      });
  };

  const canViewShop = checkMenuAccess('SHOP');
  const canViewGen = checkMenuAccess('GEN');
  const canViewMat = checkMenuAccess('MAT');
  
  // แสดงเมนูหลักถ้ามีสิทธิ์ย่อยอย่างน้อย 1 อย่าง
  const canViewAnyRFA = canViewShop || canViewGen || canViewMat;

  const userSites = useMemo(() => {
    if (!user?.sites || sites.length === 0) return [];
    return sites.filter(site => user.sites!.includes(site.id));
  }, [user?.sites, sites]);

  useEffect(() => {
    if (pathname.includes('/rfa') || pathname.includes('/dashboard/rfa')) {
      setShowRfaDropdown(true)
    }
  }, [pathname])

  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true)
      await logout()
      router.push('/')
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setIsLoggingOut(false)
    }
  }

  const toggleRfaDropdown = () => {
    setShowRfaDropdown(!showRfaDropdown)
  }

  const isPathActive = (path: string) => {
    return pathname === path || pathname.startsWith(path + '/')
  }

  if (!user) return null

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
              <div>
                <p className="text-orange-100 text-xs">Site:</p>
                <div className="pl-2">
                  {userSites.map(site => (
                    <p key={site.id} className="text-orange-100 text-xs truncate" title={site.name}>
                      - {site.name}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          
          <Link
            href="/dashboard"
            onClick={showLoader}
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

          {/* ✅ แสดงเมนู RFA เฉพาะเมื่อมีสิทธิ์ */}
          {canViewAnyRFA && (
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
                  {/* ✅ แสดงเฉพาะเมนูย่อยที่ได้รับอนุญาต */}
                  {canViewShop && (
                    <Link
                        href="/dashboard/rfa?type=RFA-SHOP"
                        onClick={showLoader}
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
                  )}

                  {canViewGen && (
                    <Link
                        href="/dashboard/rfa?type=RFA-GEN"
                        onClick={showLoader}
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
                  )}

                  {canViewMat && (
                    <Link
                        href="/dashboard/rfa?type=RFA-MAT"
                        onClick={showLoader}
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
                  )}
                </div>
              )}
            </div>
          )}

          <Link
            href="/dashboard/work-request"
            onClick={showLoader}
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
              transition-colors duration-200
              ${isPathActive('/dashboard/work-request') 
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
            disabled={isLoggingOut}
            className={`
              w-full flex items-center justify-center gap-2 
              px-4 py-2.5 rounded-lg text-sm font-medium
              ${isLoggingOut ? 'bg-red-400 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600'} 
              text-white transition-colors duration-200
            `}
          >
            <LogOut size={16} />
            <span>{isLoggingOut ? 'กำลังออก...' : 'ออกจากระบบ'}</span>
          </button>
        </div>
      </div>
    </>
  )
}

const Sidebar: React.FC<SidebarProps> = (props) => {
  return (
    <Suspense fallback={<div className="w-64 bg-gray-100 h-screen" />}>
      <SidebarContent {...props} />
    </Suspense>
  )
}

export default Sidebar