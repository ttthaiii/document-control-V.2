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
}

const ICONS = {
  success: <CheckCircle className="h-12 w-12 text-green-500" />,
  error: <XCircle className="h-12 w-12 text-red-500" />,
  warning: <AlertTriangle className="h-12 w-12 text-yellow-500" />,
};

const BUTTON_STYLES = {
  success: 'bg-green-600 hover:bg-green-700',
  error: 'bg-red-600 hover:bg-red-700',
  warning: 'bg-yellow-600 hover:bg-yellow-700',
};

const NotificationModal: React.FC<NotificationModalProps> = ({ isOpen, type, title, message, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-[100] flex items-center justify-center p-4">
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-sm mx-auto p-6 text-center">
        <div className="flex justify-center mb-4">
          {ICONS[type]}
        </div>
        <h3 className="text-xl font-semibold text-gray-800 mb-2">{title}</h3>
        {message && (
          <p className="text-gray-600 text-sm mb-6 whitespace-pre-wrap">{message}</p>
        )}
        <button
          onClick={onClose}
          className={`w-full px-4 py-2 text-white font-semibold rounded-lg transition-colors ${BUTTON_STYLES[type]}`}
        >
          ตกลง
        </button>
      </div>
    </div>
  );
};

export default NotificationModal;