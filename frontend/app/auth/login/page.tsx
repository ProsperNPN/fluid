"use client";

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LoadingState } from '@/components/ui/loading-state';
import { getApiErrorMessage, getApiStatusCode, getApiValidationIssues, hasTokens } from '@/lib/api';
import { getDefaultAuthenticatedRoute } from '@/hooks/use-auth';
import { getCurrentUser, loginUser } from '@/services/auth-service';

type LoginField = 'email' | 'password';

const fieldIds: Record<LoginField, string> = {
  email: 'login-email',
  password: 'login-password',
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<LoginField, string>>>({});

  const nextPath = useMemo(() => searchParams.get('next'), [searchParams]);

  const focusField = (field: LoginField) => {
    const element = document.getElementById(fieldIds[field]) as HTMLElement | null;
    element?.focus();
  };

  const focusFirstInvalidField = (fields: LoginField[]) => {
    for (const field of fields) {
      const element = document.getElementById(fieldIds[field]) as HTMLElement | null;
      if (element) {
        element.focus();
        return;
      }
    }
  };

  useEffect(() => {
    const validateSession = async () => {
      if (!hasTokens()) {
        setIsCheckingSession(false);
        return;
      }

      try {
        const user = await getCurrentUser();
        router.replace(nextPath || getDefaultAuthenticatedRoute(user));
      } catch {
        setIsCheckingSession(false);
      }
    };

    void validateSession();
  }, [nextPath, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      await loginUser({ email, password });
      const user = await getCurrentUser();
      router.replace(nextPath || getDefaultAuthenticatedRoute(user));
    } catch (err) {
      const status = getApiStatusCode(err);

      if (status === 401) {
        const message = 'Invalid email or password.';
        setError(message);
        setFieldErrors({ email: message, password: message });
        focusField('email');
        toast.error(message);
        return;
      }

      if (status === 422) {
        const issues = getApiValidationIssues(err);
        if (issues.length > 0) {
          const nextFieldErrors: Partial<Record<LoginField, string>> = {};
          const invalidFields: LoginField[] = [];

          for (const issue of issues) {
            if (issue.field !== 'email' && issue.field !== 'password') continue;
            if (!nextFieldErrors[issue.field]) {
              nextFieldErrors[issue.field] = issue.message;
              invalidFields.push(issue.field);
            }
          }

          const primary = issues[0]?.message ?? 'Some submitted values are invalid. Please review and try again.';
          setFieldErrors(nextFieldErrors);
          setError(primary);
          focusFirstInvalidField(invalidFields);
          toast.error(primary);
          return;
        }
      }

      if (status === 500) {
        const message = 'Something went wrong on our side. Please try again in a few moments.';
        setError(message);
        toast.error(message);
        return;
      }

      const fallbackMessage = getApiErrorMessage(err, 'Unable to sign in right now. Please try again.');
      setError(fallbackMessage);
      toast.error(fallbackMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingSession) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
        <div className="mx-auto max-w-md">
          <LoadingState text="Checking your session..." />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="mx-auto max-w-md">
        <Card className="p-6">
          <h1 className="text-2xl font-bold text-slate-950">Login</h1>
          <p className="mt-1 text-sm text-slate-600">Sign in to access your FLUID dashboard.</p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <Input
              id={fieldIds.email}
              label="Email"
              type="email"
              placeholder="you@hospital.org"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={fieldErrors.email ? 'border-red-500 focus:border-red-500' : undefined}
              aria-invalid={Boolean(fieldErrors.email)}
              disabled={isSubmitting}
              required
              autoComplete="email"
            />
            {fieldErrors.email ? <p className="text-xs text-red-600">{fieldErrors.email}</p> : null}
            <Input
              id={fieldIds.password}
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={fieldErrors.password ? 'border-red-500 focus:border-red-500' : undefined}
              aria-invalid={Boolean(fieldErrors.password)}
              disabled={isSubmitting}
              required
              autoComplete="current-password"
            />
            {fieldErrors.password ? <p className="text-xs text-red-600">{fieldErrors.password}</p> : null}

            {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

            <Button type="submit" fullWidth disabled={isSubmitting}>
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-between text-sm">
            <Link href="/auth/forgot-password" className="text-fluid-700 hover:underline">
              Forgot password?
            </Link>
            <Link href="/auth/register" className="text-slate-600 hover:underline">
              Create account
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}
