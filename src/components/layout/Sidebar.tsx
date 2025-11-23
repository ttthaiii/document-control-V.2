'use client'

import React, { useState, useEffect, useMemo, Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/useAuth'
import { useLoading } from '@/lib/context/LoadingContext'
import { 
  FileText, BarChart3, ChevronDown, 
  ChevronRight, LogOut, X, Users, Wrench, UserCog
} from 'lucide-react'
import { Role } from '@/lib/config/workflow'
import { db } from '@/lib/firebase/client'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { PERMISSION_KEYS, PERMISSION_DEFAULTS } from '@/lib/config/permissions'

interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
}

interface Site {
  id: string;
  name: string;
  userOverrides?: {
    [userId: string]: Record<string, any>
  }
}

function SidebarContent({ isOpen, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, logout } = useAuth()
  const { showLoader } = useLoading()

  const [showRfaDropdown, setShowRfaDropdown] = useState(false)
  const [sites, setSites] = useState<Site[]>([]);

  useEffect(() => {
    if (!user?.id) {
        setSites([]);
        return;
    }

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
            userOverrides: data.userOverrides || {} 
        });
      });
      setSites(sitesFromDb);
    }, (error) => {
      console.warn("Sidebar: Failed to fetch sites", error);
    });

    return () => unsubscribe();
  }, [user]); 

  // Helper: ตรวจสอบสิทธิ์ (ถ้ามีสิทธิ์ใน Site ไหนสักแห่ง ก็ให้เห็นเมนู)
  const checkPerm = (fullKey: string) => {
    if (!user) return false;
    const [group, key] = fullKey.split('.');
    const defaultRoles = PERMISSION_DEFAULTS[fullKey] || [];
    const defaultAllowed = defaultRoles.includes(user.role as Role);

    // เช็ค Override ของทุก Site ที่ User อยู่
    // ถ้ามี Site ไหน "ให้" (true) -> ถือว่ามีสิทธิ์
    // ถ้ามี Site ไหน "ห้าม" (false) -> ไม่นำมานับ (ยึด Default เป็นหลักหากไม่มี override)
    // Logic: (Default Allowed OR Has Grant Override) AND Not Globally Banned (ถ้าจะทำแบบ Global Ban)
    
    // เอาแบบง่าย: ถ้ามี override true ใน site ไหนก็ตาม -> true
    // ถ้าไม่มี override true -> ดู default
    // แต่ต้องระวังกรณี Default True แต่ถูก Deny ทุก site (อันนี้ซับซ้อน เอาแบบพื้นฐานก่อน)
    
    const hasGrant = sites.some(s => s.userOverrides?.[user.id]?.[group]?.[key] === true);
    
    if (hasGrant) return true; // ถ้าได้รับอนุญาตพิเศษที่ไหนสักแห่ง ให้ผ่านเลย

    // ถ้าไม่มีอนุญาตพิเศษ ให้ดูว่า Default ได้ไหม (แต่ต้องไม่ถูก Deny ทั้งหมด)
    if (defaultAllowed) {
        // ถ้า Default ได้ แต่ถูก Deny ทุก Site -> ไม่ให้
        // แต่ในบริบท Sidebar เราโชว์เมนูรวมๆ ถ้ามีสิทธิ์ในสัก Site ก็ควรโชว์
        // ดังนั้นถ้า Default ได้ ก็ให้โชว์ไปก่อน (แล้วไปตันตอนเลือก Site ในหน้างาน)
        return true;
    }

    return false;
  };

  const { 
    canViewShop, canViewGen, canViewMat, 
    hasRfaAccess, hasWorkRequestAccess, isAdminAccess 
  } = useMemo(() => {
    if (!user) return { 
        canViewShop: false, canViewGen: false, canViewMat: false,
        hasRfaAccess: false, hasWorkRequestAccess: false, isAdminAccess: false 
    };

    const canViewShop = checkPerm(`RFA.${PERMISSION_KEYS.RFA.VIEW_SHOP}`);
    const canViewGen = checkPerm(`RFA.${PERMISSION_KEYS.RFA.VIEW_GEN}`);
    const canViewMat = checkPerm(`RFA.${PERMISSION_KEYS.RFA.VIEW_MAT}`);
    
    // Work Request Access
    const canViewWR = checkPerm(`WR.${PERMISSION_KEYS.WORK_REQUEST.VIEW}`);

    return {
        canViewShop,
        canViewGen,
        canViewMat,
        hasRfaAccess: canViewShop || canViewGen || canViewMat,
        hasWorkRequestAccess: canViewWR,
        isAdminAccess: user.role === 'Admin'
    };
  }, [user, sites]);

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

  const toggleRfaDropdown = () => setShowRfaDropdown(!showRfaDropdown)
  const isPathActive = (path: string) => pathname === path || pathname.startsWith(path + '/')

  if (!user) return null

  return (
    <>
      {isOpen && (
        <div className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30" onClick={onToggle} />
      )}
      <div className={`fixed inset-y-0 left-0 z-40 w-64 bg-gradient-to-b from-amber-50 to-orange-50 border-r border-orange-200 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col h-screen pt-16`}>
        
        <div className="bg-gradient-to-r from-orange-600 to-orange-700 text-white p-4 lg:p-6">
          <div className="lg:hidden flex justify-end mb-2">
            <button onClick={onToggle} className="p-1 rounded-md hover:bg-white hover:bg-opacity-20"><X size={20} /></button>
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-lg truncate">Welcome {user.email?.split('@')[0]}</h3>
            <p className="text-orange-100 text-sm">Role: {user.role}</p>
            {userSites.length > 0 && (
              <div>
                <p className="text-orange-100 text-xs">Site:</p>
                <div className="pl-2">
                  {userSites.map(site => (
                    <p key={site.id} className="text-orange-100 text-xs truncate" title={site.name}>- {site.name}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          
          <Link href="/dashboard" onClick={showLoader} className={`flex items-center px-3 py-2 rounded-lg transition-colors ${isPathActive('/dashboard') && pathname === '/dashboard' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}>
            <BarChart3 className="w-5 h-5 mr-3" /> Dashboard
          </Link>

          {hasRfaAccess && (
            <div className="space-y-1">
              <button onClick={toggleRfaDropdown} className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 ${pathname.startsWith('/dashboard/rfa') || pathname.startsWith('/rfa/') ? 'bg-orange-200 text-orange-900' : 'text-gray-700 hover:bg-orange-100 hover:text-orange-800'}`}>
                <div className="flex items-center gap-3"><FileText size={18} /><span>RFA Documents</span></div>
                {showRfaDropdown ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              
              {showRfaDropdown && (
                <div className="ml-6 space-y-1 border-l-2 border-orange-200 pl-4">
                  {canViewShop && (
                    <Link href="/dashboard/rfa?type=RFA-SHOP" onClick={showLoader} className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-200 ${(pathname === '/dashboard/rfa' && searchParams.get('type') === 'RFA-SHOP') ? 'bg-blue-100 text-blue-900 font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'}`}>
                        <div className="w-2 h-2 bg-blue-500 rounded-full" /><span>🏗️ Shop Drawing</span>
                    </Link>
                  )}

                  {canViewGen && (
                    <Link href="/dashboard/rfa?type=RFA-GEN" onClick={showLoader} className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-200 ${(pathname === '/dashboard/rfa' && searchParams.get('type') === 'RFA-GEN') ? 'bg-green-100 text-green-900 font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'}`}>
                        <div className="w-2 h-2 bg-green-500 rounded-full" /><span>📋 General</span>
                    </Link>
                  )}

                  {canViewMat && (
                    <Link href="/dashboard/rfa?type=RFA-MAT" onClick={showLoader} className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-200 ${(pathname === '/dashboard/rfa' && searchParams.get('type') === 'RFA-MAT') ? 'bg-orange-100 text-orange-900 font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'}`}>
                        <div className="w-2 h-2 bg-orange-500 rounded-full" /><span>🧱 Material</span>
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}

          {hasWorkRequestAccess && (
            <Link href="/dashboard/work-request" onClick={showLoader} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 ${isPathActive('/dashboard/work-request') ? 'bg-orange-200 text-orange-900' : 'text-gray-700 hover:bg-orange-100 hover:text-orange-800'}`}>
                <Wrench size={18} /><span>Work Request</span>
            </Link>
          )}

        </nav>

        {isAdminAccess && (
          <div className="px-4 py-2">
            <div className="border-t border-orange-200" />
            <div className="mt-2 space-y-1">
              <p className="px-3 text-xs font-semibold uppercase text-gray-500 tracking-wider pt-2">Admin</p>
              
              <Link href="/admin" onClick={showLoader} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 ${pathname === '/admin' ? 'bg-red-100 text-red-800' : 'text-gray-700 hover:bg-red-50 hover:text-red-700'}`}>
                <Users size={18} /><span>Invite Users</span>
              </Link>

              <Link href="/admin/users" onClick={showLoader} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 ${isPathActive('/admin/users') ? 'bg-red-100 text-red-800' : 'text-gray-700 hover:bg-red-50 hover:text-red-700'}`}>
                <UserCog size={18} /><span>Manage Users</span>
              </Link>

            </div>
          </div>
        )}
        
        <div className="p-4 border-t border-orange-200">
          <button onClick={handleLogout} disabled={isLoggingOut} className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium ${isLoggingOut ? 'bg-red-400 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600'} text-white transition-colors duration-200`}>
            <LogOut size={16} /><span>{isLoggingOut ? 'กำลังออก...' : 'ออกจากระบบ'}</span>
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