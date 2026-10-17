import React from 'react';

interface FabyLogoProps {
  customUrl?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const OFFICIAL_LOGO_LOCAL = '/logo_oficial.png';
export const OFFICIAL_LOGO_FALLBACK = 'https://i.ibb.co/20bX8smp/IMG-20261016-WA0070.jpg';

export const FabyLogo: React.FC<FabyLogoProps> = ({ customUrl, className = '', size = 'lg' }) => {
  const logoSrc = customUrl && customUrl.trim() !== '' ? customUrl : OFFICIAL_LOGO_LOCAL;

  const sizeClasses = {
    sm: 'h-10 sm:h-12 md:h-14 w-auto max-w-[140px]',
    md: 'h-14 sm:h-18 md:h-22 w-auto max-w-[190px]',
    lg: 'h-14 xs:h-16 sm:h-16 md:h-20 lg:h-24 w-auto max-w-[125px] xs:max-w-[155px] sm:max-w-[220px] md:max-w-[280px]',
    xl: 'h-24 sm:h-32 md:h-40 w-auto max-w-[340px]',
  }[size];

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 select-none bg-transparent ${className}`}>
      <img
        src={logoSrc}
        alt="Faby Lanches - Logo Oficial"
        onError={(e) => {
          const target = e.currentTarget;
          if (target.src !== OFFICIAL_LOGO_FALLBACK) {
            target.src = OFFICIAL_LOGO_FALLBACK;
          }
        }}
        className={`object-contain bg-transparent transition-all duration-200 drop-shadow-md hover:drop-shadow-xl ${sizeClasses}`}
        loading="eager"
      />
    </div>
  );
};
