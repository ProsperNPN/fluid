import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { FluidLogo } from '@/components/brand/fluid-logo';

export function Footer() {
  return <footer className="public-footer"><div className="public-container">
    <div className="public-footer__grid">
      <div><Link href="/" aria-label="FLUID home"><FluidLogo variant="compact" /></Link><p>Connecting donors,<br />hospitals, and hope.</p><span className="public-footer__origin">Rooted in Ghana. Looking across Africa.</span></div>
      <div><h2>Platform</h2><Link href="/#how-it-works">How It Works</Link><Link href="/auth/register?role=donor">For Donors</Link><Link href="/auth/register?role=hospital">For Hospitals</Link><Link href="/auth/login">Sign In <ArrowUpRight size={13} aria-hidden="true" /></Link></div>
      <div><h2>FLUID</h2><Link href="/about">Our Story</Link><Link href="/contact">Contact</Link><Link href="/contact?topic=collaboration">Collaborate With Us</Link></div>
      <div><h2>Policies &amp; terms</h2><Link href="/contact?topic=privacy">Request Privacy Policy</Link><Link href="/contact?topic=terms">Request Terms of Service</Link><p className="public-footer__note">Official documents and social channels will be linked here when available.</p></div>
    </div>
    <div className="public-footer__bottom"><span>© {new Date().getFullYear()} FLUID. All rights reserved.</span><span>Every connection begins with care.</span></div>
  </div></footer>;
}
