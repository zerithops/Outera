import React from 'react';

export const OFFICIAL_OUTERA_LOGO_PATH =
  '/assets/aistudio/Neon_Lime_OUTERA_Tech_Logo_8daa6fb0.png';

interface OuteraLogoProps {
  /**
   * Optical letter height preset:
   * - xs: 14px letter height (kickers, modal subtitles, badges)
   * - sm: 18px letter height (mobile navbar, compact headers)
   * - md: 22px letter height (desktop navbar, auth header)
   * - lg: 28px letter height (hero / footer / splash)
   */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  /**
   * Optional surface mode. When 'light', wraps the logo in a sleek dark
   * badge container so the white "UTERA" lettering and electric-lime "O"
   * maintain 100% contrast without recoloring or altering the brand asset.
   */
  surface?: 'dark' | 'light';
}

/**
 * Renders the exact uploaded official OUTERA logo asset
 * (/assets/aistudio/Neon_Lime_OUTERA_Tech_Logo_8daa6fb0.png, 2172x724 RGBA).
 *
 * The source PNG has non-transparent artwork bounds at:
 *   x: 88..2062 (width: 1974px, 90.884% of canvas width)
 *   y: 247..440 (height: 193px, 26.657% of canvas height)
 *
 * This component crops out only the transparent outer margin using a lossless
 * CSS viewport window while preserving the exact 1:1 original pixel aspect
 * ratio (1974 : 193 = 10.228 : 1), with zero distortion, redrawing, or recoloring.
 */
export const OuteraLogo: React.FC<OuteraLogoProps> = ({
  size = 'md',
  className = '',
  surface = 'dark',
}) => {
  // Exact optical dimensions preserving the 1974:193 (10.228:1) visible artwork ratio
  const dimensions: Record<'xs' | 'sm' | 'md' | 'lg', { width: number; height: number }> = {
    xs: { width: 123, height: 12 },
    sm: { width: 164, height: 16 },
    md: { width: 205, height: 20 },
    lg: { width: 266, height: 26 },
  };

  const { width, height } = dimensions[size];

  const logoViewport = (
    <span
      className={`relative inline-block overflow-hidden select-none shrink-0 align-middle ${className}`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
      }}
      aria-label="OUTERA"
    >
      <img
        src={OFFICIAL_OUTERA_LOGO_PATH}
        alt="OUTERA"
        draggable={false}
        style={{
          position: 'absolute',
          width: '109.98%',
          height: '375.13%',
          maxWidth: 'none',
          left: '-4.46%',
          top: '-127.98%',
          objectFit: 'fill',
        }}
      />
    </span>
  );

  if (surface === 'light') {
    return (
      <span className="inline-flex items-center justify-center px-3 py-1.5 rounded-xl bg-[#090a0c] border border-black/15 shadow-sm">
        {logoViewport}
      </span>
    );
  }

  return logoViewport;
};
