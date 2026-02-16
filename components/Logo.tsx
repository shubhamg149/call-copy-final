
import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Logo: React.FC<LogoProps> = ({ className = "" }) => {
  return (
    <div className={`relative flex items-center justify-center bg-white rounded-2xl shadow-inner overflow-hidden border border-slate-100 p-1.5 ${className}`}>
      <svg 
        viewBox="0 0 100 100" 
        className="w-full h-full text-[#20b384]" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <path 
          d="M50 5L15 25V75L50 95L85 75V25L50 5Z" 
          stroke="currentColor" 
          strokeWidth="8" 
          strokeLinejoin="round"
        />
        <path 
          d="M30 50L45 65L75 35" 
          stroke="currentColor" 
          strokeWidth="10" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        />
        <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" opacity="0.3" />
      </svg>
    </div>
  );
};
