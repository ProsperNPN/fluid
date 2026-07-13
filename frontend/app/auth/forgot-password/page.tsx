"use client";

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getApiErrorMessage, getApiStatusCode, getApiValidationIssues } from '@/lib/api';
import { requestPasswordReset } from '@/services/auth-service';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setSuccessMessage(null);
    setResetToken(null);
    setIsSubmitting(true);

    try {
      const response = await requestPasswordReset({ email });
      setSuccessMessage(response.message);
      setResetToken(response.reset_token);
      toast.success(response.message);
    } catch (err) {
      const status = getApiStatusCode(err);

      if (status === 422) {
        const issues = getApiValidationIssues(err);
        const message = issues[0]?.message ?? 'Please enter a valid email address.';
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

      const fallbackMessage = getApiErrorMessage(err, 'Unable to process your request right now.');
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
          <h1 className="text-2xl font-bold text-slate-950">Forgot password</h1>
          <p className="mt-1 text-sm text-slate-600">Enter your email and we will issue a password reset token.</p>

          {successMessage ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMessage}</div> : null}
          {resetToken ? (
            <div className="mt-3 rounded-lg border border-fluid-200 bg-fluid-50 px-3 py-2 text-sm text-fluid-800">
              <p className="font-medium">Reset token (development):</p>
              <p className="mt-1 break-all text-xs">{resetToken}</p>
              <p className="mt-2 text-xs text-fluid-700">Use this token on the reset password page.</p>
            </div>
          ) : null}

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isSubmitting}
              required
              autoComplete="email"
            />

            {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

            <Button type="submit" fullWidth disabled={isSubmitting}>
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending reset token...
                </span>
              ) : (
                'Send reset instructions'
              )}
            </Button>
          </form>

          <div className="mt-4 text-sm">
            <Link href="/auth/login" className="text-fluid-700 hover:underline">
              Back to login
            </Link>
            <span className="mx-2 text-slate-400">•</span>
            <Link href="/auth/reset-password" className="text-slate-600 hover:underline">
              Reset password
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}
