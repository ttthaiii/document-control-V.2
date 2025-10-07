// src/lib/context/NotificationContext.tsx
'use client';

import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import NotificationModal, { NotificationType } from '@/components/shared/NotificationModal';

interface NotificationState {
  isOpen: boolean;
  type: NotificationType;
  title: string;
  message: string | null;
}

interface NotificationContextType {
  showNotification: (type: NotificationType, title: string, message?: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const [notification, setNotification] = useState<NotificationState>({
    isOpen: false,
    type: 'success',
    title: '',
    message: null,
  });

  const showNotification = useCallback((type: NotificationType, title: string, message: string = '') => {
    setNotification({ isOpen: true, type, title, message });
  }, []);

  const handleClose = () => {
    setNotification(prev => ({ ...prev, isOpen: false }));
  };

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      <NotificationModal
        isOpen={notification.isOpen}
        type={notification.type}
        title={notification.title}
        message={notification.message}
        onClose={handleClose}
      />
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};