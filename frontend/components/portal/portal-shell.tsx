"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Droplets,
  History,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  PackageSearch,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  BarChart3,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { FluidLogo } from "@/components/brand/fluid-logo";
import {
  useRequireAuth,
  resolveDashboardRole,
  getDefaultAuthenticatedRoute,
} from "@/hooks/use-auth";
import { usePortalQuery } from "@/hooks/use-portal-query";
import { getHospitalProfile } from "@/services/profile-service";
import { listNotifications } from "@/services/notifications-service";
import { listConversations } from "@/services/messages-service";
import { getApiErrorMessage } from "@/lib/api";
import { PortalEmpty, PortalSkeleton } from "./portal-ui";

const donorNav = [
  ["", "Overview", LayoutDashboard],
  ["/requests", "Blood Requests", Droplets],
  ["/history", "My Donations", History],
  ["/appointments", "Appointments", CalendarDays],
  ["/availability", "Availability", SlidersHorizontal],
  ["/messages", "Messages", Mail],
  ["/profile", "Profile & Settings", Settings],
  ["/resources", "Resources", BookOpen],
] as const;
const hospitalNav = [
  ["", "Overview", LayoutDashboard],
  ["/requests", "Blood Requests", Droplets],
  ["/donors", "Donor Matches", Users],
  ["/appointments", "Appointments", CalendarDays],
  ["/inventory", "Blood Inventory", PackageSearch],
  ["/analytics", "Analytics", BarChart3],
  ["/messages", "Messages", Mail],
  ["/staff", "Staff Management", Users],
  ["/profile", "Hospital Profile", Settings],
] as const;

export function PortalShell({
  role,
  children,
}: {
  role: "donor" | "hospital";
  children: ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const auth = useRequireAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const allowed = !!auth.user && resolveDashboardRole(auth.user) === role;
  const loader = useCallback(async () => {
    if (!allowed) return null;
    const profile = role === "hospital" ? await getHospitalProfile() : null;
    const operational =
      role === "donor" || profile?.verificationStatus === "verified";
    const [notifications, conversations] = await Promise.all([
      listNotifications(),
      operational
        ? listConversations().catch(() => ({ unreadCount: 0 }))
        : Promise.resolve({ unreadCount: 0 }),
    ]);
    return {
      profile,
      notifications: notifications.unreadCount,
      messages: conversations.unreadCount,
    };
  }, [allowed, role]);
  const query = usePortalQuery(loader);
  const refresh = query.refresh;
  useEffect(() => {
    if (!auth.isLoading && auth.user && !allowed)
      router.replace(getDefaultAuthenticatedRoute(auth.user));
  }, [allowed, auth.isLoading, auth.user, router]);
  useEffect(() => {
    setMobile(false);
    void refresh();
  }, [path, refresh]);
  useEffect(() => {
    const dialog = drawer.current;
    if (mobile && dialog && !dialog.open) dialog.showModal();
    else if (!mobile && dialog?.open) dialog.close();
  }, [mobile]);
  const logout = async () => {
    setLogoutBusy(true);
    try {
      await auth.logout();
      router.replace("/auth/login");
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Unable to log out."));
    } finally {
      setLogoutBusy(false);
    }
  };
  if (auth.isLoading || !allowed)
    return (
      <div className="portal-shell">
        <PortalSkeleton />
      </div>
    );
  const profile = query.data?.profile;
  const nav = (role === "donor" ? donorNav : hospitalNav).filter(
    ([suffix]) =>
      suffix !== "/staff" || profile?.memberRole === "hospital_admin",
  );
  const active =
    nav.find(([suffix]) =>
      suffix ? path.startsWith(`/${role}${suffix}`) : path === `/${role}`,
    )?.[1] || "Notifications";
  const initials = (auth.user?.full_name || "FLUID")
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
  const blocked =
    role === "hospital" &&
    !path.startsWith("/hospital/profile") &&
    (profile?.verificationStatus !== "verified" ||
      !["hospital_admin", "blood_bank_manager", "hospital_staff"].includes(
        profile.memberRole,
      ));
  const sidebar = (compact: boolean) => (
    <>
      <div className="portal-sidebar__brand">
        <Link href={`/${role}`} aria-label="FLUID overview">
          <FluidLogo
            variant={compact ? "icon-only" : "compact"}
            className="h-8 text-[32px]"
          />
        </Link>
        <span className="portal-sidebar__role">
          {role === "donor" ? "DONOR PORTAL" : "HOSPITAL PORTAL"}
        </span>
      </div>
      <nav className="portal-nav" aria-label={`${role} portal navigation`}>
        {nav.map(([suffix, label, Icon]) => {
          const current = suffix
            ? path.startsWith(`/${role}${suffix}`)
            : path === `/${role}`;
          return (
            <Link
              key={suffix}
              href={`/${role}${suffix}`}
              onClick={() => setMobile(false)}
              aria-current={current ? "page" : undefined}
              title={compact ? label : undefined}
              className={current ? "is-active" : ""}
            >
              <Icon size={18} />
              <span>{label}</span>
              {suffix === "/messages" && !!query.data?.messages && (
                <b>{query.data.messages}</b>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="portal-sidebar__bottom">
        <Link href={`/${role}/notifications`}>
          <Bell size={17} />
          <span>Notifications</span>
          {!!query.data?.notifications && <b>{query.data.notifications}</b>}
        </Link>
        <button onClick={() => void logout()} disabled={logoutBusy}>
          <LogOut size={17} />
          <span>{logoutBusy ? "Logging out…" : "Logout"}</span>
        </button>
        <Link href="/" className="portal-back-link">
          <span>Back to FLUID website</span>
        </Link>
      </div>
    </>
  );
  const bottom =
    role === "donor"
      ? donorNav.filter(([suffix]) =>
          ["", "/requests", "/appointments", "/messages", "/profile"].includes(
            suffix,
          ),
        )
      : hospitalNav.filter(([suffix]) =>
          ["", "/requests", "/donors", "/inventory", "/messages"].includes(
            suffix,
          ),
        );
  return (
    <div
      className={`portal-shell ${collapsed ? "portal-shell--collapsed" : ""}`}
    >
      <aside className="portal-sidebar">
        {sidebar(collapsed)}
        <button
          className="portal-collapse"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </aside>
      <dialog
        ref={drawer}
        className="portal-drawer"
        aria-label="Portal navigation"
        onCancel={(event) => {
          event.preventDefault();
          setMobile(false);
          trigger.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setMobile(false);
        }}
      >
        <div>
          <button
            className="portal-drawer__close"
            onClick={() => setMobile(false)}
            aria-label="Close navigation"
          >
            <X size={22} />
          </button>
          {sidebar(false)}
        </div>
      </dialog>
      <div className="portal-workspace">
        <header className="portal-header">
          <div className="portal-header__left">
            <button
              ref={trigger}
              className="portal-menu"
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
            >
              <Menu size={21} />
            </button>
            <Link href={`/${role}`} className="portal-mobile-logo">
              <FluidLogo variant="compact" className="h-7 text-[28px]" />
            </Link>
            <div className="portal-header__desktop">
              <span>
                {role === "hospital"
                  ? profile?.hospitalName || "Hospital workspace"
                  : "Your donation workspace"}
              </span>
              <p>
                {role === "hospital"
                  ? profile?.city || "Hospital portal"
                  : active}
              </p>
            </div>
            {profile?.verificationStatus === "verified" && (
              <span className="portal-verification">
                <ShieldCheck size={13} /> Verified
              </span>
            )}
          </div>
          <div className="portal-header__right">
            <Link
              href={`/${role}/notifications`}
              className="portal-bell"
              aria-label="Notifications"
            >
              <Bell size={19} />
              {!!query.data?.notifications && (
                <b>
                  {query.data.notifications > 9
                    ? "9+"
                    : query.data.notifications}
                </b>
              )}
            </Link>
            <Link
              href={`/${role}/profile`}
              className="portal-user"
              aria-label="Open your profile"
            >
              <span>{initials}</span>
              <div>
                <strong>{auth.user?.full_name || "Your profile"}</strong>
                <small>
                  {role === "hospital"
                    ? profile?.memberRole.replaceAll("_", " ") || "Hospital"
                    : "Donor"}
                </small>
              </div>
            </Link>
          </div>
        </header>
        <main className="portal-main" id="portal-content">
          {query.error && (
            <div role="alert" className="portal-error">
              {query.error}
              <button onClick={() => void query.refresh()}>Retry</button>
            </div>
          )}
          {blocked ? (
            query.loading ? (
              <PortalSkeleton />
            ) : (
              <PortalEmpty
                title={
                  profile?.verificationStatus === "verified"
                    ? "Operational access is restricted"
                    : "Complete your hospital verification"
                }
                description={
                  profile?.verificationStatus === "verified"
                    ? "Your staff role does not include operational permissions. Contact your hospital administrator."
                    : "Upload your facility documents from Hospital Profile. Operational features unlock after Super Admin approval."
                }
                href="/hospital/profile"
                action="Open Hospital Profile"
              />
            )
          ) : (
            <div key={path} className="portal-page-transition">
              {children}
            </div>
          )}
        </main>
      </div>
      <nav className="portal-bottom-nav" aria-label="Mobile portal navigation">
        {bottom.map(([suffix, label, Icon]) => (
          <Link
            key={suffix}
            href={`/${role}${suffix}`}
            aria-current={
              (
                suffix
                  ? path.startsWith(`/${role}${suffix}`)
                  : path === `/${role}`
              )
                ? "page"
                : undefined
            }
          >
            <Icon size={20} />
            <span>
              {suffix === ""
                ? "Home"
                : suffix === "/requests"
                  ? "Requests"
                  : suffix === "/donors"
                    ? "Donors"
                    : suffix === "/inventory"
                      ? "Inventory"
                      : suffix === "/profile"
                        ? "Profile"
                        : label}
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
