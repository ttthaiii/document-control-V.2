// src/lib/context/LoadingContext.tsx

'use client'

import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import Spinner from '@/components/shared/Spinner';
import { usePathname, useSearchParams } from 'next/navigation';

interface LoadingContextType {
  isLoading: boolean;
  showLoader: () => void;
  hideLoader: () => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export const GlobalSpinner = () => (
  <div className="absolute inset-0 bg-gray-100 z-30 flex items-center justify-center">
    <Spinner className="w-12 h-12 text-gray-500" />
  </div>
);

export const LoadingProvider = ({ children }: { children: ReactNode }) => {
  const [isLoading, setIsLoading] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    setIsLoading(false);
  }, [pathname, searchParams]);

  const showLoader = () => setIsLoading(true);
  const hideLoader = () => setIsLoading(false);

  return (
    <LoadingContext.Provider value={{ isLoading, showLoader, hideLoader }}>
      {/* ❌ เราจะไม่แสดง Spinner ที่นี่โดยตรงแล้ว */}
      {children}
    </LoadingContext.Provider>
  );
};

export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (context === undefined) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
};