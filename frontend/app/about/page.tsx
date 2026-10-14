import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, HeartHandshake, Network, ShieldCheck } from 'lucide-react';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { FounderStory } from '@/components/public/founder-story';
import { Reveal } from '@/components/public/reveal';

export const metadata: Metadata = { title: 'Our Story — FLUID', description: 'The personal experience behind FLUID and our mission to connect donors, hospitals, and hope across Ghana and Africa.' };

export default function AboutPage() {
  return <div className="public-site"><a className="public-skip" href="#main-content">Skip to content</a><Navbar /><main id="main-content">
    <section className="public-page-heading public-container"><span className="public-eyebrow">OUR STORY</span><h1>A loss that became<br /><span>a living connection.</span></h1><p>Technology with a deeply human purpose.<br />This is why we’re building FLUID.</p></section>
    <Reveal><FounderStory full /></Reveal>
    <section className="public-section public-container"><div className="public-centered-heading"><span className="public-eyebrow">WHAT GUIDES US</span><h2>Built around people.<br />Designed for possibility.</h2></div><div className="public-steps">{[{ title: 'Connection with purpose.', body: 'Help donors and hospitals find each other more effectively, with relevant information and clear next steps.', Icon: Network }, { title: 'Care and responsibility.', body: 'Support coordination while keeping clinical screening and medical decisions with healthcare professionals.', Icon: ShieldCheck }, { title: 'Hope through participation.', body: 'Start in Ghana and work toward better blood availability across Africa, one thoughtful connection at a time.', Icon: HeartHandshake }].map(({ title, body, Icon }) => <Reveal key={title}><article className="public-step"><span className="public-icon"><Icon size={25} /></span><h3>{title}</h3><p>{body}</p></article></Reveal>)}</div><div className="public-about-cta"><Link className="public-button" href="/auth/register?role=donor">Join the Mission <ArrowUpRight size={17} /></Link><Link className="public-text-link" href="/contact?topic=collaboration">Build With Us <ArrowUpRight size={17} /></Link></div></section>
  </main><Footer /></div>;
}
