// src/components/shared/NotificationModal.tsx
'use client';

import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, X } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'warning';

interface NotificationModalProps {
  isOpen: boolean;
  type: NotificationType;
  title: string;
  message: string | null;
  onClose: () => void;
  autoClose?: boolean;
}

const ICONS = {
  success: <CheckCircle className="h-14 w-14 text-green-500" />,
  error: <XCircle className="h-14 w-14 text-red-500" />,
  warning: <AlertTriangle className="h-14 w-14 text-yellow-500" />,
};

const ICON_BG = {
  success: 'bg-green-50',
  error: 'bg-red-50',
  warning: 'bg-yellow-50',
};

const BUTTON_STYLES = {
  success: 'bg-green-600 hover:bg-green-700',
  error: 'bg-red-600 hover:bg-red-700',
  warning: 'bg-yellow-600 hover:bg-yellow-700',
};

const BUTTON_TEXT = {
  success: 'เข้าใจแล้ว',
  error: 'ปิด',
  warning: 'รับทราบ',
};

const NotificationModal: React.FC<NotificationModalProps> = ({ isOpen, type, title, message, onClose, autoClose = false }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-modal-top flex items-center justify-center p-4">
      <div className="relative bg-surface rounded-xl shadow-2xl border border-border-subtle w-full max-w-md mx-auto overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Colored accent header */}
        <div className={`${ICON_BG[type]} px-6 pt-8 pb-6 flex flex-col items-center`}>
          <div className="flex justify-center mb-4">
            {ICONS[type]}
          </div>
          <h3 className="text-xl font-bold text-text-body text-center">{title}</h3>
        </div>
        {/* Body */}
        <div className="px-6 py-5">
          {message && (
            <p className="text-text-secondary text-sm mb-5 whitespace-pre-wrap text-center">{message}</p>
          )}
          {!autoClose && (
            <button
              onClick={onClose}
              className={`w-full px-4 py-2.5 text-white font-semibold rounded-lg transition-colors text-sm focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-brand ${BUTTON_STYLES[type]}`}
            >
              {BUTTON_TEXT[type]}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationModal;