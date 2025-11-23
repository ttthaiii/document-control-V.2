'use client';
import React, { useEffect, useState, useMemo } from 'react';
import { AuthGuard } from '@/lib/components/shared/AuthGuard';
import { ROLES } from '@/lib/config/workflow';
import { useAuth } from '@/lib/auth/useAuth';
import Layout from '@/components/layout/Layout';
import Spinner from '@/components/shared/Spinner';
import { User, Shield, AlertCircle, Search, Sliders } from 'lucide-react';
import UserPermissionModal from '@/components/admin/UserPermissionModal';

interface UserData {
  id: string;
  email: string;
  name: string;       // 👈
  employeeId: string; // 👈
  role: string;
  status: string;
  sites?: string[];
  createdAt?: string;
  lastLogin?: string;
}

export default function ManageUsersPage() {
  const { firebaseUser } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      if (!firebaseUser) return;
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (data.success) setUsers(data.users);
        else setError(data.error || 'Failed to fetch users');
      } catch (err) { setError('Network error'); } 
      finally { setLoading(false); }
    };
    fetchUsers();
  }, [firebaseUser]);

  const filteredUsers = useMemo(() => {
    const lowerTerm = searchTerm.toLowerCase();
    return users.filter(u => 
      u.email.toLowerCase().includes(lowerTerm) ||
      u.name.toLowerCase().includes(lowerTerm) ||
      u.employeeId.toLowerCase().includes(lowerTerm) ||
      u.role.toLowerCase().includes(lowerTerm)
    );
  }, [users, searchTerm]);

  return (
    <AuthGuard requiredRoles={[ROLES.ADMIN]}>
      <Layout>
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <User className="mr-2 text-blue-600" /> จัดการผู้ใช้งาน (User Management)
                </h1>
                <p className="text-gray-500 mt-1">รายชื่อและสิทธิ์การเข้าใช้งานระบบ</p>
            </div>
            <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input type="text" placeholder="ค้นหาชื่อ, รหัสพนักงาน, อีเมล..." className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
          </div>

          {loading ? <div className="text-center py-12 bg-white rounded-lg shadow"><Spinner /></div> : 
           error ? <div className="bg-red-50 p-4 rounded-lg text-red-600 flex items-center justify-center border border-red-200"><AlertCircle className="mr-2" /> {error}</div> : (
            <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">ผู้ใช้งาน</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">รหัสพนักงาน</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">ตำแหน่ง</th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase">สถานะ</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">โครงการ</th>
                      <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-blue-700 font-bold mr-3 shadow-sm">
                                    {user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-gray-900">{user.name || '-'}</div>
                                    <div className="text-xs text-gray-500">{user.email}</div>
                                </div>
                            </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap"><span className="inline-flex items-center px-2.5 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200">{user.employeeId || '-'}</span></td>
                        <td className="px-6 py-4 whitespace-nowrap"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100"><Shield className="w-3 h-3 mr-1" /> {user.role}</span></td>
                        <td className="px-6 py-4 whitespace-nowrap text-center"><span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${user.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{user.status}</span></td>
                        <td className="px-6 py-4 text-sm text-gray-500">{user.sites && user.sites.length > 0 ? <span className="text-blue-600 font-medium">{user.sites.length} โครงการ</span> : <span className="text-gray-400">-</span>}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"><button onClick={() => setSelectedUser(user)} className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"><Sliders size={14} className="mr-2 text-gray-500" /> ตั้งค่าสิทธิ์</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredUsers.length === 0 && <div className="text-center py-10 text-gray-500">ไม่พบข้อมูลผู้ใช้งาน</div>}
              </div>
            </div>
          )}
        </div>
        {selectedUser && <UserPermissionModal user={selectedUser} onClose={() => setSelectedUser(null)} />}
      </Layout>
    </AuthGuard>
  );
}