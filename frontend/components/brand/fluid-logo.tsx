"use client";

import { useId } from 'react';
import { cn } from '@/lib/utils';

type FluidLogoProps = {
  variant?: 'horizontal' | 'compact' | 'icon-only';
  tone?: 'light' | 'dark';
  className?: string;
  animated?: boolean;
};

const variants = { horizontal: 'fluid-logo--horizontal', compact: 'fluid-logo--compact', 'icon-only': 'fluid-logo--icon-only' };
const tones = { light: 'fluid-logo--light', dark: 'fluid-logo--dark' };

/** Height is controlled by the container; the square symbol never stretches. */
export function FluidLogo({ variant = 'horizontal', tone = 'light', className, animated = true }: FluidLogoProps) {
  const gradientId = `fluid-${useId().replace(/:/g, '')}`;
  return (
    <span role="img" aria-label="FLUID" className={cn('fluid-logo', variants[variant], tones[tone], animated && 'fluid-logo--animated', className)}>
      <svg className="fluid-logo__symbol" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="8" y1="0" x2="56" y2="64" gradientUnits="userSpaceOnUse">
            <stop stopColor="#D44B3D" />
            <stop offset="0.55" stopColor="#C0392B" />
            <stop offset="1" stopColor="#A93226" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="17" fill={`url(#${gradientId})`} />
        <g className="fluid-logo__heart">
          <path d="M32 51C28 48 12 37 12 25C12 18.4 16.7 14 22.5 14C26.5 14 29.9 16.2 32 19.5C34.1 16.2 37.5 14 41.5 14C47.3 14 52 18.4 52 25C52 37 36 48 32 51Z" fill="white" />
          <path className="fluid-logo__drop" d="M32 24C30 27.2 25.5 32.3 25.5 36.1C25.5 39.7 28.4 42.5 32 42.5C35.6 42.5 38.5 39.7 38.5 36.1C38.5 32.3 34 27.2 32 24Z" fill="#C0392B" />
        </g>
      </svg>
      {variant !== 'icon-only' && <span aria-hidden="true" className="fluid-logo__wordmark">FLUID</span>}
    </span>
  );
}
