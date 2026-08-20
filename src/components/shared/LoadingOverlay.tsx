import React from 'react';
import Spinner from '@/components/shared/Spinner';

interface LoadingOverlayProps {
  text?: string;
  subText?: string;
}

export default function LoadingOverlay({ 
  text = 'กำลังดำเนินการ...', 
  subText 
}: LoadingOverlayProps) {
  return (
    <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] z-[100] flex flex-col items-center justify-center rounded-lg gap-3">
      <Spinner className="w-10 h-10 text-blue-600" />
      <p className="text-sm font-medium text-gray-600">{text}</p>
      {subText && <p className="text-xs text-gray-400 mt-1">{subText}</p>}
    </div>
  );
}
