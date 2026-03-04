'use client'

import React, { useState, useEffect } from 'react'
import { X, Save, AlertCircle } from 'lucide-react'
import Spinner from '@/components/shared/Spinner'

export interface ProjectFormData {
    name: string
    shortName: string
    cmSystemType: 'INTERNAL' | 'EXTERNAL'
    LineGroupID: string
    status: 'ACTIVE' | 'INACTIVE'
}

interface ProjectFormModalProps {
    isOpen: boolean
    onClose: () => void
    onSubmit: (data: ProjectFormData) => Promise<void>
    initialData?: ProjectFormData | null
    isLoading?: boolean
}

export function ProjectFormModal({ isOpen, onClose, onSubmit, initialData, isLoading = false }: ProjectFormModalProps) {
    const [formData, setFormData] = useState<ProjectFormData>({
        name: '',
        shortName: '',
        cmSystemType: 'INTERNAL',
        LineGroupID: '',
        status: 'ACTIVE',
    })
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (initialData && isOpen) {
            setFormData(initialData)
        } else if (isOpen) {
            setFormData({
                name: '',
                shortName: '',
                cmSystemType: 'INTERNAL',
                LineGroupID: '',
                status: 'ACTIVE',
            })
        }
    }, [initialData, isOpen])

    if (!isOpen) return null

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        // Basic validation
        if (!formData.name.trim() || !formData.shortName.trim()) {
            setError('กรุณากรอกชื่อโครงการและตัวย่อโครงการให้ครบถ้วน')
            return
        }

        try {
            await onSubmit(formData)
        } catch (err: any) {
            setError(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล')
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50">
                    <h2 className="text-xl font-bold text-gray-800">
                        {initialData ? 'แก้ไขโครงการ (Project)' : 'เพิ่มโครงการใหม่ (New Project)'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-200"
                        disabled={isLoading}
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-start text-sm border border-red-100">
                            <AlertCircle size={18} className="mr-2 flex-shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    <form id="project-form" onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                                ชื่อโครงการ (Project Name) <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                id="name"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="เช่น โครงการก่อสร้างอาคาร A"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
                                disabled={isLoading}
                            />
                        </div>

                        <div>
                            <label htmlFor="shortName" className="block text-sm font-medium text-gray-700 mb-1">
                                ตัวย่อโครงการ (Short Name) <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                id="shortName"
                                name="shortName"
                                value={formData.shortName}
                                onChange={handleChange}
                                placeholder="เช่น PRJ-A"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
                                disabled={isLoading}
                            />
                            <p className="mt-1 text-xs text-gray-500">ใช้สำหรับสร้างเลขที่เอกสาร RFA (เช่น RFA-PRJ-A-0001)</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="cmSystemType" className="block text-sm font-medium text-gray-700 mb-1">
                                    ระบบ CM (CM System)
                                </label>
                                <select
                                    id="cmSystemType"
                                    name="cmSystemType"
                                    value={formData.cmSystemType}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
                                    disabled={isLoading}
                                >
                                    <option value="INTERNAL">INTERNAL</option>
                                    <option value="EXTERNAL">EXTERNAL</option>
                                </select>
                            </div>

                            <div>
                                <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                                    สถานะ (Status)
                                </label>
                                <select
                                    id="status"
                                    name="status"
                                    value={formData.status}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
                                    disabled={isLoading}
                                >
                                    <option value="ACTIVE">ACTIVE</option>
                                    <option value="INACTIVE">INACTIVE</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="LineGroupID" className="block text-sm font-medium text-gray-700 mb-1">
                                Line Group ID (Optional)
                            </label>
                            <input
                                type="text"
                                id="LineGroupID"
                                name="LineGroupID"
                                value={formData.LineGroupID}
                                onChange={handleChange}
                                placeholder="เช่น Cd84012..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
                                disabled={isLoading}
                            />
                            <p className="mt-1 text-xs text-gray-500">สำหรับส่งการแจ้งเตือนผ่าน LINE Notify (หากมี)</p>
                        </div>
                    </form>
                </div>

                <div className="flex justify-end items-center gap-3 p-5 border-t border-gray-100 bg-gray-50">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isLoading}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        ยกเลิก
                    </button>
                    <button
                        type="submit"
                        form="project-form"
                        disabled={isLoading}
                        className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <>
                                <Spinner className="w-4 h-4 mr-2" /> กำลังบันทึก...
                            </>
                        ) : (
                            <>
                                <Save size={16} className="mr-2" /> บันทึกข้อมูล
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
