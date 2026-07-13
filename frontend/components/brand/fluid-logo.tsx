import { cn } from '@/lib/utils';

export function FluidLogo({ className }: { className?: string }) {
  return (
    <img
      src="/logo.svg"
      width={880}
      height={220}
      alt="FLUID"
      className={cn('block h-auto', className)}
      loading="eager"
      decoding="async"
    />
  );
}
