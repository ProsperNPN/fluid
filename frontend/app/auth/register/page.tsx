"use client";

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getApiErrorMessage, getApiStatusCode, getApiValidationIssues } from '@/lib/api';
import { registerUser } from '@/services/auth-service';

type RegisterField = 'fullName' | 'email' | 'password' | 'confirmPassword' | 'accountType';

const fieldIds: Record<RegisterField, string> = {
  fullName: 'register-full-name',
  email: 'register-email',
  password: 'register-password',
  confirmPassword: 'register-confirm-password',
  accountType: 'register-account-type',
};

function mapApiFieldToRegisterField(field: string | null): RegisterField | null {
  if (!field) return null;

  if (field === 'email') return 'email';
  if (field === 'password') return 'password';
  if (field === 'full_name') return 'fullName';
  if (field === 'role') return 'accountType';
  return null;
}

export default function RegisterPage() {
  const router = useRouter();
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accountType, setAccountType] = useState<'Donor' | 'Hospital'>('Donor');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondaryMessage, setSecondaryMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RegisterField, string>>>({});

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  const focusField = (field: RegisterField) => {
    const element = document.getElementById(fieldIds[field]) as HTMLElement | null;
    element?.focus();
  };

  const focusFirstInvalidField = (fields: RegisterField[]) => {
    for (const field of fields) {
      const element = document.getElementById(fieldIds[field]) as HTMLElement | null;
      if (element) {
        element.focus();
        return;
      }
    }
  };

  const goToSignIn = () => {
    const destination = accountType === 'Hospital' ? '/hospital' : '/donor';
    router.push(`/auth/login?registered=1&next=${encodeURIComponent(destination)}`);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }

    setFieldErrors({});
    setError(null);
    setSecondaryMessage(null);
    setIsSuccess(false);

    if (password !== confirmPassword) {
      const message = 'Passwords do not match.';
      setError(message);
      setFieldErrors({ confirmPassword: message });
      focusField('confirmPassword');
      toast.error(message);
      return;
    }

    setIsSubmitting(true);

    try {
      await registerUser({
        email,
        password,
        full_name: fullName,
        role: accountType === 'Hospital' ? 'hospital' : 'donor',
      });
      setIsSuccess(true);
      toast.success('🎉 Account created successfully! You can now sign in.');

      redirectTimeoutRef.current = setTimeout(() => {
        goToSignIn();
      }, 2500);
    } catch (err) {
      const status = getApiStatusCode(err);

      if (status === 409) {
        const conflictMessage = 'An account with this email already exists.';
        setError(conflictMessage);
        setSecondaryMessage('Please sign in instead.');
        setFieldErrors({ email: conflictMessage });
        focusField('email');
        toast.error(conflictMessage);
        return;
      }

      if (status === 422) {
        const issues = getApiValidationIssues(err);
        if (issues.length > 0) {
          const nextFieldErrors: Partial<Record<RegisterField, string>> = {};
          const invalidFields: RegisterField[] = [];

          for (const issue of issues) {
            const mappedField = mapApiFieldToRegisterField(issue.field);
            if (!mappedField) continue;
            if (!nextFieldErrors[mappedField]) {
              nextFieldErrors[mappedField] = issue.message;
              invalidFields.push(mappedField);
            }
          }

          setFieldErrors(nextFieldErrors);
          setError(issues[0].message);
          focusFirstInvalidField(invalidFields);
          toast.error(issues[0].message);
          return;
        }
      }

      if (status === 500) {
        const serverMessage = 'Something went wrong on our side. Please try again in a few moments.';
        setError(serverMessage);
        toast.error(serverMessage);
        return;
      }

      const fallbackMessage = getApiErrorMessage(err, 'Unable to create your account right now.');
      setError(fallbackMessage);
      toast.error(fallbackMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="mx-auto max-w-lg">
        <Card className="p-6">
          <h1 className="text-2xl font-bold text-slate-950">Register</h1>
          <p className="mt-1 text-sm text-slate-600">Create a donor or hospital account.</p>

          {isSuccess ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <p>🎉 Account created successfully! You can now sign in.</p>
              <div className="mt-2">
                <Button type="button" variant="secondary" className="px-3 py-1.5 text-xs" onClick={goToSignIn}>
                  Sign In Now
                </Button>
              </div>
            </div>
          ) : null}

          <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
            <div className="sm:col-span-2">
              <Input
                id={fieldIds.fullName}
                label="Full name / Organization name"
                placeholder="Enter your name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                disabled={isSubmitting}
                className={fieldErrors.fullName ? 'border-red-500 focus:border-red-500' : undefined}
                aria-invalid={Boolean(fieldErrors.fullName)}
                required
              />
              {fieldErrors.fullName ? <p className="mt-1 text-xs text-red-600">{fieldErrors.fullName}</p> : null}
            </div>
            <div>
              <Input
                id={fieldIds.email}
                label="Email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isSubmitting}
                className={fieldErrors.email ? 'border-red-500 focus:border-red-500' : undefined}
                aria-invalid={Boolean(fieldErrors.email)}
                required
                autoComplete="email"
              />
              {fieldErrors.email ? <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p> : null}
            </div>
            <Input label="Phone" type="tel" placeholder="+233 ..." value={phone} onChange={(event) => setPhone(event.target.value)} disabled={isSubmitting} />
            <div className="sm:col-span-2">
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-slate-700">Account type</span>
                <select
                  id={fieldIds.accountType}
                  className={`w-full rounded-xl border px-3 py-2.5 text-slate-900 outline-none focus:border-fluid-700 ${fieldErrors.accountType ? 'border-red-500 focus:border-red-500' : 'border-slate-300'}`}
                  value={accountType}
                  onChange={(event) => setAccountType(event.target.value as 'Donor' | 'Hospital')}
                  disabled={isSubmitting}
                >
                  <option>Donor</option>
                  <option>Hospital</option>
                </select>
              </label>
              {fieldErrors.accountType ? <p className="mt-1 text-xs text-red-600">{fieldErrors.accountType}</p> : null}
            </div>
            <div>
              <Input
                id={fieldIds.password}
                label="Password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSubmitting}
                className={fieldErrors.password ? 'border-red-500 focus:border-red-500' : undefined}
                aria-invalid={Boolean(fieldErrors.password)}
                required
                autoComplete="new-password"
              />
              {fieldErrors.password ? <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p> : null}
            </div>
            <div>
              <Input
                id={fieldIds.confirmPassword}
                label="Confirm password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={isSubmitting}
                className={fieldErrors.confirmPassword ? 'border-red-500 focus:border-red-500' : undefined}
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
                required
                autoComplete="new-password"
              />
              {fieldErrors.confirmPassword ? <p className="mt-1 text-xs text-red-600">{fieldErrors.confirmPassword}</p> : null}
            </div>

            {error ? <p className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            {secondaryMessage ? <p className="sm:col-span-2 text-sm text-slate-600">{secondaryMessage}</p> : null}

            {secondaryMessage ? (
              <div className="sm:col-span-2">
                <Button type="button" variant="secondary" onClick={goToSignIn}>
                  Go to Sign In
                </Button>
              </div>
            ) : null}

            <div className="sm:col-span-2">
              <Button type="submit" fullWidth disabled={isSubmitting}>
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating account...
                  </span>
                ) : (
                  'Create account'
                )}
              </Button>
            </div>
          </form>

          <div className="mt-4 text-sm">
            <Link href="/auth/login" className="text-fluid-700 hover:underline">
              Already have an account? Login
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}
