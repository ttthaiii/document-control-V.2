'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/useAuth';
import { AuthGuard } from '@/lib/components/shared/AuthGuard';
import WorkRequestListTable from '@/components/work-request/WorkRequestListTable';
import { WorkRequest } from '@/types/work-request';
import { Plus, RefreshCw } from 'lucide-react';

function WorkRequestDashboardContent() {
    const { user, firebaseUser } = useAuth();
    const router = useRouter();
    const [documents, setDocuments] = useState<WorkRequest[]>([]);
    const [loading, setLoading] = useState(true);

    // Function to fetch documents
    const fetchDocuments = async () => {
        if (!firebaseUser) return;
        setLoading(true);
        try {
            const token = await firebaseUser.getIdToken();
            const response = await fetch('/api/work-request/list', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                // We need to fetch site names separately for display
                const sitesResponse = await fetch('/api/sites', { headers: { 'Authorization': `Bearer ${token}` } });
                const sitesData = await sitesResponse.json();
                const sitesMap = new Map(sitesData.sites.map((site: any) => [site.id, site.name]));
                
                const documentsWithSiteNames = data.documents.map((doc: WorkRequest) => ({
                    ...doc,
                    site: { ...doc.site, name: sitesMap.get(doc.site.id) || 'Unknown Site' }
                }));
                setDocuments(documentsWithSiteNames);
            }
        } catch (error) {
            console.error("Failed to fetch work requests:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDocuments();
    }, [firebaseUser]);

    const handleDocumentClick = (doc: WorkRequest) => {
        // We will implement the detail view later
        console.log('Clicked document:', doc.id);
    };

    const canCreate = user && (user.role === 'Site Admin' || user.role === 'Admin');

    return (
            <div className="max-w-7xl mx-auto">
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">
                            ✍️ Work Requests
                        </h1>
                        <p className="text-gray-600 mt-1">รายการคำร้องของานทั้งหมด</p>
                    </div>
                    <div className="flex items-center space-x-3 mt-4 sm:mt-0">
                        <button onClick={fetchDocuments} className="flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200" disabled={loading}>
                            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            {loading ? 'Loading...' : 'Refresh'}
                        </button>
                        {canCreate && (
                             <button onClick={() => router.push('/work-request/create')} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                <Plus className="w-4 h-4 mr-2" />
                                สร้าง Work Request
                            </button>
                        )}
                    </div>
                </div>

                {/* Filter bar can be added here later */}

                <WorkRequestListTable
                    documents={documents}
                    isLoading={loading}
                    onDocumentClick={handleDocumentClick}
                />
            </div>
    );
}

export default function WorkRequestDashboardPage() {
    return (
        <AuthGuard requiredRoles={['Admin', 'Site Admin', 'BIM', 'ME', 'SN']}>
            <WorkRequestDashboardContent />
        </AuthGuard>
    );
}