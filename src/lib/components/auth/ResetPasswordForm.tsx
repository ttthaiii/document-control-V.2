'use client';
import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { HardHat, CheckCircle, AlertCircle, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';

interface ResetPasswordFormData {
    password: string;
    confirmPassword: string;
}

export function ResetPasswordForm() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const oobCode = searchParams.get('oobCode');

    const [loading, setLoading] = useState(true); // Start loading while verifying code
    const [submitting, setSubmitting] = useState(false);
    const [email, setEmail] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const { register, handleSubmit, watch, formState: { errors } } = useForm<ResetPasswordFormData>();
    const newPassword = watch('password');

    // 1. ตรวจสอบ oobCode เมื่อโหลดหน้า
    useEffect(() => {
        const verifyCode = async () => {
            if (!oobCode) {
                setError('ไม่พบรหัสอ้างอิงสำหรับตั้งรหัสผ่านใหม่ ลิงก์อาจไม่สมบูรณ์');
                setLoading(false);
                return;
            }

            try {
                // ตรวจสอบกับ Firebase ว่า oobCode ยังใช้งานได้หรือไม่
                const userEmail = await verifyPasswordResetCode(auth, oobCode);
                setEmail(userEmail);
                setError('');
            } catch (err: any) {
                console.error("Invalid or expired action code:", err);
                if (err.code === 'auth/invalid-action-code') {
                    setError('ลิงก์นี้หมดอายุหรือถูกใช้งานไปแล้ว กรุณาขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้ง');
                } else {
                    setError('เกิดข้อผิดพลาดในการตรวจสอบลิงก์ กรุณาลองใหม่อีกครั้ง หรือขอลิงก์ใหม่');
                }
            } finally {
                setLoading(false);
            }
        };

        verifyCode();
    }, [oobCode]);

    // 2. ฟังก์ชัน Submit รหัสผ่านใหม่
    const onSubmit = async (data: ResetPasswordFormData) => {
        if (!oobCode) return;

        setSubmitting(true);
        setError('');

        try {
            await confirmPasswordReset(auth, oobCode, data.password);
            setSuccess(true);

            // รอ 3 วินาทีแล้วพาไปหน้า Login
            setTimeout(() => {
                router.push('/login');
            }, 3000);

        } catch (err: any) {
            console.error("Failed to reset password:", err);
            setError(err.message || 'ไม่สามารถตั้งรหัสผ่านใหม่ได้ กรุณาลองอีกครั้ง');
        } finally {
            setSubmitting(false);
        }
    };

    // State 1: กำลังโหลด / ตรวจสอบลิงก์
    if (loading) {
        return (
            <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-lg text-center">
                <p className="text-gray-600">กำลังตรวจสอบข้อมูล...</p>
            </div>
        );
    }

    // State 2: ลิงก์มีปัญหา (Error สวยงาม)
    if (error && !email) {
        return (
            <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-lg text-center">
                <div className="flex justify-center mb-4">
                    <div className="bg-red-100 p-3 rounded-full">
                        <AlertCircle className="text-red-500 w-12 h-12" />
                    </div>
                </div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">ลิงก์ไม่ถูกต้อง หรือหมดอายุ</h2>
                <p className="text-gray-600 mb-6">{error}</p>
                <Link
                    href="/forgot-password"
                    className="inline-flex items-center text-blue-600 hover:text-blue-800 font-medium bg-blue-50 px-4 py-2 rounded-md"
                >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    ขอลิงก์ตั้งรหัสผ่านใหม่
                </Link>
            </div>
        );
    }

    // State 3: สำเร็จ
    if (success) {
        return (
            <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-lg text-center">
                <div className="flex justify-center mb-4">
                    <div className="bg-green-100 p-3 rounded-full">
                        <CheckCircle className="text-green-600 w-12 h-12" />
                    </div>
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">ตั้งรหัสผ่านสำเร็จ</h2>
                <p className="text-gray-600 mb-6">รหัสผ่านของคุณถูกเปลี่ยนเรียบร้อยแล้ว<br />ระบบกำลังพาคุณไปหน้าเข้าสู่ระบบ...</p>
                <Link href="/login" className="text-blue-600 hover:underline">คลิกที่นี่หากระบบไม่เปลี่ยนหน้าอัตโนมัติ</Link>
            </div>
        );
    }

    // State 4: หน้าฟอร์มปกติ
    return (
        <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-lg border border-gray-100">
            <h2 className="text-2xl font-bold text-center text-gray-800 mb-2 flex items-center justify-center gap-3">
                <HardHat className="text-orange-600" size={32} />
                ตั้งรหัสผ่านใหม่
            </h2>
            <div className="bg-blue-50 p-3 rounded-md mb-6 border border-blue-100 text-center">
                <span className="text-sm text-gray-600">สำหรับบัญชี:</span><br />
                <span className="font-semibold text-blue-800">{email}</span>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่านใหม่ <span className="text-red-500">*</span></label>
                    <div className="relative">
                        <input
                            type={showPassword ? "text" : "password"}
                            {...register('password', {
                                required: 'กรุณาใส่รหัสผ่านใหม่',
                                minLength: { value: 6, message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }
                            })}
                            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 pr-10"
                            placeholder="••••••••"
                            disabled={submitting}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                            tabIndex={-1}
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                    {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ยืนยันรหัสผ่านใหม่ <span className="text-red-500">*</span></label>
                    <div className="relative">
                        <input
                            type={showConfirmPassword ? "text" : "password"}
                            {...register('confirmPassword', {
                                required: 'กรุณายืนยันรหัสผ่าน',
                                validate: value => value === newPassword || 'รหัสผ่านคลาดเคลื่อน (ไม่ตรงกัน)'
                            })}
                            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 pr-10"
                            placeholder="••••••••"
                            disabled={submitting}
                        />
                        <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                            tabIndex={-1}
                        >
                            {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                    {errors.confirmPassword && <p className="text-red-500 text-sm mt-1">{errors.confirmPassword.message}</p>}
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-3">
                        <p className="text-red-700 text-sm">{error}</p>
                    </div>
                )}

                <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-blue-300 transition-colors font-medium mt-4"
                >
                    {submitting ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
                </button>
            </form>
        </div>
    );
}
