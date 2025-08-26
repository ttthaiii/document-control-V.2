// src/lib/auth/useAuth.ts
'use client'

import React, { useState, useEffect, useContext, createContext } from 'react'
import { User, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/client'
import { signOut } from 'firebase/auth'

// User interface for our app
interface AppUser {
  id: string
  email: string
  role: 'BIM' | 'Site Admin' | 'CM' | 'Admin'
  sites?: string[]
  status: 'ACTIVE' | 'DISABLED'
  createdFromInvitation?: boolean
  createdAt?: Date
  acceptedAt?: Date
}

// Auth context interface
interface AuthContextType {
  user: AppUser | null
  firebaseUser: User | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  logout: () => Promise<void>  // ← เพิ่มบรรทัดนี้
}

// Create context with default value
const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  loading: true,
  error: null,
  refetch: async () => {},
  logout: async () => {}  // ← เพิ่มบรรทัดนี้
})

// Auth Provider component
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchUserData = async (firebaseUser: User) => {
    try {
      setError(null)
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid))
      
      if (userDoc.exists()) {
        const userData = userDoc.data()
        setUser({
          id: firebaseUser.uid,
          email: firebaseUser.email || '',
          role: userData.role,
          sites: userData.sites || [],
          status: userData.status || 'ACTIVE',
          createdFromInvitation: userData.createdFromInvitation,
          createdAt: userData.createdAt?.toDate(),
          acceptedAt: userData.acceptedAt?.toDate()
        })
      } else {
        setError('ไม่พบข้อมูลผู้ใช้ในระบบ')
        setUser(null)
      }
    } catch (err) {
      console.error('Error fetching user data:', err)
      setError('เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ใช้')
      setUser(null)
    }
  }

  const refetch = async () => {
    if (firebaseUser) {
      await fetchUserData(firebaseUser)
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        setLoading(true)
        setFirebaseUser(firebaseUser)
        
        if (firebaseUser) {
          await fetchUserData(firebaseUser)
        } else {
          setUser(null)
          setError(null)
        }
      } catch (err) {
        console.error('Auth state change error:', err)
        setError('เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์')
      } finally {
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [])

  const logout = async () => {
    try {
      await signOut(auth)
      setUser(null)
      setFirebaseUser(null)
      setError(null)
    } catch (err) {
      console.error('Logout error:', err)
      throw err
    }
  }

  const value: AuthContextType = {
    user,
    firebaseUser,
    loading,
    error,
    refetch,
    logout  // ← เพิ่มบรรทัดนี้
  }

  return React.createElement(
    AuthContext.Provider,
    { value },
    children
  )
}

// Hook to use auth context - THIS IS THE EXPORT THAT WAS MISSING
export function useAuth(): AuthContextType {
  return useContext(AuthContext)
}