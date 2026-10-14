"use client";
import { useCallback, useEffect, useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { getApiErrorMessage } from "@/lib/api";
import {
  deactivateHospitalStaff,
  inviteHospitalStaff,
  listHospitalStaff,
  updateHospitalStaffRole,
  type HospitalStaff,
  type HospitalStaffRole,
} from "@/services/hospital-staff-service";
import { PortalDialog } from "@/components/portal/portal-ui";
const roles: HospitalStaffRole[] = [
  "hospital_admin",
  "blood_bank_manager",
  "hospital_staff",
  "viewer",
];
export default function HospitalStaffPage() {
  const [pendingDeactivation, setPendingDeactivation] =
    useState<HospitalStaff | null>(null);
  const [items, setItems] = useState<HospitalStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<HospitalStaffRole>("hospital_staff");
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listHospitalStaff());
    } catch (e) {
      setError(getApiErrorMessage(e, "Unable to load hospital staff."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const invite = async () => {
    setBusy("invite");
    try {
      await inviteHospitalStaff(email, role);
      toast.success("Staff member invited.");
      setEmail("");
      await load();
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Unable to invite this staff member."));
    } finally {
      setBusy(null);
    }
  };
  const change = async (item: HospitalStaff, next: HospitalStaffRole) => {
    setBusy(item.id);
    try {
      await updateHospitalStaffRole(item.id, next);
      toast.success("Staff role updated.");
      await load();
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Unable to update this role."));
    } finally {
      setBusy(null);
    }
  };
  const deactivate = async (item: HospitalStaff) => {
    setBusy(item.id);
    try {
      await deactivateHospitalStaff(item.id);
      toast.success("Staff access deactivated.");
      setPendingDeactivation(null);
      await load();
    } catch (e) {
      toast.error(
        getApiErrorMessage(e, "Unable to deactivate this staff member."),
      );
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-red-50 p-2 text-[#C0392B]">
            <UserPlus className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold">Invite staff</h2>
            <p className="text-sm text-slate-500">
              The user must already have a FLUID hospital account.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_220px_auto]">
          <input
            aria-label="Staff email address"
            type="email"
            placeholder="staff@hospital.org"
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select
            aria-label="Invitation role"
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as HospitalStaffRole)}
          >
            {roles.map((v) => (
              <option key={v} value={v}>
                {v.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <Button
            disabled={!email || busy === "invite"}
            onClick={() => void invite()}
          >
            Invite
          </Button>
        </div>
      </section>
      {loading ? (
        <LoadingState text="Loading staff..." />
      ) : error ? (
        <EmptyState
          title="Staff management unavailable"
          description={error}
          actionLabel="Try again"
          onAction={() => void load()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No staff members"
          description="Invite staff to collaborate on hospital operations."
        />
      ) : (
        <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-[750px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Staff member</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last login</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-4 py-4">
                    <p className="font-medium">
                      {item.fullName || "Hospital user"}
                    </p>
                    <p className="text-xs text-slate-500">{item.email}</p>
                  </td>
                  <td className="px-4 py-4">
                    <select
                      aria-label={`Role for ${item.fullName || item.email}`}
                      disabled={busy === item.id}
                      value={item.role}
                      onChange={(e) =>
                        void change(item, e.target.value as HospitalStaffRole)
                      }
                      className="rounded-lg border border-slate-200 px-2 py-1.5 capitalize"
                    >
                      {roles.map((v) => (
                        <option key={v} value={v}>
                          {v.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-4">
                    {item.isActive ? "Active" : "Inactive"}
                  </td>
                  <td className="px-4 py-4">
                    {item.lastLoginAt
                      ? new Date(item.lastLoginAt).toLocaleString()
                      : "Never"}
                  </td>
                  <td className="px-4 py-4">
                    <button
                      disabled={!item.isActive || busy === item.id}
                      onClick={() => setPendingDeactivation(item)}
                      className="text-sm font-medium text-red-700 disabled:text-slate-300"
                    >
                      Deactivate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {pendingDeactivation && (
        <PortalDialog
          title="Deactivate Staff Access"
          onClose={() => setPendingDeactivation(null)}
        >
          <p>
            Deactivate{" "}
            {pendingDeactivation.fullName || pendingDeactivation.email}?
            Operational access will be revoked.
          </p>
          <div className="portal-dialog-actions mt-5">
            <button
              className="portal-button portal-button--secondary"
              onClick={() => setPendingDeactivation(null)}
            >
              Keep Access
            </button>
            <button
              className="portal-button"
              disabled={!!busy}
              onClick={() => void deactivate(pendingDeactivation)}
            >
              Confirm Deactivation
            </button>
          </div>
        </PortalDialog>
      )}
    </div>
  );
}
