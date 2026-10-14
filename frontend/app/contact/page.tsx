import type { Metadata } from 'next';
import { Mail, MapPin } from 'lucide-react';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { ContactForm } from '@/components/public/contact-form';

export const metadata: Metadata = { title: 'Contact — FLUID', description: 'Connect with FLUID about hospital partnerships, collaboration, and donor support.' };

export default function ContactPage() {
  return <div className="public-site"><a className="public-skip" href="#main-content">Skip to content</a><Navbar /><main id="main-content"><section id="contact" className="public-section public-contact public-contact--page"><div className="public-container public-contact__grid"><div><span className="public-eyebrow">LET’S CONNECT</span><h1>Good things start<br />with a conversation.</h1><p>Have a question, an idea, or a shared mission? Tell us a little about yourself and how you’d like to be part of FLUID’s journey.</p><a className="public-text-link" href="mailto:hello@fluid.health"><Mail size={17} /> hello@fluid.health</a><div className="public-contact__location"><MapPin size={17} /><span>Rooted in Ghana.<br />Working toward a more connected Africa.</span></div></div><ContactForm /></div></section></main><Footer /></div>;
}
