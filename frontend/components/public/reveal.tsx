"use client";
import { useEffect, useRef, type ReactNode } from 'react';

/** Content stays visible without JavaScript and for reduced-motion visitors. */
export function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    const rect = element.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) return;
    element.dataset.reveal = 'waiting';
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { element.dataset.reveal = 'visible'; observer.disconnect(); } }, { threshold: 0.08 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`public-reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}
