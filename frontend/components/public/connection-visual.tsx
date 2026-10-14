"use client";

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Bell, Check, Droplet, Hospital, MapPin, RotateCcw, ShieldCheck, UserRound } from 'lucide-react';
import { FluidLogo } from '@/components/brand/fluid-logo';

export function ConnectionVisual() {
  const [run, setRun] = useState(0);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setStarted(true); setPlaying(true); observer.disconnect(); } }, { threshold: 0.3 });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!started) return;
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 6200;
    const timer = setTimeout(() => setPlaying(false), duration);
    return () => clearTimeout(timer);
  }, [run, started]);
  return <div ref={ref} className="connection-visual connection-visual--human" aria-label="Illustration of a hospital request connecting with a compatible donor">
    <div className="connection-visual__top"><span><span className="public-dot" /> A connection that matters</span><span>ILLUSTRATIVE JOURNEY</span></div>
    <div key={run} className={`connection-scene ${started ? 'connection-scene--started' : ''}`}>
      <div className="connection-warmth" aria-hidden="true" />
      <div className="connection-donor-photo"><Image src="/images/donor-hero.webp" alt="Illustrative portrait of a smiling donor relaxing in a donation chair" fill priority sizes="(max-width: 640px) 85vw, (max-width: 960px) 460px, 550px" /></div>
      <div className="connection-orbit connection-orbit--one" /><div className="connection-orbit connection-orbit--two" />
      <svg className="connection-path" viewBox="0 0 520 430" fill="none" aria-hidden="true">
        <path d="M390 130C505 145 488 275 380 320S140 375 120 260" stroke="#E8A59B" strokeWidth="2" strokeDasharray="5 6" />
        <path className="connection-path__draw" pathLength="1" d="M390 130C505 145 488 275 380 320S140 375 120 260" stroke="#C0392B" strokeWidth="2.5" />
        <g className="connection-path__drop"><circle r="17" fill="#FFF1F0" /><path d="M0-10C-2-6-7-1-7 3A7 7 0 0 0 7 3C7-1 2-6 0-10Z" fill="#C0392B" /></g>
        <circle className="connection-path__endpoint" cx="120" cy="260" r="5" fill="#C0392B" />
      </svg>
      <div className="connection-card connection-card--hospital">
        <div className="connection-card__heading"><span className="public-icon"><Hospital size={23} /></span><span>Blood request<small><ShieldCheck size={12} /> Hospital workspace</small></span></div>
        <div className="connection-card__request"><span><Droplet size={18} /> Blood request</span><span className="public-tag">URGENT</span></div>
        <p>Find eligible donors nearby.</p><div className="connection-card__status"><span className="public-dot" /> Request created</div>
      </div>
      <div className="connection-hub"><FluidLogo variant="icon-only" className="h-9" animated={false} /><span>Every connection<br /><strong>begins with you.</strong></span></div>
      <div className="connection-card connection-card--donor">
        <div className="connection-card__heading"><span className="connection-avatar"><UserRound size={23} /></span><span>You could help.<small><MapPin size={12} /> A nearby opportunity</small></span><Bell size={17} className="connection-bell" /></div>
        <div className="connection-card__notification"><span className="public-icon"><Droplet size={16} /></span><span>A compatible request<small>Your blood type could help.</small></span></div>
        <div className="connection-card__status connection-card__status--donor"><Check size={14} /> Ready to connect</div>
      </div>
      <span className="connection-floating-drop connection-floating-drop--one"><Droplet size={18} /></span><span className="connection-floating-drop connection-floating-drop--two"><Droplet size={12} /></span>
    </div>
    <div className="connection-visual__bottom"><span>From urgent need to human connection.</span><button type="button" disabled={playing} aria-label="Replay the connection illustration" onClick={() => { setRun(run + 1); setPlaying(true); }}><RotateCcw size={14} /> Replay</button></div>
  </div>;
}
