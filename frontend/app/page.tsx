import type { Metadata } from 'next';
import Link from 'next/link';
import { Activity, ArrowDown, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check, CircleHelp, Droplet, HeartHandshake, Hospital, Mail, MapPin, Network, ShieldCheck, Sparkles } from 'lucide-react';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { ConnectionVisual } from '@/components/public/connection-visual';
import { DashboardPreview, PlatformShowcase } from '@/components/public/dashboard-preview';
import { FounderStory } from '@/components/public/founder-story';
import { ContactForm } from '@/components/public/contact-form';
import { Reveal } from '@/components/public/reveal';

export const metadata: Metadata = {
  title: 'FLUID — The Living Connection',
  description: 'Connecting blood donors, hospitals, and hope. Discover FLUID’s mission to improve blood availability across Ghana and Africa.',
  openGraph: { title: 'FLUID — The Living Connection', description: 'Every Drop Matters. Every Second Counts.', type: 'website' },
};

const steps = [
  { title: 'Hospitals Identify Blood Needs.', icon: Hospital, body: 'A verified hospital creates a request with the blood type, urgency, and location. A clear starting point when time matters.' },
  { title: 'FLUID Connects Compatible Donors.', icon: Network, body: 'Blood type, eligibility, availability, and location help connect the request with relevant donors.' },
  { title: 'Donors Respond. Hospitals Coordinate.', icon: HeartHandshake, body: 'Donors choose when they can help. Hospitals coordinate appointments and complete the clinical screening.' },
];
const donorFeatures = ['Simple donor registration', 'Blood type & location profile', 'Compatible requests & notifications', 'Donation appointments & history', 'Availability on your terms'];
const hospitalFeatures = ['Registration & facility verification', 'Blood requests & donor matching', 'Appointment coordination', 'Blood inventory management', 'Hospital activity & analytics'];

export default function HomePage() {
  return <div className="public-site">
    <a className="public-skip" href="#main-content">Skip to content</a>
    <Navbar />
    <main id="main-content">
      <section className="public-hero">
        <div className="public-container public-hero__grid">
          <div className="public-hero__copy">
            <div className="public-hero__eyebrow"><Activity size={15} aria-hidden="true" /> A STRONGER, HEALTHIER AFRICA</div>
            <h1><span>Every Drop Matters.</span><em>Every Second Counts.</em></h1>
            <p>FLUID connects hospitals with eligible blood donors, helping healthcare providers respond faster to urgent needs and build a future where life-saving blood is available before emergencies happen.</p>
            <div className="public-button-row"><Link className="public-button" href="/auth/register?role=donor">Become a Donor <ArrowUpRight size={18} /></Link><Link className="public-button public-button--outline" href="/auth/register?role=hospital">Register Your Hospital <ArrowUpRight size={18} /></Link></div>
            <div className="public-hero__footnote"><span><ShieldCheck size={16} /> Built with care.</span><span><HeartHandshake size={16} /> Connected by people.</span><span><MapPin size={16} /> Rooted in Ghana.</span></div>
          </div>
          <div className="public-hero__visual"><ConnectionVisual /><div className="public-hero__visual-note"><span className="public-dot" /><span>One request. One response.<br /><strong>A possibility that changes everything.</strong></span></div></div>
        </div>
        <div className="public-container public-hero__baseline"><span>Built with purpose. Rooted in Ghana.</span><a href="#how-it-works">Discover the connection <ArrowDown size={15} /></a><span>For a more connected future.</span></div>
      </section>

      <section id="how-it-works" className="public-section public-workflow"><div className="public-container">
        <Reveal><div className="public-section-heading"><div><span className="public-eyebrow">LESS FRICTION. MORE CONNECTION.</span><h2>Connecting Every Drop<br />to Where It Matters.</h2></div><p>A simpler, smarter way to connect<br className="public-desktop-break" /> blood donors and hospitals.</p></div></Reveal>
        <div className="public-steps">{steps.map(({ title, icon: Icon, body }, index) => <Reveal key={title} delay={index * 70}><article className="public-step"><div className="public-step__top"><span className="public-icon"><Icon size={26} strokeWidth={1.5} /></span><span>0{index + 1}</span></div><h3>{title}</h3><p>{body}</p>{index < 2 && <ArrowRight className="public-step__connector" size={20} aria-hidden="true" />}</article></Reveal>)}</div>
        <p className="public-clinical-note"><CircleHelp size={15} /> Connection supports coordination. Hospitals confirm eligibility and provide medical care.</p>
      </div></section>

      <section id="donors" className="public-section public-audience"><div className="public-container public-audience__grid">
        <Reveal className="public-audience__copy"><span className="public-eyebrow"><Droplet size={15} /> FOR DONORS</span><h2>Your Blood Type<br />Could Be Someone’s<br /><span>Lifeline.</span></h2><p>You don’t need to do everything. Just be there when you can. FLUID helps you find relevant opportunities and manage your donation journey.</p><ul className="public-feature-list">{donorFeatures.map(feature => <li key={feature}><Check size={16} />{feature}</li>)}</ul><Link className="public-button" href="/auth/register?role=donor">Join as a Donor <ArrowUpRight size={17} /></Link></Reveal>
        <Reveal className="public-audience__preview" delay={100}><div className="public-preview-label"><span className="public-dot" /> YOUR CARE, ON YOUR TERMS</div><DashboardPreview role="donor" compact /><div className="public-preview-caption"><CalendarDays size={15} /> From the first match to your next appointment.</div></Reveal>
      </div></section>

      <section id="hospitals" className="public-section public-audience public-audience--hospital"><div className="public-container public-audience__grid">
        <Reveal className="public-audience__preview"><div className="public-preview-label"><span className="public-dot" /> BUILT FOR THE PEOPLE BEHIND THE CARE</div><DashboardPreview role="hospital" compact /><div className="public-preview-caption"><ShieldCheck size={15} /> A focused workspace for blood operations.</div></Reveal>
        <Reveal className="public-audience__copy" delay={100}><span className="public-eyebrow"><Hospital size={15} /> FOR HOSPITALS</span><h2>Better Blood Availability<br />Starts Before<br /><span>the Emergency.</span></h2><p>Give your team a shared view of blood needs, donor responses, and inventory, so the next step is clear when the pressure is high.</p><ul className="public-feature-list">{hospitalFeatures.map(feature => <li key={feature}><Check size={16} />{feature}</li>)}</ul><Link className="public-button" href="/auth/register?role=hospital">Register Your Hospital <ArrowUpRight size={17} /></Link></Reveal>
      </div>
        <div className="public-container"><Reveal><div className="public-future"><span className="public-future__icon"><Sparkles size={27} strokeWidth={1.5} /></span><div><div className="public-future__heading"><h3>Predicting Shortages Before They Happen.</h3><span className="public-tag public-tag--neutral">COMING SOON</span></div><p>Our next horizon: predictive blood inventory intelligence to help healthcare teams anticipate demand and plan earlier. A future vision, beyond today’s operational analytics.</p></div><span className="public-future__line" aria-hidden="true"><svg viewBox="0 0 150 50"><path d="M0 37L24 31L39 35L65 18L81 23L104 10L120 16L150 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span></div></Reveal></div>
      </section>

      <section id="platform" className="public-section public-platform"><div className="public-container">
        <Reveal><div className="public-centered-heading"><span className="public-eyebrow">A CLOSER LOOK</span><h2>One Platform.<br /><span>Two Powerful Experiences.</span></h2><p>Different needs. One thoughtful connection.<br />Explore the tools behind the mission.</p></div></Reveal>
        <Reveal><PlatformShowcase /></Reveal>
      </div></section>

      <Reveal><FounderStory /></Reveal>

      <section className="public-section public-mission-wrap"><div className="public-container"><Reveal><div className="public-mission">
        <div className="public-mission__rings" aria-hidden="true" /><span className="public-eyebrow">JOIN THE MISSION</span><h2>Together, We Can Make<br />Every Drop Count.</h2><p>Whether you’re a donor, healthcare professional, developer, or someone who believes in the power of technology to save lives, there’s a place for you in FLUID’s journey.</p><div className="public-button-row"><Link className="public-button public-button--white" href="/auth/register?role=donor">Become a Donor <ArrowUpRight size={18} /></Link><Link className="public-button public-button--glass" href="/auth/register?role=hospital">Partner as a Hospital <ArrowUpRight size={18} /></Link></div><Link className="public-mission__collaborate" href="/contact?topic=collaboration">Interested in Collaborating? <ArrowRight size={16} /></Link>
      </div></Reveal></div></section>

      <section id="contact" className="public-section public-contact"><div className="public-container public-contact__grid">
        <Reveal><span className="public-eyebrow">LET’S BUILD THE CONNECTION</span><h2>A conversation today.<br /><span>A possibility tomorrow.</span></h2><p>Hospital partnerships, donor questions, or a new idea. We’d like to hear from you.</p><a className="public-text-link" href="mailto:hello@fluid.health"><Mail size={17} /> hello@fluid.health <ArrowUpRight size={16} /></a><div className="public-contact__location"><MapPin size={17} /><span>Our mission starts in Ghana<br />and looks toward a more connected Africa.</span></div></Reveal>
        <Reveal delay={80}><ContactForm /></Reveal>
      </div></section>
    </main>
    <Footer />
  </div>;
}
