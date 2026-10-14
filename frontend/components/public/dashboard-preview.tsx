"use client";

import { useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Bell, CalendarDays, Check, Droplets, History, LayoutDashboard, PackageSearch, Settings, ShieldCheck, Users } from 'lucide-react';
import { FluidLogo } from '@/components/brand/fluid-logo';
import { DonorSidebarItem } from '@/components/donor/donor-sidebar-item';
import { EmptyState } from '@/components/ui/empty-state';

export type PreviewRole = 'donor' | 'hospital';
const tabs: PreviewRole[] = ['donor', 'hospital'];

/** Uses production navigation and empty states without fetching private data. */
export function DashboardPreview({ role, compact = false }: { role: PreviewRole; compact?: boolean }) {
  const hospital = role === 'hospital';
  const nav = hospital
    ? [['Overview', LayoutDashboard, ''], ['Blood Requests', Droplets, '/requests'], ['Donor Responses', Users, '/donors'], ['Appointments', CalendarDays, '/appointments'], ['Blood Inventory', PackageSearch, '/inventory'] ] as const
    : [['Overview', LayoutDashboard, ''], ['Blood Requests', Droplets, '/requests'], ['Appointments', CalendarDays, '/appointments'], ['Donation History', History, '/history'], ['Profile & Settings', Settings, '/profile'] ] as const;
  return <div className={`dashboard-preview ${compact ? 'dashboard-preview--compact' : ''}`}>
    <div className="dashboard-preview__chrome"><span className="preview-window-dots" aria-hidden="true"><i /><i /><i /></span><span>FLUID / {hospital ? 'Hospital' : 'Donor'} workspace</span><span className="public-tag public-tag--neutral">PRODUCT PREVIEW</span></div>
    <div className="dashboard-preview__body">
      <aside className="dashboard-preview__sidebar"><FluidLogo variant="compact" animated={false} /><p>{hospital ? 'Hospital' : 'Donor'} Workspace</p><nav aria-label={`${role} preview navigation`}>{nav.map(([label, icon, path]) => <DonorSidebarItem key={label} href={`/${role}${path}`} label={label} icon={icon} active={path === ''} />)}</nav><span className="preview-private"><ShieldCheck size={14} /> Your workspace. Your data.</span></aside>
      <div className="dashboard-preview__content">
        <div className="preview-page-title"><div><span>{hospital ? 'Blood operations' : 'Your donation journey'}</span><h3>{hospital ? 'Hospital overview' : 'Donor overview'}</h3></div><Bell size={18} aria-hidden="true" /></div>
        <div className="preview-welcome"><span className="public-icon">{hospital ? <PackageSearch size={20} /> : <Droplets size={20} />}</span><div><strong>{hospital ? 'Coordinate care with confidence.' : 'A little of you. A lifeline for someone.'}</strong><p>{hospital ? 'Requests, responses, and inventory in one place.' : 'Find relevant opportunities. Donate on your terms.'}</p></div></div>
        <div className="preview-metrics">{(hospital ? ['Blood requests', 'Donor responses', 'Upcoming appointments'] : ['Compatible requests', 'Upcoming appointments', 'Completed donations']).map(label => <div key={label}><span>{label}</span><strong>—</strong><small>Your account data appears here</small></div>)}</div>
        <div className="preview-detail"><div><h4>{hospital ? 'Recent blood requests' : 'Compatible blood requests'}</h4><Link href={`/${role}/requests`}>View workspace <ArrowUpRight size={13} /></Link></div><EmptyState title={hospital ? 'A clear view of every request' : 'The right request, at the right time'} description={hospital ? 'Create and manage blood requests in your authenticated hospital workspace.' : 'Matching considers blood type, eligibility, availability, and location.'} /></div>
        <div className="preview-bottom"><Check size={14} /> Preview only. No personal data or live activity is shown.</div>
      </div>
    </div>
  </div>;
}

export function PlatformShowcase() {
  const [active, setActive] = useState<PreviewRole>('donor');
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const reduce = useReducedMotion();
  function keydown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = 1 - index;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 1;
    else return;
    event.preventDefault(); setActive(tabs[next]); refs.current[next]?.focus();
  }
  return <>
    <div className="preview-tabs" role="tablist" aria-label="Choose a dashboard preview">{tabs.map((role, index) => <button key={role} ref={element => { refs.current[index] = element; }} role="tab" id={`preview-tab-${role}`} aria-selected={active === role} aria-controls={`preview-panel-${role}`} tabIndex={active === role ? 0 : -1} onKeyDown={event => keydown(event, index)} onClick={() => setActive(role)}>{role === 'donor' ? <Droplets size={17} /> : <PackageSearch size={17} />}{role === 'donor' ? 'Donor Dashboard' : 'Hospital Dashboard'}</button>)}</div>
    <AnimatePresence mode="wait" initial={false}><motion.div key={active} role="tabpanel" id={`preview-panel-${active}`} aria-labelledby={`preview-tab-${active}`} tabIndex={0} initial={{ opacity: reduce ? 1 : 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: reduce ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.2 }}><DashboardPreview role={active} /></motion.div></AnimatePresence>
    <p className="preview-caption">Explore the experience. <Link href={`/${active}`}>Open your {active} dashboard <ArrowUpRight size={14} /></Link></p>
  </>;
}
