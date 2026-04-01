// src/components/shared/Spinner.tsx
import React from 'react';

interface SpinnerProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES = {
  sm: 'h-4 w-4 border-[3px]',
  md: 'h-5 w-5 border-[3px]',
  lg: 'h-8 w-8 border-4',
};

const Spinner = ({ className, size = 'md' }: SpinnerProps) => {
  const sizeClass = SIZE_CLASSES[size];
  const finalClassName = `
    inline-block ${sizeClass} animate-spin rounded-full 
    border-solid border-current border-e-transparent 
    align-[-0.125em] text-text-secondary motion-reduce:animate-[spin_1.5s_linear_infinite]
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