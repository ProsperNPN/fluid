"use client";
import { useEffect, useRef, type ReactNode } from "react";
import {
  X,
  Droplet,
  Hospital,
  MapPin,
  Clock3,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import type { CompatibleRequest } from "@/services/compatible-requests-service";

export function PortalSkeleton() {
  return (
    <div className="portal-stack" role="status" aria-label="Loading dashboard">
      <div className="portal-skeleton portal-skeleton--banner" />
      <div className="portal-stats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="portal-skeleton portal-skeleton--card" />
        ))}
      </div>
      <div className="portal-skeleton portal-skeleton--panel" />
    </div>
  );
}
export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`portal-pill portal-pill--${["verified", "completed", "confirmed", "normal", "accepted"].includes(status) ? "green" : ["urgent", "critical", "rejected", "cancelled", "expired"].includes(status) ? "red" : "amber"}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}
export function PortalPanel({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`portal-panel ${className}`}>
      <div className="portal-panel__heading">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
export function PortalDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="portal-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="portal-dialog__heading">
        <h2>{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function RequestCard({
  item,
  onDetails,
}: {
  item: CompatibleRequest;
  onDetails: () => void;
}) {
  return (
    <article className="portal-request-card">
      <div className="portal-request-card__identity">
        <span className="portal-hospital-mark">
          <Hospital size={25} />
        </span>
        <div>
          <h3>{item.hospitalName}</h3>
          <p>
            <MapPin size={12} />
            {item.location}
          </p>
        </div>
        {item.hospitalVerified && (
          <ShieldCheck
            size={15}
            className="portal-verified-icon"
            aria-label="Verified hospital"
          />
        )}
      </div>
      <div className="portal-request-card__status">
        <StatusPill status={item.urgency} />
        <span>
          {item.distanceKm !== null
            ? `${item.distanceKm} km away`
            : "Distance unavailable"}
        </span>
      </div>
      <p className="portal-request-card__need">
        <Droplet size={14} />
        <strong>{item.bloodType}</strong> · {item.units} unit
        {item.units === 1 ? "" : "s"} · {item.component.replaceAll("_", " ")}
      </p>
      <p className="portal-request-card__deadline">
        <Clock3 size={13} />
        {item.requiredBy
          ? new Date(item.requiredBy).toLocaleString()
          : "Contact hospital for timing"}
      </p>
      <button className="portal-button" onClick={onDetails}>
        View Details <ArrowUpRight size={14} />
      </button>
      {item.responseStatus && (
        <p className="portal-request-card__response">
          Your response: {item.responseStatus}
        </p>
      )}
    </article>
  );
}
export function PortalEmpty({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="portal-empty">
      <span>
        <Droplet size={25} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {href && (
        <Link className="portal-text-link" href={href}>
          {action || "Continue"} <ArrowUpRight size={14} />
        </Link>
      )}
    </div>
  );
}
