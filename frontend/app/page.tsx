import Link from 'next/link';
import Image from 'next/image';
import { BadgeCheck, PlayCircle, ShieldCheck, ShieldPlus, Rocket } from 'lucide-react';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PhoneShowcase } from '@/components/sections/phone-showcase';
import { FaqAccordion } from '@/components/sections/faq-accordion';
import { Droplets, Hospital, BrainCircuit, ChartSpline, TrendingUp, Package, Clock3 } from 'lucide-react';

const workflow = [
  'Hospital posts blood request',
  'AI matches compatible donors',
  'Eligible donors receive alerts',
  'Appointment scheduled',
  'Donation completed'
];

const features = [
  { title: 'Instant Blood Matching', icon: Droplets, description: '8 compatible donors detected' },
  { title: 'Verified Hospitals', icon: Hospital, description: 'A+ • 4 Units • City General' },
  { title: 'Smart Coordination', icon: BrainCircuit, description: 'Donor slot confirmed • 2:30 PM' },
  { title: 'Analytics Engine', icon: ChartSpline, description: 'Shortage probability next week: 18%' }
];

const testimonials = [
  {
    name: 'Dr. Akosua Mensah',
    role: 'Emergency Unit Lead',
    organization: 'City General Hospital',
    location: 'Accra, Ghana',
    image: '/testimonials/akosua-mensah.jpg',
    verified: true,
    quote: 'FLUID helps us coordinate donor outreach with speed and confidence during urgent blood shortages.'
  },
  {
    name: 'Kofi Annan',
    role: 'Volunteer Donor',
    organization: 'FLUID Donor Network',
    location: 'Kumasi, Ghana',
    image: '/testimonials/kofi-annan.jpg',
    verified: true,
    quote: 'The alerts are clear and timely. I can quickly decide when and where I can help most.'
  },
  {
    name: 'Naa Araba',
    role: 'Operations Manager',
    organization: 'Hope Medical Centre',
    location: 'Tema, Ghana',
    image: '/testimonials/naa-araba.jpg',
    verified: true,
    quote: 'The platform creates structure in critical moments and gives our team better visibility.'
  }
];

export default function HomePage() {
  return (
    <div className="bg-[#fcfcfc] text-slate-900">
      <Navbar />

      <main className="relative">
        <section id="solution" className="relative overflow-hidden bg-gradient-to-b from-[#fffdfc] to-[#fff8f6] pt-24 sm:pt-28">
          <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-red-100/70 blur-3xl" />

          <div className="mx-auto max-w-[1240px] px-4 pb-12 pt-8 text-center sm:px-6 sm:pb-16">
            <div className="mx-auto inline-flex items-center gap-2.5 rounded-full border border-red-200/70 bg-white/90 px-3.5 py-1.5 text-[11px] text-slate-600 shadow-sm sm:text-xs">
              <BadgeCheck className="h-4 w-4 text-red-500" />
              <span className="font-semibold tracking-wide text-fluid-700">★★★★★ 5.0</span>
              <span>Trusted by hospitals & donors</span>
            </div>

            <h1 className="mx-auto mt-6 max-w-4xl font-[var(--font-sans)] leading-[0.9] tracking-[-0.028em]">
              <span className="block whitespace-nowrap text-[clamp(1.65rem,6.5vw,4.5rem)] font-medium tracking-[-0.04em] text-[#8A8A8A]">Saving lives through</span>
              <span className="-mt-5 mx-auto block w-fit whitespace-nowrap text-[clamp(1.05rem,5vw,3.45rem)] font-medium italic tracking-[-0.036em] text-[#1F1F1F]">intelligent blood donation</span>
            </h1>

            <p className="mx-auto mt-5 max-w-[600px] text-[15px] leading-7 text-slate-600 sm:text-[16px]">
              FLUID helps verified hospitals instantly connect with eligible blood donors, coordinate emergency blood requests, schedule appointments, and use predictive analytics to reduce future blood shortages.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
              <Link href="/auth/register">
                <Button className="group rounded-full bg-gradient-to-r from-fluid-600 via-fluid-700 to-fluid-800 px-5 py-2.5 text-sm text-white shadow-md shadow-red-500/15 inline-flex items-center gap-2">
                  Get Started
                </Button>
              </Link>
              <a href="#how-it-works">
                <Button variant="secondary" className="group rounded-full bg-white px-5 py-2.5 text-sm inline-flex items-center gap-2">
                  <PlayCircle className="h-4 w-4 text-slate-600   " />
                  View Demo
                </Button>
              </a>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 text-[11px] text-slate-500 sm:text-xs">
              <span className="group rounded-full border border-slate-200 bg-white px-3 py-1.5 inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-slate-600   " />
                Secure
              </span>
              <span className="group rounded-full border border-slate-200 bg-white px-3 py-1.5 inline-flex items-center gap-1.5">
                <BadgeCheck className="h-3.5 w-3.5 text-slate-600   " />
                Verified
              </span>
              <span className="group rounded-full border border-slate-200 bg-white px-3 py-1.5 inline-flex items-center gap-1.5">
                <ShieldPlus className="h-3.5 w-3.5 text-slate-600   " />
                HIPAA-ready
              </span>
              <span className="group rounded-full border border-slate-200 bg-white px-3 py-1.5 inline-flex items-center gap-1.5">
                <Rocket className="h-3.5 w-3.5 text-red-500   " />
                Scalable
              </span>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1240px] px-4 pb-8 sm:px-6 sm:pb-12">
          <div className="mx-auto max-w-[1040px] space-y-3.5 lg:space-y-4">
            <Card className="rounded-3xl border-red-100/70 bg-[#FFF7F7] p-4 shadow-none">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[13px] font-semibold text-slate-900">Hospital Dashboard</p>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">Live</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl border border-red-100/70 bg-[#FFF5F5] p-2.5">
                  <p className="text-slate-500">Active Requests</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">12</p>
                </div>
                <div className="rounded-xl border border-red-100/70 bg-[#FFF5F5] p-2.5">
                  <p className="text-slate-500">Matched Donors</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">28</p>
                </div>
                <div className="rounded-xl border border-red-100/70 bg-[#FFF5F5] p-2.5">
                  <p className="text-slate-500">Avg Response</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">31m</p>
                </div>
              </div>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Card key={feature.title} className="group rounded-2xl border-red-100/70 bg-[#FFF7F7] p-3.5 shadow-none">
                    <div className="flex items-start justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{feature.title}</p>
                      <Icon className="h-4 w-4 text-red-500/70   " />
                    </div>
                    <p className="mt-2 text-[13px] font-semibold text-slate-900">{feature.description}</p>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <PhoneShowcase />

        <section id="how-it-works" className="mx-auto max-w-[1240px] px-4 py-14 sm:px-6 sm:py-16">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fluid-700">How FLUID Works</p>
            <h2 className="mt-2.5 text-2xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">Fast coordination from request to donation.</h2>
          </div>
          <div className="mt-6 grid gap-3 lg:grid-cols-5">
            {workflow.map((item, i) => (
              <div key={item} className="relative">
                <Card className="rounded-2xl border-red-100/70 bg-[#FFF7F7] p-4.5 shadow-none">
                  <p className="text-xs font-semibold uppercase tracking-wider text-fluid-700">Step {i + 1}</p>
                  <p className="mt-2.5 text-[13px] font-semibold text-slate-900">{item}</p>
                </Card>
                {i < workflow.length - 1 && (
                  <span className="pointer-events-none absolute -bottom-2 left-1/2 hidden -translate-x-1/2 text-slate-300 lg:bottom-auto lg:left-auto lg:right-[-18px] lg:top-1/2 lg:block lg:-translate-y-1/2 lg:translate-x-0">
                    →
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        <section id="hospitals" className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 sm:py-8">
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fluid-700">For Hospitals</p>
              <h2 className="mt-2.5 text-2xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">Designed for emergency blood operations.</h2>
              <p className="mt-3 text-[15px] text-slate-600">Create requests rapidly, monitor donor responses in real time, and reduce coordination overhead during critical moments.</p>
            </div>
            <Card className="rounded-2xl border-red-100/70 bg-[#FFF7F7] p-5 shadow-none">
              <p className="text-[13px] font-semibold text-slate-900">Hospital Benefits</p>
              <ul className="mt-3 space-y-2.5 text-[14px] text-slate-600">
                <li>• Structured urgent request workflows</li>
                <li>• Live donor response tracking</li>
                <li>• Appointment scheduling and status visibility</li>
              </ul>
            </Card>
          </div>
        </section>

        <section id="donors" className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6 sm:py-12">
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <Card className="order-2 rounded-2xl border-red-100/70 bg-[#FFF7F7] p-5 shadow-none lg:order-1">
              <p className="text-[13px] font-semibold text-slate-900">Donor Benefits</p>
              <ul className="mt-3 space-y-2.5 text-[14px] text-slate-600">
                <li>• Smart compatibility alerts</li>
                <li>• Quick appointment confirmations</li>
                <li>• Clear personal impact history</li>
              </ul>
            </Card>
            <div className="order-1 lg:order-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fluid-700">For Donors</p>
              <h2 className="mt-2.5 text-2xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">Meaningful contributions made simple.</h2>
              <p className="mt-3 text-[15px] text-slate-600">Donors receive relevant request alerts, can respond quickly, and schedule contributions with confidence and transparency.</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link href="/auth/register">
              <Button className="rounded-full bg-gradient-to-r from-fluid-600 via-fluid-700 to-fluid-800 px-5 py-2.5 text-sm text-white shadow-md shadow-red-500/15">
                Get started
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button variant="secondary" className="rounded-full bg-white px-5 py-2.5 text-sm">
                View demo
              </Button>
            </a>
          </div>
        </section>

        <section id="analytics" className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6 sm:py-14">
          <Card className="rounded-3xl border-red-100/70 bg-[#FFF7F7] p-7 text-slate-900 shadow-none sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fluid-700">Predictive Analytics</p>
            <h2 className="mt-2.5 text-2xl font-semibold tracking-tight sm:text-[2rem]">Forecast shortages before they happen.</h2>
            <p className="mt-3 max-w-2xl text-[14px] leading-7 text-slate-600 sm:text-[15px]">
              FLUID’s analytics layer helps healthcare teams anticipate demand trends, optimize blood inventory planning, and reduce high-risk shortage windows.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="group rounded-2xl border border-red-100/70 bg-[#FFF5F5] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">Predicted risk zones</p>
                  <TrendingUp className="h-4 w-4 text-red-400/70   " />
                </div>
                <p className="mt-1 text-lg font-semibold">3 districts</p>
              </div>
              <div className="group rounded-2xl border border-red-100/70 bg-[#FFF5F5] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">Inventory confidence</p>
                  <Package className="h-4 w-4 text-slate-400   " />
                </div>
                <p className="mt-1 text-lg font-semibold">91%</p>
              </div>
              <div className="group rounded-2xl border border-red-100/70 bg-[#FFF5F5] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">Forecast window</p>
                  <Clock3 className="h-4 w-4 text-slate-400   " />
                </div>
                <p className="mt-1 text-lg font-semibold">14 days</p>
              </div>
            </div>
          </Card>
        </section>

        <section className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6 sm:py-10">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fluid-700">Testimonials</p>
            <h2 className="mt-2.5 text-2xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">Trusted by healthcare teams and donors.</h2>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {testimonials.map((item) => (
              <Card key={item.name} className="rounded-2xl border-red-100/70 bg-[#FFF7F7] p-5 shadow-none">
                <p className="text-[14px] leading-7 text-slate-600">“{item.quote}”</p>
                <div className="mt-3 flex items-center gap-3">
                  <Image
                    src={item.image}
                    alt={`${item.name}, ${item.role}`}
                    width={44}
                    height={44}
                    className="h-11 w-11 shrink-0 rounded-full object-cover"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-[13px] font-semibold text-slate-900">{item.name}</p>
                      {item.verified && (
                        <BadgeCheck className="h-3.5 w-3.5 shrink-0 fill-fluid-600 text-white" aria-label="Verified profile" />
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{item.role} · {item.organization}</p>
                    <p className="text-xs text-slate-400">{item.location}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-[1240px] px-4 pb-16 pt-6 sm:px-6 sm:pb-18">
          <div className="mx-auto max-w-3xl">
            <div className="text-center">
              <p className="text-sm font-semibold uppercase tracking-normal text-fluid-700">FAQs</p>
              <h2 className="mt-2.5 font-[var(--font-sans)] text-[clamp(1.5rem,3.6vw,2.4rem)] font-medium leading-[0.98] tracking-[-0.04em]">
                <span className="block text-[#9A9A9A]">Got questions?</span>
                <span className="block text-[#1F1F1F]">Here are the answers.</span>
              </h2>
            </div>
            <FaqAccordion />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
