import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface iPhoneFrameProps {
  children: ReactNode;
  isPlaying?: boolean;
  className?: string;
}

export function iPhoneFrame({ children, isPlaying, className }: iPhoneFrameProps) {
  return (
    <motion.div
      className={cn('relative w-full select-none', className)}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="relative mx-auto aspect-[430/932] w-full max-w-[430px]">
        <div className="absolute inset-x-8 bottom-[-1.35rem] h-24 rounded-full bg-slate-950/20 blur-3xl" />
        <div className="absolute inset-x-14 bottom-[-0.9rem] h-16 rounded-full bg-slate-900/15 blur-2xl" />

        <div className={cn(
          'absolute inset-0 rounded-[3.25rem] bg-[linear-gradient(150deg,#0d1015_0%,#1b2028_28%,#141920_52%,#0a0d12_100%)] p-[9px] shadow-[0_40px_110px_rgba(15,23,42,0.24),0_18px_36px_rgba(15,23,42,0.14)]',
          isPlaying && 'shadow-[0_46px_120px_rgba(15,23,42,0.25),0_22px_42px_rgba(15,23,42,0.15)]'
        )}>
          <div className="absolute -left-[2px] top-[9.8rem] z-20 h-12 w-[2px] rounded-r-full bg-slate-400/25" />
          <div className="absolute -left-[2px] top-[14.5rem] z-20 h-20 w-[2px] rounded-r-full bg-slate-400/20" />
          <div className="absolute -right-[2px] top-[12.2rem] z-20 h-16 w-[2px] rounded-l-full bg-slate-400/25" />

          <div className="absolute left-1/2 top-[0.54rem] z-20 h-[1.65rem] w-[39%] -translate-x-1/2 rounded-full bg-black shadow-[0_6px_18px_rgba(0,0,0,0.45)]" />
          <div className="absolute left-1/2 top-[0.79rem] z-20 h-[5px] w-[5px] -translate-x-[145%] rounded-full bg-slate-700" />
          <div className="absolute left-1/2 top-[0.83rem] z-20 h-[3px] w-6 -translate-x-[-12%] rounded-full bg-slate-800/85" />

          <div className="relative h-full overflow-hidden rounded-[2.62rem] bg-[#f7f8fb]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.55),transparent_42%),linear-gradient(135deg,rgba(255,255,255,0.18),transparent_38%,rgba(255,255,255,0.08))]" />
            <div className="absolute inset-0 overflow-hidden rounded-[2.62rem] border border-white/10">
              <div className="relative h-full pt-[2.25rem]">
                {children}
                <div className="pointer-events-none absolute bottom-2 left-1/2 h-1.5 w-24 -translate-x-1/2 rounded-full bg-black/40" />
              </div>
            </div>
          </div>

          <div className="pointer-events-none absolute inset-0 rounded-[3.25rem] bg-[linear-gradient(160deg,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0.08)_20%,transparent_42%)]" />
          <div className="pointer-events-none absolute inset-[1px] rounded-[3.2rem] border border-white/12" />
        </div>
      </div>
    </motion.div>
  );
}
