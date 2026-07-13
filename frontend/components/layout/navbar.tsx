"use client";

import { useState } from 'react';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';

const links = [
  { href: '#solution', label: 'Solution' },
  { href: '#hospitals', label: 'Hospitals' },
  { href: '#donors', label: 'Donors' },
  { href: '#analytics', label: 'Analytics' },
  { href: '#faq', label: 'FAQ' }
];

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-8 z-50 px-5 sm:px-8">
      <div className="mx-auto flex h-14 w-full max-w-[980px] items-center rounded-[18px] border border-white/[0.12] bg-[rgba(22,28,45,0.76)] px-2.5 shadow-[0_12px_28px_rgba(2,6,23,0.28)] backdrop-blur-[22px] transition sm:px-2.5">
        <Link href="/" className="inline-flex flex-shrink-0 items-center gap-2.5 lg:min-w-[168px]">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#C0392B]">
            <Heart className="h-5 w-5 fill-white text-white" />
          </span>
          <span className="text-[15px] font-bold tracking-[0.02em] text-white">Fluid</span>
        </Link>
        <nav className="hidden flex-1 items-center justify-center gap-8 text-[13px] font-medium tracking-[0.01em] text-white/90 lg:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="group relative transition duration-[250ms] hover:-translate-y-0.5 hover:text-white"
            >
              {link.label}
              <span className="pointer-events-none absolute -bottom-1 left-0 h-px w-0 bg-white/85 transition-all duration-[250ms] group-hover:w-full" />
            </a>
          ))}
          <Link href="/auth/login" className="group relative transition duration-[250ms] hover:-translate-y-0.5 hover:text-white">
            Sign In
            <span className="pointer-events-none absolute -bottom-1 left-0 h-px w-0 bg-white/85 transition-all duration-[250ms] group-hover:w-full" />
          </Link>
        </nav>
        <div className="hidden flex-shrink-0 items-center lg:flex lg:min-w-[168px] lg:justify-end">
          <Link href="/auth/register">
            <Button className="group flex h-10 items-center gap-1.5 rounded-[12px] bg-[#C0392B] px-6 py-2 text-[13px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_6px_16px_rgba(192,57,43,0.3)] transition duration-[250ms] hover:-translate-y-0.5 hover:bg-[#A93226] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_10px_20px_rgba(169,50,38,0.34)]">
              Get Started
            </Button>
          </Link>
        </div>

        <button
          type="button"
          aria-label="Toggle navigation menu"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((value) => !value)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/90 transition hover:bg-white/10 lg:hidden"
        >
          <span className="text-sm leading-none">{isOpen ? '×' : '☰'}</span>
        </button>
      </div>

      {isOpen && (
        <div className="mx-auto mt-2.5 w-full max-w-[980px] rounded-2xl border border-white/10 bg-[rgba(22,28,45,0.76)] p-2.5 shadow-[0_12px_28px_rgba(2,6,23,0.28)] backdrop-blur-[22px] lg:hidden">
          <nav className="flex flex-col gap-1.5">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className="rounded-lg px-3 py-1.5 text-[13px] font-medium tracking-[0.01em] text-white/90 transition duration-[250ms] hover:bg-white/10 hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="mt-2.5 flex items-center gap-2">
            <Link
              href="/auth/login"
              onClick={() => setIsOpen(false)}
              className="inline-flex h-9 flex-1 items-center justify-center rounded-full border border-white/15 px-3 py-2 text-[13px] font-medium tracking-[0.01em] text-white/[0.85] transition duration-[250ms] hover:bg-white/10 hover:text-white"
            >
              Sign In
            </Link>
            <Link href="/auth/register" onClick={() => setIsOpen(false)} className="flex-1">
              <Button className="group flex h-9 w-full items-center justify-center gap-1.5 rounded-[12px] bg-[#C0392B] px-5 py-2 text-[13px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_6px_16px_rgba(192,57,43,0.3)] transition duration-[250ms] hover:-translate-y-0.5 hover:bg-[#A93226] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_10px_20px_rgba(169,50,38,0.34)]">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
