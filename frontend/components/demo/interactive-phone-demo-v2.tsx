'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Pause, Play } from 'lucide-react';
import { iPhoneFrame as IPhoneFrame } from '@/components/ui/iphone-frame';
import { DemoScreen, type ScreenType } from '@/components/demo/demo-screen';
import { cn } from '@/lib/utils';

const DEMO_SEQUENCE: ScreenType[] = [
  'splash',
  'login',
  'home',
  'requests',
  'search',
  'donor-profile',
  'hospital',
  'emergency',
  'match',
  'booking',
  'analytics',
  'notifications',
  'home-final'
];

const SCREEN_DURATION = 2600;
const PAUSE_DURATION = 1200;
const RUN_DURATION = DEMO_SEQUENCE.length * SCREEN_DURATION;
const CYCLE_DURATION = RUN_DURATION + PAUSE_DURATION;

type InteractivePhoneDemoProps = {
  className?: string;
};

export function InteractivePhoneDemoV2({ className }: InteractivePhoneDemoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>();
  const startTimeRef = useRef<number | undefined>(undefined);
  const pausedElapsedRef = useRef(0);
  const currentScreenIndexRef = useRef(0);
  const hasAutoplayedRef = useRef(false);

  const [currentScreenIndex, setCurrentScreenIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const currentScreen = DEMO_SEQUENCE[currentScreenIndex];

  useEffect(() => {
    currentScreenIndexRef.current = currentScreenIndex;
  }, [currentScreenIndex]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (!hasAutoplayedRef.current) {
            hasAutoplayedRef.current = true;
            pausedElapsedRef.current = 0;
            startTimeRef.current = undefined;
            currentScreenIndexRef.current = 0;
            setCurrentScreenIndex(0);
            setIsPlaying(true);
          }
        }
      },
      { threshold: 0.35 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const animate = (currentTime: number) => {
      if (startTimeRef.current === undefined) {
        startTimeRef.current = currentTime - pausedElapsedRef.current;
      }

      const elapsed = currentTime - startTimeRef.current;
      const cycleElapsed = elapsed % CYCLE_DURATION;

      let nextIndex = DEMO_SEQUENCE.length - 1;
      if (cycleElapsed < RUN_DURATION) {
        nextIndex = Math.floor(cycleElapsed / SCREEN_DURATION);
      }

      if (nextIndex !== currentScreenIndexRef.current) {
        currentScreenIndexRef.current = nextIndex;
        setCurrentScreenIndex(nextIndex);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying]);

  const togglePlayback = () => {
    const now = performance.now();

    if (isPlaying) {
      pausedElapsedRef.current = now - (startTimeRef.current ?? now);
      setIsPlaying(false);
      return;
    }

    startTimeRef.current = now - pausedElapsedRef.current;
    setIsPlaying(true);
  };

  const restartPlayback = () => {
    pausedElapsedRef.current = 0;
    startTimeRef.current = undefined;
    currentScreenIndexRef.current = 0;
    setCurrentScreenIndex(0);
    setIsPlaying(true);
  };

  return (
    <div
      ref={containerRef}
      className={cn('relative flex w-full items-center justify-center', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <motion.div
        className="relative w-full"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={isVisible ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      >
        <motion.div
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="relative mx-auto w-full"
        >
          <div onClick={togglePlayback} className="cursor-pointer">
            <IPhoneFrame
              isPlaying={isPlaying}
              className="mx-auto w-[70vw] max-w-[250px] sm:w-[240px] sm:max-w-[240px] lg:w-[clamp(270px,20vw,300px)] lg:max-w-[300px]"
            >
              <AnimatePresence mode="wait" initial={false}>
                <DemoScreen key={currentScreen} screenType={currentScreen} isVisible={true} />
              </AnimatePresence>
            </IPhoneFrame>
          </div>

          <AnimatePresence>
            {!isPlaying && (
              <motion.button
                key="play-button"
                onClick={(event) => {
                  event.stopPropagation();
                  restartPlayback();
                }}
                className="absolute left-1/2 top-1/2 z-20 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 backdrop-blur-md"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                aria-label="Restart demo"
              >
                <motion.span
                  className="absolute inset-0 rounded-full border border-white/35"
                  animate={{ scale: [1, 1.15], opacity: [0.45, 0] }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: 'easeOut' }}
                />
                <motion.span
                  className="absolute inset-0 rounded-full bg-white/18 blur-xl"
                  animate={isHovered ? { scale: 1.15 } : { scale: 1 }}
                  transition={{ duration: 0.25 }}
                />
                <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-[0_10px_24px_rgba(15,23,42,0.24)]">
                  <Play className="ml-0.5 h-6 w-6 text-slate-900" fill="currentColor" />
                </span>
              </motion.button>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {isPlaying && (
              <motion.button
                key="pause-hit-area"
                onClick={(event) => {
                  event.stopPropagation();
                  togglePlayback();
                }}
                className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/12 text-white/90 backdrop-blur-md opacity-0   "
                initial={{ opacity: 0, scale: 0.95 }}
                exit={{ opacity: 0, scale: 0.95 }}
                aria-label="Pause demo"
              >
                <Pause className="h-4 w-4" fill="currentColor" />
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </div>
  );
}
