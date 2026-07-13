"use client";

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getApiErrorMessage, getApiStatusCode, getApiValidationIssues } from '@/lib/api';
import { resetPassword } from '@/services/auth-service';

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialToken = useMemo(() => searchParams.get('token') ?? '', [searchParams]);

  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      const message = 'Passwords do not match.';
      setError(message);
      toast.error(message);
      return;
    }

    setIsSubmitting(true);

    try {
      const message = await resetPassword({ token, new_password: newPassword });
      setSuccess(message);
      toast.success(message);

      setTimeout(() => {
        router.push('/auth/login');
      }, 2000);
    } catch (err) {
      const status = getApiStatusCode(err);

      if (status === 400) {
        const message = 'Invalid or expired reset token. Request a new one and try again.';
        setError(message);
        toast.error(message);
        return;
      }

      if (status === 422) {
        const issues = getApiValidationIssues(err);
        const message = issues[0]?.message ?? 'Some submitted values are invalid. Please review and try again.';
        setError(message);
        toast.error(message);
        return;
      }

      if (status === 500) {
        const message = 'Something went wrong on our side. Please try again in a few moments.';
        setError(message);
        toast.error(message);
        return;
      }

      const fallbackMessage = getApiErrorMessage(err, 'Unable to reset password right now.');
      setError(fallbackMessage);
      toast.error(fallbackMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="mx-auto max-w-md">
        <Card className="p-6">
          <h1 className="text-2xl font-bold text-slate-950">Reset password</h1>
          <p className="mt-1 text-sm text-slate-600">Enter your reset token and choose a new password.</p>

          {success ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <Input
              label="Reset token"
              placeholder="Paste your reset token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              disabled={isSubmitting}
              required
            />
            <Input
              label="New password"
              type="password"
              placeholder="••••••••"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={isSubmitting}
              required
              autoComplete="new-password"
            />
            <Input
              label="Confirm new password"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={isSubmitting}
              required
              autoComplete="new-password"
            />

            {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

            <Button type="submit" fullWidth disabled={isSubmitting}>
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Resetting password...
                </span>
              ) : (
                'Reset password'
              )}
            </Button>
          </form>

          <div className="mt-4 text-sm">
            <Link href="/auth/forgot-password" className="text-fluid-700 hover:underline">
              Back to forgot password
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}
