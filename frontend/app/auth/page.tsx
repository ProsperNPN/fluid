import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function AuthPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-slate-950">Choose account type</h1>
        <p className="mt-2 text-slate-600">Select how you want to use FLUID and continue to registration.</p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Card>
            <p className="text-lg font-semibold text-slate-900">Donor account</p>
            <p className="mt-2 text-sm text-slate-600">Receive compatible blood request alerts and manage donation history.</p>
            <div className="mt-4">
              <Link href="/auth/register?type=donor">
                <Button fullWidth>Continue as Donor</Button>
              </Link>
            </div>
          </Card>

          <Card>
            <p className="text-lg font-semibold text-slate-900">Hospital account</p>
            <p className="mt-2 text-sm text-slate-600">Create blood requests and coordinate donor appointments.</p>
            <div className="mt-4">
              <Link href="/auth/register?type=hospital">
                <Button fullWidth>Continue as Hospital</Button>
              </Link>
            </div>
          </Card>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link href="/auth/login" className="text-fluid-700 hover:underline">
            Already have an account? Login
          </Link>
          <Link href="/auth/forgot-password" className="text-slate-600 hover:underline">
            Forgot password?
          </Link>
        </div>
      </div>
    </main>
  );
}
