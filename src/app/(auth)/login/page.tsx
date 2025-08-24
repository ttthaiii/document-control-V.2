import { LoginForm } from '@/lib/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-gray-100 flex items-center justify-center p-4">
      <LoginForm />
    </div>
  );
}