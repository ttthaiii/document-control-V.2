'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation'; // 👈 1. Import useSearchParams
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { useForm } from 'react-hook-form';

interface LoginFormData {
  email: string;
  password: string;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams(); // 👈 2. เรียกใช้ useSearchParams
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>();

  const onSubmit = async (data: LoginFormData) => {
    setLoading(true);
    setError('');

    try {
      const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
      console.log('Login successful:', userCredential.user);
      
      // --- 🔽 [แก้ไขจุดสำคัญ] 🔽 ---
      const redirectUrl = searchParams.get('redirect');
      // ถ้ามี redirectUrl ให้ไปที่นั่น, ถ้าไม่มีให้ไปที่ /dashboard ตามเดิม
      router.push(redirectUrl || '/dashboard');
      // --- 👆 [สิ้นสุดการแก้ไข] 👆 ---

    } catch (error: any) {
      console.error('Login error:', error);
      
      switch (error.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
          break;
        case 'auth/invalid-email':
          setError('รูปแบบอีเมลไม่ถูกต้อง');
          break;
        case 'auth/too-many-requests':
          setError('มีการพยายามเข้าสู่ระบบมากเกินไป กรุณาลองใหม่ภายหลัง');
          break;
        default:
          setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-lg">
      <h2 className="text-3xl font-bold text-center text-gray-800 mb-2">
        🏗️ ttsdoc v2
      </h2>
      <p className="text-center text-gray-600 mb-6">เข้าสู่ระบบจัดการเอกสารงานก่อสร้าง</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            อีเมล
          </label>
          <input
            type="email"
            {...register('email', { required: 'กรุณาใส่อีเมล' })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="your.email@company.com"
          />
          {errors.email && (
            <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            รหัสผ่าน
          </label>
          <input
            type="password"
            {...register('password', { required: 'กรุณาใส่รหัสผ่าน' })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="••••••••"
          />
          {errors.password && (
            <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-gray-600 text-sm">
          ต้องการสิทธิ์การเข้าใช้งาน? 
          <br />
          <span className="text-blue-600">ติดต่อผู้ดูแลระบบ</span>
        </p>
      </div>
    </div>
  );
}