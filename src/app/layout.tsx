// src/app/layout.tsx
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth/useAuth'
import { LoadingProvider } from '@/lib/context/LoadingContext'
import { NotificationProvider } from '@/lib/context/NotificationContext' //  <-- 1. Import เข้ามา

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'ttsdoc v2 - Construction Document Management',
  description: 'Professional construction document management system',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="th">
      <body>
        <AuthProvider>
          <LoadingProvider>
            <NotificationProvider> {/* <-- 2. นำไปครอบ children */}
              {children}
            </NotificationProvider>
          </LoadingProvider>
        </AuthProvider>
      </body>
    </html>
  )
}