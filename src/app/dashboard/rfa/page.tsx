'use client';
import { useState, useEffect } from 'react';
import { AuthGuard } from '@/lib/components/shared/AuthGuard';
import { useAuth } from '@/lib/auth/useAuth';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Search } from 'lucide-react';

function RFAListContent() {
  const router = useRouter();
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Fetch RFA documents from API
    setTimeout(() => setLoading(false), 1000);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลดเอกสาร RFA...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Dashboard
              </button>
              <h1 className="text-2xl font-bold text-gray-900">
                📋 เอกสาร RFA
              </h1>
            </div>
            <button
              onClick={() => router.push('/dashboard/rfa/create')}
              className="flex items-center bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              สร้าง RFA ใหม่
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {documents.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              ไม่พบเอกสาร RFA
            </h3>
            <p className="text-gray-600 mb-6">
              คุณยังไม่มีเอกสาร RFA ใดๆ เริ่มสร้างเอกสารแรกของคุณได้เลย
            </p>
            <button
              onClick={() => router.push('/dashboard/rfa/create')}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              สร้าง RFA ใหม่
            </button>
          </div>
        ) : (
          <div>
            {/* TODO: Add RFA documents table */}
            <p>RFA Documents will be listed here</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default function RFAListPage() {
  return (
    <AuthGuard>
      <RFAListContent />
    </AuthGuard>
  );
}