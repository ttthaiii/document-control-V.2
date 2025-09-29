import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth/useAuth'
import { LoadingProvider } from '@/lib/context/LoadingContext'

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
          <LoadingProvider> {/* 👈 2. นำไปครอบ children */}
            {children}
          </LoadingProvider>
        </AuthProvider>
      </body>
    </html>
  )
}