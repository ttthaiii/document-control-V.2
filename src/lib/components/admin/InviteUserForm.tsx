'use client';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/lib/auth/useAuth'; // <-- 1. เพิ่ม import useAuth

interface InviteUserFormData {
  email: string;
  role: 'BIM' | 'Site Admin' | 'CM' | 'ME' | 'SN'; 
  sites: string[];
}

interface Site {
  id: string;
  name: string;
}

export function InviteUserForm() {
  const { firebaseUser } = useAuth(); // <-- 2. เรียกใช้ useAuth เพื่อเอา firebaseUser
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    invitationUrl?: string;
    error?: string;
  } | null>(null);
  
  const [availableSites, setAvailableSites] = useState<Site[]>([]);
  const [sitesLoading, setSitesLoading] = useState(true);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<InviteUserFormData>({
    defaultValues: {
        sites: []
    }
  });

  // เพิ่ม: ดึงข้อมูล Sites เมื่อ Component โหลด
  useEffect(() => {
    const fetchSites = async () => {
      if (!firebaseUser) return; // รอจนกว่า firebaseUser จะพร้อม

      try {
        const token = await firebaseUser.getIdToken(); // <-- 4. ดึง Token
        const response = await fetch('/api/sites', {
          headers: {
            'Authorization': `Bearer ${token}` // <-- 5. เพิ่ม Authorization Header
          }
        });
        const data = await response.json();
        if (data.success) {
          setAvailableSites(data.sites);
        }
      } catch (error) {
        console.error("Failed to fetch sites", error);
      } finally {
        setSitesLoading(false);
      }
    };
    
    fetchSites();
  }, [firebaseUser]);


  const onSubmit = async (data: InviteUserFormData) => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const resultData = await response.json();
      
      if (resultData.success) {
        setResult({
          success: true,
          invitationUrl: resultData.invitationUrl,
        });
        reset(); // Clear form
      } else {
        setResult({
          success: false,
          error: resultData.error || 'Failed to create invitation',
        });
      }
    } catch (error) {
      setResult({
        success: false,
        error: 'Network error occurred',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">
        เชิญผู้ใช้ใหม่
      </h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            อีเมล
          </label>
          <input
            type="email"
            {...register('email', { required: 'กรุณาใส่อีเมล' })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="user@company.com"
          />
          {errors.email && (
            <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
          )}
        </div>

        {/* Role */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ตำแหน่งงาน
          </label>
          <select
            {...register('role', { required: 'กรุณาเลือกตำแหน่งงาน' })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">-- เลือกตำแหน่งงาน --</option>
            <option value="BIM">BIM</option>
            <option value="Site Admin">Site Admin</option>
            <option value="CM">CM</option>
            <option value="ME">ME (Mechanical/Electrical Engineer)</option>
            <option value="SN">SN (Sanitary Engineer)</option>            
          </select>
          {errors.role && (
            <p className="text-red-500 text-sm mt-1">{errors.role.message}</p>
          )}
        </div>

        {/* แก้ไข: เปลี่ยนจาก Input เป็น Checkbox group */}
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
                โครงการที่ให้เข้าถึง
            </label>
            {sitesLoading ? <p className="text-sm text-gray-500">Loading sites...</p> : (
                <div className="mt-2 p-3 border border-gray-200 rounded-md space-y-2 max-h-40 overflow-y-auto">
                    {availableSites.map(site => (
                        <label key={site.id} className="flex items-center">
                            <input
                                type="checkbox"
                                {...register('sites', { required: 'กรุณาเลือกอย่างน้อย 1 โครงการ' })}
                                value={site.id}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="ml-2 text-sm text-gray-700">{site.name}</span>
                        </label>
                    ))}
                </div>
            )}
            {errors.sites && (
                <p className="text-red-500 text-sm mt-1">{errors.sites.message}</p>
            )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || sitesLoading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'กำลังสร้างคำเชิญ...' : 'สร้างคำเชิญ'}
        </button>
      </form>

      {/* Result Display */}
      {result && (
        <div className="mt-6">
          {result.success ? (
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <h3 className="text-green-800 font-medium mb-2">
                ✅ สร้างคำเชิญสำเร็จ!
              </h3>
              <p className="text-green-700 text-sm mb-3">
                ส่ง link นี้ให้ผู้ใช้:
              </p>
              <div className="bg-white border rounded p-2">
                <code className="text-xs break-all text-gray-800">
                  {result.invitationUrl}
                </code>
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(result.invitationUrl!)}
                className="mt-2 text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
              >
                📋 Copy Link
              </button>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <h3 className="text-red-800 font-medium mb-1">❌ เกิดข้อผิดพลาด</h3>
              <p className="text-red-700 text-sm">{result.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}