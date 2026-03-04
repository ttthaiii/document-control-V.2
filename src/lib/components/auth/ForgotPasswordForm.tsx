'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { HardHat, ArrowLeft, MailCheck } from 'lucide-react';
import Link from 'next/link';

interface ForgotPasswordFormData {
    email: string;
}

export function ForgotPasswordForm() {
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const { register, handleSubmit, formState: { errors } } = useForm<ForgotPasswordFormData>();

    const onSubmit = async (data: ForgotPasswordFormData) => {
        setLoading(true);
        setError('');
        setMessage('');

        try {
            const response = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email: data.email }),
            });

            const result = await response.json();

            if (response.ok) {
                setSuccess(true);
                setMessage(result.message || 'หากมีอีเมลนี้อยู่ในระบบ ระบบได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้แล้ว');
            } else {
                setError(result.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่ภายหลัง');
            }
        } catch (err: any) {
            console.error('Submit forgot password error:', err);
            setError('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-lg text-center">
                <div className="flex justify-center mb-4">
                    <div className="bg-green-100 p-3 rounded-full">
                        <MailCheck className="text-green-600 w-12 h-12" />
                    </div>
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">ตรวจสอบอีเมลของคุณ</h2>
                <p className="text-gray-600 mb-6 leading-relaxed">
                    {message} <br />
                    <span className="text-sm text-gray-400 mt-2 block">(อาจอยู่ในโฟลเดอร์ Junk/Spam)</span>
                </p>
                <Link
                    href="/login"
                    className="inline-flex items-center text-blue-600 hover:text-blue-800 font-medium"
                >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    กลับไปหน้าเข้าสู่ระบบ
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-lg">
            <h2 className="text-3xl font-bold text-center text-gray-800 mb-2 flex items-center justify-center gap-3">
                <HardHat className="text-orange-600" size={40} />
                ลืมรหัสผ่าน
            </h2>
            <p className="text-center text-gray-600 mb-6">กรุณาระบุอีเมลที่ใช้สมัครเพื่อรับลิงก์ตั้งรหัสผ่านใหม่</p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        อีเมล
                    </label>
                    <input
                        type="email"
                        {...register('email', {
                            required: 'กรุณาใส่อีเมล',
                            pattern: {
                                value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                                message: "รูปแบบอีเมลไม่ถูกต้อง"
                            }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                        placeholder="your.email@company.com"
                        disabled={loading}
                    />
                    {errors.email && (
                        <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
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
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors font-medium"
                >
                    {loading ? 'กำลังดำเนินการ...' : 'ส่งลิงก์ตั้งรหัสผ่านใหม่'}
                </button>
            </form>

            <div className="mt-6 text-center">
                <Link
                    href="/login"
                    className="inline-flex items-center text-sm text-gray-500 hover:text-gray-800 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    กลับไปหน้าเข้าสู่ระบบ
                </Link>
            </div>
        </div>
    );
}
