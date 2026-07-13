'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Droplets, Hospital, BellRing, CalendarDays, TrendingUp, UserCheck } from 'lucide-react';
import { InteractivePhoneDemo } from '@/components/demo/interactive-phone-demo';

const featureItems = [
  {
    side: 'left' as const,
    icon: Droplets,
    title: 'Instant Blood Matching',
    description: 'AI-powered compatibility matching in seconds',
    color: 'text-red-500'
  },
  {
    side: 'left' as const,
    icon: Hospital,
    title: 'Verified Hospitals',
    description: 'Trusted healthcare institutions only',
    color: 'text-slate-500'
  },
  {
    side: 'left' as const,
    icon: BellRing,
    title: 'Emergency Alerts',
    description: 'Real-time urgent request notifications',
    color: 'text-red-500'
  },
  {
    side: 'right' as const,
    icon: CalendarDays,
    title: 'Appointment Scheduling',
    description: 'Seamless booking and confirmations',
    color: 'text-slate-500'
  },
  {
    side: 'right' as const,
    icon: TrendingUp,
    title: 'Predictive Analytics',
    description: 'Forecast blood supply trends ahead',
    color: 'text-red-500'
  },
  {
    side: 'right' as const,
    icon: UserCheck,
    title: 'Verified Donors',
    description: 'Comprehensive donor verification system',
    color: 'text-slate-500'
  }
];

export function FeatureShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'center center']
  });

  // Phone mockup scale and opacity
  const phoneScale = useTransform(scrollYProgress, [0, 1], [0.8, 1]);
  const phoneOpacity = useTransform(scrollYProgress, [0, 0.3, 1], [0, 0.5, 1]);

  // Feature items animation
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.12,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: (side: 'left' | 'right') => ({
      opacity: 0,
      x: side === 'left' ? -40 : 40,
      y: 20
    }),
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0.25, 0.46, 0.45, 0.94] // easeOut
      }
    }
  };

  const leftFeatures = featureItems.filter(f => f.side === 'left');
  const rightFeatures = featureItems.filter(f => f.side === 'right');

  return (
    <section ref={containerRef} className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <div className="mb-16 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fluid-700">Features at a Glance</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">Powerful tools, seamless experience</h2>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_1fr_1fr]">
          {/* Left column features */}
          <motion.div
            className="space-y-6"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
          >
            {leftFeatures.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={i}
                  custom="left"
                  variants={itemVariants}
                  className="group"
                >
                  <div className="flex items-start gap-4">
                    <div className="mt-1 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50">
                      <Icon className={`h-6 w-6 transition duration-300 group-hover:scale-110 ${feature.color}`} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-slate-900">{feature.title}</h3>
                      <p className="mt-1 text-xs text-slate-600">{feature.description}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Center phone mockup */}
          <motion.div
            className="relative flex items-center justify-center"
            style={{
              scale: phoneScale,
              opacity: phoneOpacity
            }}
          >
            <InteractivePhoneDemo />
          </motion.div>

          {/* Right column features */}
          <motion.div
            className="space-y-6"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
          >
            {rightFeatures.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={i}
                  custom="right"
                  variants={itemVariants}
                  className="group"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-slate-900">{feature.title}</h3>
                      <p className="mt-1 text-xs text-slate-600">{feature.description}</p>
                    </div>
                    <div className="mt-1 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-slate-50">
                      <Icon className={`h-6 w-6 transition duration-300 group-hover:scale-110 ${feature.color}`} />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
