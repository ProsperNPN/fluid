"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { Bell, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePortalQuery } from "@/hooks/use-portal-query";
import { getApiErrorMessage } from "@/lib/api";
import {
  listNotifications,
  markNotificationRead,
  markNotificationUnread,
  markAllNotificationsRead,
  deleteNotification,
} from "@/services/notifications-service";
import { respondToRequest } from "@/services/compatible-requests-service";
import { PortalEmpty, PortalPanel, PortalSkeleton } from "./portal-ui";

export function NotificationCenter({ preview = false }: { preview?: boolean }) {
  const [unread, setUnread] = useState(false),
    [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const loader = useCallback(
    () => listNotifications(unread, page),
    [unread, page],
  );
  const query = usePortalQuery(loader);
  async function action(operation: () => Promise<unknown>) {
    setBusy(true);
    try {
      await operation();
      await query.refresh();
      window.dispatchEvent(new Event("fluid:live-update"));
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          "Unable to update this alert. Please refresh and try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  if (query.loading) return <PortalSkeleton />;
  const items = preview
    ? query.data?.items.filter((i) => i.emergency?.can_respond).slice(0, 3)
    : query.data?.items;
  if (preview && !items?.length) return null;
  return (
    <div className="portal-stack">
      <PortalPanel
        title={
          preview ? "Emergency invitations near you" : "Notification center"
        }
      >
        {!preview && (
          <div className="flex flex-wrap gap-3 mb-4">
            <button
              className="portal-button portal-button--secondary"
              aria-pressed={!unread}
              onClick={() => {
                setUnread(false);
                setPage(1);
              }}
            >
              All history
            </button>
            <button
              className="portal-button portal-button--secondary"
              aria-pressed={unread}
              onClick={() => {
                setUnread(true);
                setPage(1);
              }}
            >
              Unread ({query.data?.unreadCount ?? 0})
            </button>
            <button
              className="portal-button portal-button--secondary"
              disabled={busy || !query.data?.unreadCount}
              onClick={() => void action(markAllNotificationsRead)}
            >
              Mark all read
            </button>
          </div>
        )}
        {query.error && (
          <p role="alert" className="text-red-700">
            {query.error}
          </p>
        )}
        {!items?.length ? (
          <PortalEmpty
            title="No notifications"
            description="Request updates and invitations will appear here."
          />
        ) : (
          <div className="grid gap-4">
            {items.map((item) => (
              <article
                key={item.id}
                className={`rounded-2xl border p-4 ${item.emergency ? "border-red-200 bg-red-50/40" : "border-slate-200"}`}
              >
                <div className="flex justify-between gap-3">
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold">
                      <Bell size={18} className="text-[#C0392B]" />
                      {item.title}
                      {!item.isRead && (
                        <span className="text-xs text-red-700">Unread</span>
                      )}
                    </h3>
                    <p className="mt-2 text-sm text-slate-600">
                      {item.message}
                    </p>
                  </div>
                  {!preview && (
                    <button
                      disabled={busy}
                      aria-label="Delete notification"
                      onClick={() =>
                        void action(() => deleteNotification(item.id))
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>
                {item.emergency && (
                  <div className="mt-4 space-y-3">
                    <p className="font-semibold">{item.emergency.hospital}</p>
                    <p className="text-sm text-slate-600">
                      {item.emergency.location} · approximately{" "}
                      {item.emergency.distance_km} km away
                    </p>
                    <div className="flex flex-wrap gap-2 text-sm">
                      <span className="rounded-lg bg-red-100 px-3 py-1 font-bold text-red-800">
                        {item.emergency.blood_type}
                      </span>
                      <span>
                        {item.emergency.units} units ·{" "}
                        {item.emergency.component.replaceAll("_", " ")} ·{" "}
                        {item.emergency.urgency}
                      </span>
                    </div>
                    <p className="text-sm">
                      Deadline:{" "}
                      {item.emergency.deadline
                        ? new Date(item.emergency.deadline).toLocaleString()
                        : "Contact hospital"}
                    </p>
                    {item.emergency.can_respond ? (
                      <div className="flex flex-wrap gap-3">
                        <button
                          className="portal-button"
                          disabled={busy}
                          onClick={() =>
                            void action(async () => {
                              await respondToRequest(
                                item.emergency!.request_id,
                                "accepted",
                              );
                              await markNotificationRead(item.id);
                              toast.success(
                                "Availability sent. Hospital review and clinical screening are required.",
                              );
                            })
                          }
                        >
                          I&apos;m Available to Donate
                        </button>
                        <button
                          className="portal-button portal-button--secondary"
                          disabled={busy}
                          onClick={() =>
                            void action(async () => {
                              await respondToRequest(
                                item.emergency!.request_id,
                                "declined",
                              );
                              await markNotificationRead(item.id);
                            })
                          }
                        >
                          Decline
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm font-medium">
                        {item.emergency.response_status
                          ? `Response: ${item.emergency.response_status.replaceAll("_", " ")}`
                          : "Response unavailable"}{" "}
                        · Request: {item.emergency.status || "unavailable"}
                      </p>
                    )}
                    <p className="text-xs text-slate-500">
                      Expressing availability does not confirm a donation or
                      medical eligibility. The hospital must review and screen
                      every donor.
                    </p>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                  <time
                    dateTime={item.createdAt}
                    title={new Date(item.createdAt).toLocaleString()}
                  >
                    {new Date(item.createdAt).toLocaleString()}
                  </time>
                  {!preview && (
                    <button
                      disabled={busy}
                      className="text-[#C0392B]"
                      onClick={() =>
                        void action(() =>
                          item.isRead
                            ? markNotificationUnread(item.id)
                            : markNotificationRead(item.id),
                        )
                      }
                    >
                      Mark {item.isRead ? "unread" : "read"}
                    </button>
                  )}
                  {item.relatedPath && (
                    <Link
                      className="font-semibold text-[#C0392B]"
                      href={item.relatedPath}
                    >
                      View details
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        {!preview && (query.data?.totalPages ?? 0) > 1 && (
          <div className="mt-4 flex items-center gap-4">
            <button
              className="portal-button portal-button--secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span className="text-sm">
              Page {page} of {query.data?.totalPages}
            </span>
            <button
              className="portal-button portal-button--secondary"
              disabled={page >= (query.data?.totalPages ?? 0)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </PortalPanel>
    </div>
  );
}
