// src/app/admin/users/page.tsx
'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useAuth } from '@/lib/auth/useAuth';
import { AuthGuard } from '@/lib/components/shared/AuthGuard';
import { ROLES } from '@/lib/config/workflow';
import { Search, User, Settings, Shield } from 'lucide-react';
import Spinner from '@/components/shared/Spinner';
import UserPermissionModal from '@/components/admin/UserPermissionModal'; // Import Modal ที่เพิ่งสร้าง

interface AppUser {
    id: string;
    email: string;
    role: string;
    status: string;
    lastLogin?: string;
}

function UserManagementContent() {
    const { firebaseUser } = useAuth();
    const [users, setUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    // State สำหรับ Modal
    const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        const fetchUsers = async () => {
            if (!firebaseUser) return;
            setLoading(true);
            try {
                const token = await firebaseUser.getIdToken();
                const response = await fetch('/api/admin/users', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();
                if (data.success) {
                    setUsers(data.users);
                }
            } catch (error) {
                console.error("Failed to fetch users", error);
            } finally {
                setLoading(false);
            }
        };

        fetchUsers();
    }, [firebaseUser]);

    const handleManagePermission = (user: AppUser) => {
        setSelectedUser(user);
        setIsModalOpen(true);
    };

    const filteredUsers = users.filter(u => 
        u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.role.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                        <Shield className="mr-3 text-blue-600" /> จัดการผู้ใช้และสิทธิ์ (User & Permissions)
                    </h1>
                </div>

                {/* Search Bar */}
                <div className="bg-white p-4 rounded-lg shadow mb-6 flex items-center">
                    <Search className="text-gray-400 w-5 h-5 mr-3" />
                    <input 
                        type="text" 
                        placeholder="ค้นหาด้วยอีเมล หรือตำแหน่ง..." 
                        className="flex-1 outline-none text-gray-700"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Users Table */}
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    {loading ? (
                        <div className="p-12 text-center"><Spinner /></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-100 border-b">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ผู้ใช้งาน</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ตำแหน่ง (Default Role)</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">สถานะ</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">จัดการสิทธิ์</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {filteredUsers.map(user => (
                                        <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                                                        <User size={20} />
                                                    </div>
                                                    <div className="ml-4">
                                                        <div className="text-sm font-medium text-gray-900">{user.email}</div>
                                                        <div className="text-xs text-gray-500">Last login: {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString('th-TH') : '-'}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                                                    {user.role}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${user.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                    {user.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                <button 
                                                    onClick={() => handleManagePermission(user)}
                                                    className="text-blue-600 hover:text-blue-900 flex items-center justify-center mx-auto px-3 py-1 rounded-md hover:bg-blue-50 transition-colors"
                                                >
                                                    <Settings size={16} className="mr-2" /> ตั้งค่าสิทธิ์
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {filteredUsers.length === 0 && (
                                <div className="p-8 text-center text-gray-500">ไม่พบข้อมูลผู้ใช้</div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Modal จัดการสิทธิ์ */}
            {selectedUser && (
                <UserPermissionModal 
                    isOpen={isModalOpen}
                    onClose={() => { setIsModalOpen(false); setSelectedUser(null); }}
                    targetUser={selectedUser}
                />
            )}
        </div>
    );
}

export default function UserManagementPage() {
    return (
        <AuthGuard requiredRoles={[ROLES.ADMIN]}>
            <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
                <UserManagementContent />
            </Suspense>
        </AuthGuard>
    );
}