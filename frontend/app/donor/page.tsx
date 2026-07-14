"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, CalendarDays, CheckCircle2, ChevronRight, Droplets, HeartPulse, MapPin, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { getApiErrorMessage } from '@/lib/api';
import { listAppointments } from '@/services/appointments-service';
import { listCompatibleRequests, respondToRequest, type CompatibleRequest } from '@/services/compatible-requests-service';
import { listNotifications } from '@/services/notifications-service';
import { getDonorProfile, updateDonorAvailability } from '@/services/profile-service';
import type { Appointment, DonorProfile, NotificationItem } from '@/types';

function greeting() { const hour = new Date().getHours(); return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'; }
const panel = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';

export default function DonorOverview() {
  const [profile, setProfile] = useState<DonorProfile | null>(null);
  const [requests, setRequests] = useState<CompatibleRequest[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [responding, setResponding] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const results = await Promise.allSettled([getDonorProfile(), listCompatibleRequests({ pageSize: 4 }), listAppointments({ scope: 'donor', page: 1, pageSize: 6 }), listNotifications()]);
    if (results[0].status === 'fulfilled') setProfile(results[0].value);
    if (results[1].status === 'fulfilled') setRequests(results[1].value.items);
    if (results[2].status === 'fulfilled') setAppointments(results[2].value.items);
    if (results[3].status === 'fulfilled') setNotifications(results[3].value.items.slice(0, 4));
    if (results.every((result) => result.status === 'rejected')) setError('Your dashboard data could not be loaded. Check your connection and try again.');
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const upcoming = appointments.filter((item) => ['pending', 'confirmed'].includes(item.status));
  const completed = appointments.filter((item) => item.status === 'completed');
  const hospitals = useMemo(() => new Set([...requests.map((item) => item.hospitalName), ...appointments.map((item) => item.hospitalName)]).size, [appointments, requests]);

  const toggleAvailability = async () => {
    if (!profile || availabilitySaving) return; setAvailabilitySaving(true);
    try { const updated = await updateDonorAvailability(!profile.isAvailable); setProfile(updated); toast.success(updated.isAvailable ? 'You are now available to donate.' : 'You are temporarily unavailable for donation.'); }
    catch (toggleError) { toast.error(getApiErrorMessage(toggleError, 'Unable to update availability.')); }
    finally { setAvailabilitySaving(false); }
  };
  const respond = async (request: CompatibleRequest, status: 'accepted' | 'declined') => {
    if (responding) return; setResponding(request.id);
    try { await respondToRequest(request.id, status); toast.success(status === 'accepted' ? 'Request accepted. Complete your appointment schedule next.' : 'Request declined.'); await load(); }
    catch (responseError) { toast.error(getApiErrorMessage(responseError, 'Unable to update this request.')); }
    finally { setResponding(null); }
  };

  if (loading) return <div className="space-y-5"><LoadingState text="Loading your donor overview..." /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-200/70" />)}</div></div>;
  if (error) return <EmptyState title="Dashboard unavailable" description={error} actionLabel="Try again" onAction={() => void load()} />;

  const metrics = [
    { label: 'Compatible requests', value: requests.length, note: 'Within your profile match', icon: Droplets },
    { label: 'Urgent requests', value: requests.filter((item) => item.status === 'urgent').length, note: 'Need a rapid response', icon: HeartPulse },
    { label: 'Upcoming appointments', value: upcoming.length, note: 'Pending or confirmed', icon: CalendarDays },
    { label: 'Completed donations', value: completed.length, note: 'Your recorded impact', icon: CheckCircle2 },
    { label: 'Hospitals supported', value: hospitals, note: 'Across your activity', icon: Building2 },
    { label: 'Next eligible date', value: profile?.nextEligibleDate ? new Date(profile.nextEligibleDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Now', note: profile?.isEligible ? 'Eligible to donate' : 'Based on last donation', icon: ShieldCheck },
  ];

  return <div className="space-y-6">
    <section className="flex flex-col gap-5 rounded-2xl border border-red-100 bg-gradient-to-r from-white to-red-50/60 p-5 shadow-sm sm:p-6 lg:flex-row lg:items-center lg:justify-between">
      <div><p className="text-sm font-medium text-[#C0392B]">Donor overview</p><h2 className="mt-1 text-2xl font-semibold text-slate-950">{greeting()}, {profile?.fullName.split(' ')[0] || 'Donor'}</h2><p className="mt-2 text-sm text-slate-600">{profile?.isAvailable ? 'You are visible for compatible donation opportunities in your area.' : 'You are currently unavailable. Turn availability on when you are ready to donate.'}</p></div>
      <button disabled={availabilitySaving} onClick={toggleAvailability} className="flex min-w-60 items-center justify-between rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm  hover:border-red-200 disabled:opacity-60"><span><span className="block text-xs text-slate-500">Donation status</span><span className="block text-sm font-semibold text-slate-900">{profile?.isAvailable ? 'Available to donate' : 'Temporarily unavailable'}</span></span><span className={`relative h-6 w-11 rounded-full  ${profile?.isAvailable ? 'bg-[#C0392B]' : 'bg-slate-300'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white  ${profile?.isAvailable ? 'left-6' : 'left-1'}`} /></span></button>
    </section>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(({ label, value, note, icon: Icon }) => <div key={label} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm   "><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-400">{note}</p></div><span className="rounded-xl bg-slate-50 p-2.5 text-slate-500  "><Icon className="h-5 w-5" /></span></div></div>)}</section>

    <section className="grid gap-6 xl:grid-cols-3"><div className={`${panel} xl:col-span-2`}><div className="flex items-center justify-between"><div><h3 className="font-semibold text-slate-950">Compatible requests</h3><p className="mt-1 text-sm text-slate-500">Matched using blood type, eligibility, availability, and location.</p></div><Link className="text-sm font-medium text-[#C0392B]" href="/donor/requests">View all</Link></div>
      {requests.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{requests.map((request) => <article key={request.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-2"><div><div className="flex items-center gap-1.5"><p className="font-semibold text-slate-900">{request.hospitalName}</p>{request.hospitalVerified ? <ShieldCheck className="h-4 w-4 text-blue-600" /> : null}</div><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" />{request.location}{request.distanceKm !== null ? ` · ${request.distanceKm} km` : ''}</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${request.status === 'urgent' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{request.status}</span></div><div className="mt-4 flex items-center justify-between"><span className="text-sm text-slate-600"><strong className="text-[#C0392B]">{request.bloodType}</strong> · {request.units} units</span><div className="flex gap-2"><Button variant="ghost" className="px-2.5 py-1.5 text-xs" disabled={responding === request.id} onClick={() => void respond(request, 'declined')}>Decline</Button><Button className="px-2.5 py-1.5 text-xs" disabled={responding === request.id} onClick={() => void respond(request, 'accepted')}>Accept</Button></div></div></article>)}</div> : <div className="mt-5"><EmptyState title="No compatible requests near you right now" description="Keep your availability and location updated so hospitals can reach you." /></div>}
    </div><div className={panel}><div className="flex items-center justify-between"><h3 className="font-semibold text-slate-950">Blood profile</h3><Link href="/donor/profile" className="text-sm font-medium text-[#C0392B]">Edit</Link></div><div className="mt-5 flex items-center gap-4"><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#C0392B] text-xl font-bold text-white">{profile?.bloodType}</span><div><p className="font-semibold text-slate-900">{profile?.city}, {profile?.country}</p><p className="mt-1 text-sm text-slate-500">{profile?.preferredRadiusKm} km donation radius</p></div></div><div className="mt-5"><div className="flex justify-between text-xs"><span className="text-slate-500">Profile completion</span><span className="font-semibold text-slate-700">{profile?.profileCompletion}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#C0392B]" style={{ width: `${profile?.profileCompletion ?? 0}%` }} /></div></div>{(profile?.profileCompletion ?? 0) < 100 ? <p className="mt-4 text-xs leading-5 text-slate-500">Complete your profile to receive accurate blood-request matches.</p> : null}</div></section>

    <section className="grid gap-6 lg:grid-cols-2"><div className={panel}><div className="flex justify-between"><h3 className="font-semibold text-slate-950">Upcoming appointments</h3><Link href="/donor/appointments" className="text-sm font-medium text-[#C0392B]">View all</Link></div>{upcoming.length ? <div className="mt-4 space-y-3">{upcoming.slice(0, 3).map((item) => <Link href="/donor/appointments" key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50"><span className="rounded-xl bg-red-50 p-2 text-[#C0392B]"><CalendarDays className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{item.hospitalName}</span><span className="block text-xs text-slate-500">{new Date(item.scheduledAt).toLocaleString()}</span></span><ChevronRight className="h-4 w-4 text-slate-400" /></Link>)}</div> : <div className="mt-4"><EmptyState title="No upcoming appointments" description="Accept a compatible request to begin scheduling." /></div>}</div>
    <div className={panel}><div className="flex justify-between"><h3 className="font-semibold text-slate-950">Recent notifications</h3><Link href="/donor/notifications" className="text-sm font-medium text-[#C0392B]">View all</Link></div>{notifications.length ? <div className="mt-4 divide-y divide-slate-100">{notifications.map((item) => <Link href={item.relatedPath ?? '/donor/notifications'} key={item.id} className="flex gap-3 py-3"><span className={`mt-2 h-2 w-2 rounded-full ${item.isRead ? 'bg-slate-200' : 'bg-[#C0392B]'}`} /><span><span className="text-sm font-semibold text-slate-900">{item.title}</span><span className="mt-0.5 block text-xs text-slate-500">{item.message} · {item.time}</span></span></Link>)}</div> : <div className="mt-4"><EmptyState title="No notifications" description="Important donation updates will appear here." /></div>}</div></section>
  </div>;
}
