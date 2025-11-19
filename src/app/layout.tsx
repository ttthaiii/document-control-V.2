import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth/useAuth'
import { LoadingProvider } from '@/lib/context/LoadingContext'
import { NotificationProvider } from '@/lib/context/NotificationContext'

const inter = Inter({ subsets: ['latin'] })

// ✅ 1. เพิ่ม manifest และ icons ใน metadata
export const metadata = {
  title: 'ttsdoc v2 - Construction Document Management',
  description: 'Professional construction document management system',
  manifest: '/manifest.json', // 👈 บรรทัดสำคัญ! เชื่อมต่อกับไฟล์ที่เราสร้างไว้
  icons: {
    icon: '/favicon.ico', // หรือระบุ path รูป icon ของคุณ
    apple: '/icons/icon-192x192.png', // สำหรับ iOS
  }
}

// ✅ 2. (Optional) เพิ่ม Viewport เพื่อคุมสี Theme Bar ด้านบนมือถือ
export const viewport = {
  themeColor: '#f97316', // สีส้มตาม Theme ของคุณ
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="th">
      <body className={inter.className}>
        <AuthProvider>
          <LoadingProvider>
            <NotificationProvider>
              {children}
            </NotificationProvider>
          </LoadingProvider>
        </AuthProvider>
      </body>
    </html>
  )
}