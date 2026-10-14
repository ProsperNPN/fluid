"use client";

import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, Copy, Mail } from 'lucide-react';

const inbox = 'hello@fluid.health';
const topicLabels: Record<string, string> = { collaboration: 'Collaboration', hospital: 'Hospital partnership', donor: 'Donor support', privacy: 'Request Privacy Policy', terms: 'Request Terms of Service', general: 'General enquiry' };

export function ContactForm() {
  const [topic, setTopic] = useState('general');
  const [draft, setDraft] = useState<{ href: string; text: string } | null>(null);
  const [status, setStatus] = useState('');
  useEffect(() => { const value = new URLSearchParams(window.location.search).get('topic'); if (value && topicLabels[value]) setTopic(value); }, []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name')).trim();
    const message = String(data.get('message')).trim();
    if (!name || message.length < 10) {
      const field = event.currentTarget.elements.namedItem(!name ? 'name' : 'message') as HTMLInputElement | HTMLTextAreaElement;
      field.setCustomValidity(!name ? 'Please enter your name.' : 'Please enter at least 10 characters of message text.');
      field.reportValidity();
      return;
    }
    const subject = `FLUID — ${topicLabels[topic]}`;
    const body = `Name: ${name}\nEmail: ${String(data.get('email')).trim()}\n\n${message}`;
    const href = `mailto:${inbox}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setDraft({ href, text: `To: ${inbox}\nSubject: ${subject}\n\n${body}` });
    setStatus('Your draft is ready. Send it from your email app, or copy it below. Nothing has been sent yet.');
    window.location.href = href;
  }
  async function copy() {
    if (!draft) return;
    try { await navigator.clipboard.writeText(draft.text); setStatus('Draft copied. Paste it into your email app and send it when ready.'); }
    catch { setStatus('Copy is unavailable in this browser. Select the draft below and copy it manually.'); }
  }
  return <form className="public-contact-form" onSubmit={submit} onInput={event => { const field = event.target; if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) field.setCustomValidity(''); }} onChange={() => { if (draft) { setDraft(null); setStatus(''); } }}>
    <div className="public-form-row"><label htmlFor="contact-name">Your name<input id="contact-name" name="name" required autoComplete="name" maxLength={100} placeholder="Full name" /></label><label htmlFor="contact-email">Email address<input id="contact-email" type="email" name="email" required autoComplete="email" maxLength={254} placeholder="you@example.com" /></label></div>
    <label htmlFor="contact-topic">I’d like to talk about<select id="contact-topic" name="topic" value={topic} onChange={event => setTopic(event.target.value)}>{Object.entries(topicLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    <label htmlFor="contact-message">Your message<textarea id="contact-message" name="message" required minLength={10} maxLength={3000} rows={5} placeholder="Tell us how you’d like to connect…" aria-describedby="contact-help" /></label>
    <p id="contact-help" className="public-form-note">Please don’t include medical records or sensitive health information. This form opens an email draft; it doesn’t submit to a server.</p>
    <button className="public-button" type="submit">Open Email Draft <ArrowUpRight size={17} /></button>
    <p className="public-contact-status" role="status" aria-live="polite">{status}</p>
    {draft && <div className="public-draft"><div><a href={draft.href}><Mail size={15} /> Open draft again</a><button type="button" onClick={() => void copy()}><Copy size={15} /> Copy draft</button></div><textarea aria-label="Your prepared email draft" readOnly value={draft.text} rows={6} /></div>}
  </form>;
}
