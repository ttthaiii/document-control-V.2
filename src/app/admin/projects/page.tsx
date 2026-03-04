'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { AuthGuard } from '@/lib/components/shared/AuthGuard'
import { ROLES } from '@/lib/config/workflow'
import { useAuth } from '@/lib/auth/useAuth'
import Layout from '@/components/layout/Layout'
import Spinner from '@/components/shared/Spinner'
import { AlertCircle, Search, Plus, Edit2, FolderKanban } from 'lucide-react'
import { ProjectFormModal, ProjectFormData } from '@/components/admin/ProjectFormModal'
import { useNotification } from '@/lib/context/NotificationContext'

interface ProjectData extends ProjectFormData {
    id: string
    createdAt?: any
}

export default function ManageProjectsPage() {
    const { firebaseUser } = useAuth()
    const { showNotification } = useNotification()
    const [projects, setProjects] = useState<ProjectData[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [searchTerm, setSearchTerm] = useState('')

    // Modal states
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [selectedProject, setSelectedProject] = useState<ProjectData | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const fetchProjects = async () => {
        if (!firebaseUser) return
        setLoading(true)
        try {
            const token = await firebaseUser.getIdToken()
            const res = await fetch('/api/admin/projects', {
                headers: { Authorization: `Bearer ${token}` }
            })
            const data = await res.json()
            if (data.success) {
                setProjects(data.projects)
            } else {
                setError(data.error || 'Failed to fetch projects')
            }
        } catch (err) {
            setError('Network error')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchProjects()
    }, [firebaseUser])

    const filteredProjects = useMemo(() => {
        const lowerTerm = searchTerm.toLowerCase()
        return projects.filter(p =>
            p.name.toLowerCase().includes(lowerTerm) ||
            p.shortName.toLowerCase().includes(lowerTerm) ||
            (p.cmSystemType && p.cmSystemType.toLowerCase().includes(lowerTerm))
        )
    }, [projects, searchTerm])

    const handleOpenAddModal = () => {
        setSelectedProject(null)
        setIsModalOpen(true)
    }

    const handleOpenEditModal = (project: ProjectData) => {
        setSelectedProject(project)
        setIsModalOpen(true)
    }

    const handleCloseModal = () => {
        setIsModalOpen(false)
        setSelectedProject(null)
    }

    const handleSubmit = async (formData: ProjectFormData) => {
        if (!firebaseUser) return
        setIsSubmitting(true)

        try {
            const token = await firebaseUser.getIdToken()
            const isEditing = !!selectedProject
            const url = isEditing ? `/api/admin/projects/${selectedProject.id}` : '/api/admin/projects'
            const method = isEditing ? 'PUT' : 'POST'

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            })

            const data = await res.json()

            if (data.success) {
                showNotification('success', 'สำเร็จ', isEditing ? 'อัปเดตโครงการเรียบร้อยแล้ว' : 'สร้างโครงการเรียบร้อยแล้ว')
                handleCloseModal()
                fetchProjects() // Refresh data
            } else {
                throw new Error(data.error || 'เกิดข้อผิดพลาดในการบันทึก')
            }
        } catch (err: any) {
            showNotification('error', 'ข้อผิดพลาด', err.message)
            throw err // Re-throw for the modal to catch and show error
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <AuthGuard requiredRoles={[ROLES.ADMIN]}>
            <Layout>
                <div className="max-w-7xl mx-auto">
                    <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                                <FolderKanban className="mr-2 text-blue-600" /> จัดการโครงการ (Project Management)
                            </h1>
                            <p className="text-gray-500 mt-1">รายชื่อและข้อมูลโครงการในระบบ</p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative w-full sm:w-80">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <input
                                    type="text"
                                    placeholder="ค้นหาชื่อ, ตัวย่อ..."
                                    className="w-full h-10 pl-10 pr-4 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-500 outline-none shadow-sm"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <button
                                onClick={handleOpenAddModal}
                                className="h-10 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center font-medium shadow-sm transition-colors whitespace-nowrap"
                            >
                                <Plus size={18} className="mr-1" /> เพิ่มโครงการ
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-100 flex justify-center items-center">
                            <Spinner className="text-blue-500 w-8 h-8" />
                        </div>
                    ) : error ? (
                        <div className="bg-red-50 p-4 rounded-lg text-red-600 flex items-center justify-center border border-red-200 shadow-sm">
                            <AlertCircle className="mr-2" /> {error}
                        </div>
                    ) : (
                        <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">ชื่อโครงการ</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">ตัวย่อ</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Line Group ID</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">ระบบ CM</th>
                                            <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">สถานะ</th>
                                            <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {filteredProjects.map((project) => (
                                            <tr key={project.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-medium text-gray-900">{project.name}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100">
                                                        {project.shortName}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {project.LineGroupID ? (
                                                        <span className="truncate max-w-[150px] inline-block" title={project.LineGroupID}>
                                                            {project.LineGroupID.substring(0, 10)}...
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-400">-</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${project.cmSystemType === 'EXTERNAL' ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                                                        {project.cmSystemType || 'INTERNAL'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                                    <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${project.status?.trim().toUpperCase() === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                        {project.status || 'ACTIVE'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    <button
                                                        onClick={() => handleOpenEditModal(project)}
                                                        className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                                                    >
                                                        <Edit2 size={14} className="mr-1.5 text-gray-500" /> แก้ไข
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {filteredProjects.length === 0 && (
                                    <div className="text-center py-10">
                                        <FolderKanban className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                                        <p className="text-gray-500 font-medium">ไม่พบข้อมูลโครงการ</p>
                                        <p className="text-gray-400 text-sm mt-1">ลองเปลี่ยนคำค้นหา หรือเพิ่มโครงการใหม่</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <ProjectFormModal
                    isOpen={isModalOpen}
                    onClose={handleCloseModal}
                    onSubmit={handleSubmit}
                    initialData={selectedProject}
                    isLoading={isSubmitting}
                />
            </Layout>
        </AuthGuard>
    )
}
