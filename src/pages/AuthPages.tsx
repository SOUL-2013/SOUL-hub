import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { ArrowRight, KeyRound, MailCheck, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { auth } from '../lib/firebase';
import { Link, useRouter } from '../lib/router';
import { BrandLogo } from '../components/BrandLogo';

export function AuthPage({ mode }: { mode: 'login' | 'signup' | 'forgot' }) {
  const { signInWithGoogle, firebaseUser } = useAuth();
  const { pushToast } = useToast();
  const { navigate } = useRouter();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [resetSent, setResetSent] = useState(false);

  if (firebaseUser && mode !== 'forgot') {
    return (
      <div className="max-w-md mx-auto px-6 py-20">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-8 text-center">
          <BrandLogo size={32} />
          <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">You are already signed in</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Continue to your personalized SOUL HUB workspace.</p>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="mt-6 w-full px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const handleGoogleAuth = async () => {
    setBusy(true);
    setErrorMsg('');
    try {
      await signInWithGoogle();
      pushToast({ type: 'success', title: 'Signed in to SOUL HUB', message: 'Your developer session is active.' });
      navigate('/dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      setErrorMsg(msg);
      pushToast({ type: 'error', title: 'Authentication error', message: msg });
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMsg('Please enter your account email address.');
      return;
    }
    setBusy(true);
    setErrorMsg('');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSent(true);
      pushToast({ type: 'success', title: 'Password reset sent', message: 'Check your inbox for recovery instructions.' });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to send password reset email.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-8">
        <div className="mb-6">
          <BrandLogo size={30} />
          <h1 className="mt-5 font-display text-2xl font-bold text-slate-950 dark:text-white">
            {mode === 'signup'
              ? 'Create your SOUL HUB account'
              : mode === 'forgot'
              ? 'Recover your account'
              : 'Sign in to SOUL HUB'}
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            {mode === 'forgot'
              ? 'Send a Firebase Auth password recovery email if Email/Password login is enabled for your project.'
              : 'Authenticated via Firebase Authentication with verified developer identity.'}
          </p>
        </div>

        {errorMsg && (
          <div role="alert" className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-300">
            {errorMsg}
          </div>
        )}

        {mode === 'forgot' ? (
          <form onSubmit={handlePasswordReset} className="space-y-4">
            <div>
              <label htmlFor="reset-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Developer Email
              </label>
              <input
                id="reset-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              <KeyRound className="w-4 h-4" />
              <span>{busy ? 'Sending...' : 'Send Reset Email'}</span>
            </button>
            {resetSent && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <MailCheck className="w-4 h-4" />
                <span>Recovery email dispatched if the account exists with password sign-in.</span>
              </p>
            )}
            <div className="pt-3 text-xs text-slate-500">
              <Link to="/login" className="text-blue-600 dark:text-blue-400 hover:underline">
                Back to sign in
              </Link>
            </div>
          </form>
        ) : (
          <div className="space-y-5">
            <button
              type="button"
              disabled={busy}
              onClick={handleGoogleAuth}
              className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-3 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              <span>{busy ? 'Authenticating...' : 'Continue with Google'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#07090F] p-4 text-xs text-slate-600 dark:text-slate-400 space-y-2">
              <div className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200">
                <Shield className="w-4 h-4 text-blue-500" />
                <span>Authentication Provider Details</span>
              </div>
              <p>
                Google Sign-In is pre-configured with verified email tokens so your profile, repositories, and Personal Access Tokens work immediately.
              </p>
              <p>
                To enable Email/Password login as an additional provider, enable <strong>Email/Password</strong> inside the Firebase Console under Authentication &rarr; Sign-in method.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              {mode === 'login' ? (
                <Link to="/signup" className="hover:text-slate-900 dark:hover:text-slate-200">
                  New to SOUL HUB? Create account
                </Link>
              ) : (
                <Link to="/login" className="hover:text-slate-900 dark:hover:text-slate-200">
                  Already have an account? Sign in
                </Link>
              )}
              <Link to="/forgot-password" className="text-blue-600 dark:text-blue-400 hover:underline">
                Password recovery
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
