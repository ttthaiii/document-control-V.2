'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

interface AcceptInvitationFormProps {
  token: string;
}

interface AcceptFormData {
  password: string;
  confirmPassword: string;
}

export function AcceptInvitationForm({ token }: AcceptInvitationFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [invitation, setInvitation] = useState<any>(null);
  const [error, setError] = useState<string>('');

  const { register, handleSubmit, watch, formState: { errors } } = useForm<AcceptFormData>();
  
  const password = watch('password');

  useEffect(() => {
    // Fetch invitation details
    const fetchInvitation = async () => {
      try {
        const response = await fetch(`/api/invitation/accept?token=${token}`);
        const result = await response.json();

        if (result.success) {
          setInvitation(result.invitation);
        } else {
          setError(result.error || 'Invalid invitation');
        }
      } catch (err) {
        setError('Failed to load invitation');
      }
    };

    if (token) {
      fetchInvitation();
    }
  }, [token]);

  const onSubmit = async (data: AcceptFormData) => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/invitation/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password: data.password,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Success! Redirect to login
        alert('✅ บัญชีผู้ใช้สร้างเสร็จแล้ว! กรุณาเข้าสู่ระบบ');
        router.push('/login');
      } else {
        setError(result.error || 'Failed to create account');
      }

    } catch (err) {
      setError('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (!invitation && !error) {
    return (
      <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">กำลังตรวจสอบคำเชิญ...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-lg">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">❌ ข้อผิดพลาด</h2>
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={() => router.push('/login')}
            className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
          >
            กลับสู่หน้าเข้าสู่ระบบ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">
        🎉 ยินดีต้อนรับ!
      </h2>
      
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-blue-800 text-sm">
          <strong>อีเมล:</strong> {invitation.email}<br/>
          <strong>ตำแหน่งงาน:</strong> {invitation.role}<br/>
          <strong>สถานะ:</strong> {invitation.status}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            รหัสผ่าน
          </label>
          <input
            type="password"
            {...register('password', { 
              required: 'กรุณาใส่รหัสผ่าน',
              minLength: { value: 6, message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }
            })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="ใส่รหัสผ่านของคุณ"
          />
          {errors.password && (
            <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ยืนยันรหัสผ่าน
          </label>
          <input
            type="password"
            {...register('confirmPassword', {
              required: 'กรุณายืนยันรหัสผ่าน',
              validate: value => value === password || 'รหัสผ่านไม่ตรงกัน'
            })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="ใส่รหัสผ่านอีกครั้ง"
          />
          {errors.confirmPassword && (
            <p className="text-red-500 text-sm mt-1">{errors.confirmPassword.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'กำลังสร้างบัญชี...' : 'สร้างบัญชีและเข้าสู่ระบบ'}
        </button>
      </form>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}