'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { BellRing, CalendarDays, Droplets, Hospital, TrendingUp, UserCheck } from 'lucide-react';
import { InteractivePhoneDemoV2 } from '@/components/demo/interactive-phone-demo-v2';

const leftFeatures = [
  {
    icon: Droplets,
    title: 'Instant Blood Matching',
    description: 'AI-powered compatibility matching in seconds',
    color: 'text-red-500'
  },
  {
    icon: Hospital,
    title: 'Verified Hospitals',
    description: 'Trusted healthcare institutions only',
    color: 'text-slate-500'
  },
  {
    icon: BellRing,
    title: 'Emergency Alerts',
    description: 'Real-time urgent request notifications',
    color: 'text-red-500'
  }
];

const rightFeatures = [
  {
    icon: CalendarDays,
    title: 'Appointment Scheduling',
    description: 'Seamless booking and confirmations',
    color: 'text-slate-500'
  },
  {
    icon: TrendingUp,
    title: 'Predictive Analytics',
    description: 'Forecast blood supply trends ahead',
    color: 'text-red-500'
  },
  {
    icon: UserCheck,
    title: 'Verified Donors',
    description: 'Comprehensive donor verification system',
    color: 'text-slate-500'
  }
];

const columnVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { staggerChildren: 0.12, delayChildren: 0.12, duration: 0.7, ease: 'easeOut' }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: 'easeOut' } }
};

export function PhoneShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const [phoneReady, setPhoneReady] = useState(false);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPhoneReady(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="relative isolate overflow-hidden py-24 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fluid-700 sm:text-xs">Product Demo</p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-950 sm:text-3xl lg:text-[2rem]">
            See FLUID in motion, exactly where it matters.
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-[15px]">
            A calm, premium walkthrough of the mobile experience — from urgent requests to donor matching and analytics.
          </p>
        </motion.div>

        <div className="mt-14 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.38fr)_minmax(0,1fr)] lg:gap-8">
          <motion.div
            className="space-y-4"
            variants={columnVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.35 }}
          >
            {leftFeatures.map((feature) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  variants={itemVariants}
                  className="group rounded-2xl border border-slate-200/80 bg-white/75 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] backdrop-blur-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(15,23,42,0.08)]"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
                      <Icon className={`h-7 w-7 transition duration-300 group-hover:scale-110 ${feature.color}`} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 sm:text-[15px]">{feature.title}</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-600 sm:text-[13px]">{feature.description}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.45 }}
            transition={{ duration: 0.75, ease: 'easeOut' }}
            className="relative mx-auto flex w-full justify-center"
          >
            {phoneReady ? (
              <InteractivePhoneDemoV2 className="w-[70vw] max-w-[250px] sm:w-[240px] sm:max-w-[240px] lg:w-[clamp(270px,20vw,300px)] lg:max-w-[300px]" />
            ) : (
              <div className="w-[70vw] max-w-[250px] sm:w-[240px] sm:max-w-[240px] lg:w-[clamp(270px,20vw,300px)] lg:max-w-[300px]">
                <div className="aspect-[430/932] rounded-[3.4rem] border border-white/60 bg-white/55 shadow-[0_40px_110px_rgba(15,23,42,0.12)] backdrop-blur-2xl" />
              </div>
            )}
          </motion.div>

          <motion.div
            className="space-y-4"
            variants={columnVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.35 }}
          >
            {rightFeatures.map((feature) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  variants={itemVariants}
                  className="group rounded-2xl border border-slate-200/80 bg-white/75 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] backdrop-blur-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(15,23,42,0.08)]"
                >
                  <div className="flex items-start gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 sm:text-[15px]">{feature.title}</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-600 sm:text-[13px]">{feature.description}</p>
                    </div>
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
                      <Icon className={`h-7 w-7 transition duration-300 group-hover:scale-110 ${feature.color}`} />
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
