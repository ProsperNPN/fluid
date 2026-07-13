'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause } from 'lucide-react';
import { iPhoneFrame as IPhoneFrame } from '@/components/ui/iphone-frame';
import { DemoScreen, type ScreenType } from '@/components/demo/demo-screen';

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

const SCREEN_DURATION = 2800; // ms per screen
const PAUSE_DURATION = 1500; // ms between sequences
const TOTAL_DEMO_DURATION = DEMO_SEQUENCE.length * SCREEN_DURATION + PAUSE_DURATION;

export function InteractivePhoneDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentScreenIndex, setCurrentScreenIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isHovering, setIsHovering] = useState(false);
  const animationRef = useRef<number>();
  const startTimeRef = useRef<number | undefined>(undefined);
  const pausedTimeRef = useRef<number>(0);

  const currentScreen = DEMO_SEQUENCE[currentScreenIndex];

  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const animate = (currentTime: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = currentTime - pausedTimeRef.current;
      }

      const elapsed = currentTime - (startTimeRef.current || 0);
      const screenIndex = Math.floor(elapsed / SCREEN_DURATION) % DEMO_SEQUENCE.length;

      if (screenIndex !== currentScreenIndex) {
        setCurrentScreenIndex(screenIndex);
      }

      // Check if demo should restart
      if (elapsed > TOTAL_DEMO_DURATION) {
        pausedTimeRef.current = 0;
        startTimeRef.current = undefined;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, currentScreenIndex]);

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) {
      pausedTimeRef.current += Date.now() - (startTimeRef.current || Date.now());
    } else {
      pausedTimeRef.current = 0;
      startTimeRef.current = undefined;
    }
    setIsPlaying(!isPlaying);
  };

  const handlePhoneClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) {
      pausedTimeRef.current += Date.now() - (startTimeRef.current || Date.now());
    } else {
      pausedTimeRef.current = 0;
      startTimeRef.current = undefined;
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <motion.div onClick={handlePhoneClick} className="cursor-pointer">
        <IPhoneFrame isPlaying={isPlaying}>
          <AnimatePresence mode="wait">
            <DemoScreen key={currentScreen} screenType={currentScreen} isVisible={true} />
          </AnimatePresence>
        </IPhoneFrame>
      </motion.div>

      {/* Play/Pause Button */}
      <motion.button
        onClick={handlePlayPause}
        className="absolute inset-0 mx-auto my-auto h-20 w-20 rounded-full bg-black/30 backdrop-blur-sm hover:bg-black/40 transition flex items-center justify-center"
        animate={{
          opacity: isHovering && !isPlaying ? 1 : isPlaying ? 0 : 0.7,
          pointerEvents: isPlaying ? 'none' : 'auto'
        }}
        whileHover={!isPlaying ? { scale: 1.1 } : {}}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          className="relative flex items-center justify-center"
          animate={isHovering && !isPlaying ? { scale: 1 } : { scale: 0.9 }}
          transition={{ duration: 0.2 }}
        >
          {/* Ripple effect */}
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-white"
            animate={{ scale: isHovering && !isPlaying ? [1, 1.2] : 1, opacity: isHovering && !isPlaying ? [0.5, 0] : 0 }}
            transition={{ duration: 0.8, repeat: isHovering && !isPlaying ? Infinity : 0 }}
          />

          {/* Glow */}
          <motion.div
            className="absolute inset-0 rounded-full bg-white/20 blur-lg"
            animate={{ scale: isHovering && !isPlaying ? 1.2 : 1 }}
            transition={{ duration: 0.3 }}
          />

          {/* Button content */}
          <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white">
            {isPlaying ? (
              <Pause className="h-6 w-6 text-slate-900 ml-0.5" fill="currentColor" />
            ) : (
              <Play className="h-6 w-6 text-slate-900 ml-0.5" fill="currentColor" />
            )}
          </div>
        </motion.div>
      </motion.button>

      {/* Screen indicator dots */}
      <motion.div
        className="absolute bottom-0 left-1/2 mt-8 flex gap-1.5 -translate-x-1/2 translate-y-16"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.3 }}
      >
        {DEMO_SEQUENCE.map((_, index) => (
          <motion.div
            key={index}
            className="h-1.5 w-1.5 rounded-full bg-slate-400"
            animate={{
              scale: index === currentScreenIndex ? 1.4 : 1,
              backgroundColor: index === currentScreenIndex ? '#ef4444' : '#cbd5e1'
            }}
            transition={{ duration: 0.2 }}
          />
        ))}
      </motion.div>

      {/* Demo status text */}
      <motion.div
        className="absolute bottom-0 -translate-y-20 text-center text-xs text-slate-500"
        animate={{ opacity: isHovering ? 1 : 0.6 }}
        transition={{ duration: 0.2 }}
      >
        <p>Click to {isPlaying ? 'pause' : 'play'}</p>
      </motion.div>
    </div>
  );
}
