"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { FluidLogo } from '@/components/brand/fluid-logo';

const links = [
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'donors', label: 'For Donors' },
  { id: 'hospitals', label: 'For Hospitals' },
  { id: 'story', label: 'Our Story' },
  { id: 'contact', label: 'Contact' },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [active, setActive] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const scroll = () => setCompact(window.scrollY > 32);
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    scroll();
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('keydown', escape);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting);
      if (visible.length) setActive(visible[0].target.id);
    }, { rootMargin: '-15% 0px -55% 0px', threshold: 0 });
    links.forEach(({ id }) => { const section = document.getElementById(id); if (section) observer.observe(section); });
    return () => { observer.disconnect(); window.removeEventListener('scroll', scroll); window.removeEventListener('keydown', escape); };
  }, []);
  return (
    <header className={`public-nav ${compact ? 'public-nav--compact' : ''}`}>
      <div className="public-container public-nav__inner">
        <Link href="/" aria-label="FLUID home" onClick={() => setOpen(false)}><FluidLogo className="h-8 text-[32px] md:h-10 md:text-[40px]" /></Link>
        <nav className="public-nav__desktop" aria-label="Main navigation">{links.map(({ id, label }) => <Link key={id} href={`/#${id}`} aria-current={active === id ? 'location' : undefined}>{label}</Link>)}</nav>
        <div className="public-nav__actions"><Link className="public-sign-in" href="/auth/login">Sign In</Link><Link className="public-button public-button--small" href="/auth/register">Get Started <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
        <button ref={trigger} className="public-menu-button" type="button" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-controls="public-mobile-menu" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={22} /> : <Menu size={22} />}</button>
      </div>
      {open && <nav id="public-mobile-menu" className="public-mobile-menu public-container" aria-label="Mobile navigation">
        {links.map(({ id, label }) => <Link key={id} href={`/#${id}`} onClick={() => setOpen(false)} aria-current={active === id ? 'location' : undefined}>{label}<ArrowUpRight size={16} aria-hidden="true" /></Link>)}
        <div><Link href="/auth/login" onClick={() => setOpen(false)}>Sign In</Link><Link className="public-button" href="/auth/register" onClick={() => setOpen(false)}>Get Started <ArrowUpRight size={16} /></Link></div>
      </nav>}
    </header>
  );
}
