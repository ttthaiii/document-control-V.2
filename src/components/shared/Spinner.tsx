// src/components/shared/Spinner.tsx
import React from 'react';

interface SpinnerProps {
  className?: string;
}

const Spinner = ({ className }: SpinnerProps) => {
  // เปลี่ยนสี default เป็นสีเทา และปรับปรุงให้ยืดหยุ่นขึ้น
  const finalClassName = `
    inline-block h-8 w-8 animate-spin rounded-full 
    border-4 border-solid border-current border-e-transparent 
    align-[-0.125em] text-gray-400 motion-reduce:animate-[spin_1.5s_linear_infinite]
    ${className || ''}
  `;

  return (
    <div className={finalClassName.trim()} role="status">
      <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">
        Loading...
      </span>
    </div>
  );
};

export default Spinner;