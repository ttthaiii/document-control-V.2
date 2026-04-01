import React, { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'ยืนยัน',
  cancelText = 'ยกเลิก',
  onConfirm,
  onCancel,
  type = 'danger'
}: ConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        confirmButtonRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-modal-top bg-black/50 flex items-center justify-center p-4">
      <div 
        className="bg-surface rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className="flex items-start justify-between mb-4">
          <h2 id="dialog-title" className="text-xl font-bold text-text-body flex items-center gap-2">
            {type === 'danger' && <AlertTriangle className="text-red-500 w-6 h-6" />}
            {title}
          </h2>
          <button 
            onClick={onCancel}
            className="text-text-secondary hover:text-text-body transition-colors"
            aria-label="ปิดกล่องข้อความ"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        
        <p className="text-text-secondary mb-6">{message}</p>
        
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-text-body bg-surface-raised border border-border-subtle rounded-lg hover:bg-surface-muted transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-brand"
          >
            {cancelText}
          </button>
          <button
            ref={confirmButtonRef}
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-brand ${
              type === 'danger' 
                ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500' 
                : type === 'warning'
                ? 'bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-500'
                : 'bg-brand hover:bg-orange-600 focus-visible:ring-brand'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
