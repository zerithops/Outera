import React, { useState, useEffect } from 'react';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  KeyRound,
} from 'lucide-react';
import {
  sendPasswordResetEmail,
  updateUserPasswordWithRecovery,
  processAuthCallbackUrl,
  resendVerificationEmail,
  getCurrentSession,
} from '../services/supabase';
import { OuteraLogo } from './OuteraLogo';

// ============================================================================
// 1. FORGOT PASSWORD PAGE (/forgot-password)
// ============================================================================
interface ForgotPasswordPageProps {
  onBackToSignIn: () => void;
  onGoHome: () => void;
}

export const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({
  onBackToSignIn,
  onGoHome,
}) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    const res = await sendPasswordResetEmail(cleanEmail);
    setLoading(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Please wait a moment before requesting another reset link.');
      return;
    }

    setSubmitted(true);
    setCooldown(60);
  };

  return (
    <div className="min-h-[82vh] w-full bg-[#0B0D0B] text-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-[#111317] border border-white/[0.09] rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onGoHome}
            className="focus:outline-none cursor-pointer"
            aria-label="OUTERA Home"
          >
            <OuteraLogo size="sm" />
          </button>
          <button
            type="button"
            onClick={onBackToSignIn}
            className="h-9 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-zinc-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Sign In</span>
          </button>
        </div>

        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.14em] text-[#D8FF36]">
            <KeyRound className="w-3.5 h-3.5" />
            <span>Account Recovery</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Forgot your password?
          </h1>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Enter the email address associated with your OUTERA account. We will send a secure link to reset your password.
          </p>
        </div>

        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            <p className="leading-relaxed">{errorMessage}</p>
          </div>
        )}

        {submitted ? (
          <div className="space-y-5">
            <div className="p-4 rounded-2xl bg-[#D8FF36]/10 border border-[#D8FF36]/30 space-y-2">
              <div className="flex items-center gap-2 text-[#D8FF36] font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Check your email inbox</span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                If an account exists for <span className="text-white font-semibold font-mono">{email.trim()}</span>, a password reset link has been sent. Click the link in that email to open the password reset screen.
              </p>
              <p className="text-[11px] text-zinc-400 pt-1">
                For your security, we do not disclose whether an email address is registered.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                disabled={loading || cooldown > 0}
                onClick={handleSubmit}
                className="flex-1 h-11 px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#D8FF36]' : ''}`} />
                <span>
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send Again'}
                </span>
              </button>

              <button
                type="button"
                onClick={onBackToSignIn}
                className="flex-1 h-11 px-4 rounded-xl bg-[#D8FF36] hover:bg-[#e2ff5e] text-black font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <span>Return to Sign In</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="forgot-email-input"
                className="block text-[11px] font-semibold text-zinc-300 mb-1.5"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  id="forgot-email-input"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#D8FF36]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl bg-[#D8FF36] hover:bg-[#e2ff5e] text-black font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            >
              <span>{loading ? 'Sending Reset Link...' : 'Send Password Reset Link'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 2. RESET PASSWORD PAGE (/reset-password)
// ============================================================================
interface ResetPasswordPageProps {
  onBackToSignIn: () => void;
  onGoToForgotPassword: () => void;
  onGoHome: () => void;
}

export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({
  onBackToSignIn,
  onGoToForgotPassword,
  onGoHome,
}) => {
  const [verifyingSession, setVerifyingSession] = useState(true);
  const [sessionValid, setSessionValid] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [resetComplete, setResetComplete] = useState(false);

  useEffect(() => {
    let mounted = true;

    const verifyRecoverySession = async () => {
      setVerifyingSession(true);
      const hasUrlTokens =
        window.location.search.includes('code=') ||
        window.location.search.includes('token_hash=') ||
        window.location.search.includes('error=') ||
        window.location.hash.includes('access_token=') ||
        window.location.hash.includes('error=');

      if (hasUrlTokens) {
        const callbackRes = await processAuthCallbackUrl();
        if (!mounted) return;
        if (callbackRes.status === 'error') {
          setSessionValid(false);
          setSessionError(callbackRes.message);
          setVerifyingSession(false);
          return;
        }
        setSessionValid(true);
        setVerifyingSession(false);
        return;
      }

      const session = await getCurrentSession();
      if (!mounted) return;
      if (session?.user) {
        setSessionValid(true);
      } else {
        setSessionValid(false);
        setSessionError(
          'Your password recovery link has expired or is invalid. Please request a new reset link.'
        );
      }
      setVerifyingSession(false);
    };

    verifyRecoverySession();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!newPassword || newPassword.length < 6) {
      setFormError('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError('Passwords do not match. Please verify both fields.');
      return;
    }

    setSubmitting(true);
    const res = await updateUserPasswordWithRecovery(newPassword);
    setSubmitting(false);

    if (!res.success) {
      setFormError(res.error || 'Could not update your password. Your link may have expired.');
      return;
    }

    setResetComplete(true);
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="min-h-[82vh] w-full bg-[#0B0D0B] text-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-[#111317] border border-white/[0.09] rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onGoHome}
            className="focus:outline-none cursor-pointer"
            aria-label="OUTERA Home"
          >
            <OuteraLogo size="sm" />
          </button>
          <button
            type="button"
            onClick={onBackToSignIn}
            className="h-9 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-zinc-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
        </div>

        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.14em] text-[#D8FF36]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Security Credential Update</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Set a new password
          </h1>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Choose a strong password of at least 6 characters to secure your OUTERA Scout account.
          </p>
        </div>

        {verifyingSession ? (
          <div className="py-10 text-center space-y-3">
            <RefreshCw className="w-6 h-6 text-[#D8FF36] animate-spin mx-auto" />
            <p className="text-xs text-zinc-300 font-mono">
              Verifying secure recovery session...
            </p>
          </div>
        ) : resetComplete ? (
          <div className="space-y-5">
            <div className="p-4 rounded-2xl bg-[#D8FF36]/10 border border-[#D8FF36]/30 space-y-2">
              <div className="flex items-center gap-2 text-[#D8FF36] font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Password updated successfully</span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Your new password is now active. You can continue exploring OUTERA or sign in with your updated credentials.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={onBackToSignIn}
                className="flex-1 h-11 px-4 rounded-xl bg-[#D8FF36] hover:bg-[#e2ff5e] text-black font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <span>Return to Sign In</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onGoHome}
                className="flex-1 h-11 px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-bold text-white transition-all cursor-pointer"
              >
                Explore OUTERA
              </button>
            </div>
          </div>
        ) : !sessionValid ? (
          <div className="space-y-5">
            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/25 space-y-2">
              <div className="flex items-center gap-2 text-red-300 font-bold text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>Recovery link expired or invalid</span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                {sessionError ||
                  'This password reset link is no longer valid. Password recovery links are single-use and expire automatically for security.'}
              </p>
            </div>

            <button
              type="button"
              onClick={onGoToForgotPassword}
              className="w-full h-11 rounded-xl bg-[#D8FF36] hover:bg-[#e2ff5e] text-black font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>Request New Reset Link</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                <p className="leading-relaxed">{formError}</p>
              </div>
            )}

            <div>
              <label
                htmlFor="reset-new-password"
                className="block text-[11px] font-semibold text-zinc-300 mb-1.5"
              >
                New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  id="reset-new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full h-11 pl-10 pr-10 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#D8FF36]"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-1 cursor-pointer"
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="reset-confirm-password"
                className="block text-[11px] font-semibold text-zinc-300 mb-1.5"
              >
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  id="reset-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full h-11 pl-10 pr-10 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#D8FF36]"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-1 cursor-pointer"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-11 rounded-xl bg-[#D8FF36] hover:bg-[#e2ff5e] text-black font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            >
              <span>{submitting ? 'Updating Password...' : 'Save New Password'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 3. AUTH CALLBACK PAGE (/auth/callback)
// ============================================================================
interface AuthCallbackPageProps {
  onNavigateToResetPassword: () => void;
  onNavigateToForgotPassword: () => void;
  onNavigateToProfile: () => void;
  onGoHome: () => void;
}

export const AuthCallbackPage: React.FC<AuthCallbackPageProps> = ({
  onNavigateToResetPassword,
  onNavigateToForgotPassword,
  onNavigateToProfile,
  onGoHome,
}) => {
  const [status, setStatus] = useState<
    'verifying' | 'verified' | 'recovery' | 'email_change' | 'magiclink' | 'error'
  >('verifying');
  const [message, setMessage] = useState('Verifying your authentication link...');
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    processAuthCallbackUrl().then((res) => {
      if (!mounted) return;
      setStatus(res.status);
      setMessage(res.message);
      if (res.email) setResendEmail(res.email);

      if (res.status === 'recovery') {
        onNavigateToResetPassword();
      }
    });
    return () => {
      mounted = false;
    };
  }, [onNavigateToResetPassword]);

  const handleResendVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendNotice(null);
    if (!resendEmail.trim()) return;

    setResending(true);
    const res = await resendVerificationEmail(resendEmail.trim());
    setResending(false);

    if (res.success) {
      setResendNotice('A fresh verification link has been sent. Please check your inbox.');
    } else {
      setResendNotice(res.error || 'Could not resend verification email. Please wait 60 seconds.');
    }
  };

  return (
    <div className="min-h-[82vh] w-full bg-[#0B0D0B] text-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-[#111317] border border-white/[0.09] rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onGoHome}
            className="focus:outline-none cursor-pointer"
            aria-label="OUTERA Home"
          >
            <OuteraLogo size="sm" />
          </button>
          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
            Security Gateway
          </span>
        </div>

        {status === 'verifying' && (
          <div className="py-10 text-center space-y-3">
            <RefreshCw className="w-7 h-7 text-[#D8FF36] animate-spin mx-auto" />
            <h1 className="text-lg font-extrabold text-white">Completing verification...</h1>
            <p className="text-xs text-zinc-400 font-mono">{message}</p>
          </div>
        )}

        {(status === 'verified' || status === 'email_change' || status === 'magiclink') && (
          <div className="space-y-5">
            <div className="p-4 rounded-2xl bg-[#D8FF36]/10 border border-[#D8FF36]/30 space-y-2">
              <div className="flex items-center gap-2 text-[#D8FF36] font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {status === 'email_change'
                    ? 'Email Change Confirmed'
                    : status === 'magiclink'
                    ? 'Magic Link Verified'
                    : 'Email Verified'}
                </span>
              </div>
              <p className="text-xs text-zinc-200 leading-relaxed">{message}</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={onGoHome}
                className="flex-1 h-11 px-4 rounded-xl bg-[#D8FF36] hover:bg-[#e2ff5e] text-black font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <span>Explore OUTERA</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onNavigateToProfile}
                className="flex-1 h-11 px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-bold text-white transition-all cursor-pointer"
              >
                Scout Profile & Security
              </button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-5">
            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/25 space-y-2">
              <div className="flex items-center gap-2 text-red-300 font-bold text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>Verification Link Expired or Invalid</span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">{message}</p>
            </div>

            <form onSubmit={handleResendVerification} className="space-y-3 pt-1">
              <label className="block text-[11px] font-semibold text-zinc-300">
                Need a new email verification link?
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  required
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder="Enter your email address"
                  className="flex-1 h-10 px-3.5 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#D8FF36]"
                />
                <button
                  type="submit"
                  disabled={resending}
                  className="h-10 px-4 rounded-xl bg-[#D8FF36] hover:bg-[#e2ff5e] text-black font-extrabold text-xs whitespace-nowrap transition-all disabled:opacity-50 cursor-pointer"
                >
                  {resending ? 'Sending...' : 'Resend'}
                </button>
              </div>
              {resendNotice && (
                <p className="text-xs text-[#D8FF36] font-medium">{resendNotice}</p>
              )}
            </form>

            <div className="flex items-center justify-between pt-2 border-t border-white/[0.07] text-xs">
              <button
                type="button"
                onClick={onNavigateToForgotPassword}
                className="text-zinc-300 hover:text-[#D8FF36] font-semibold transition-colors cursor-pointer"
              >
                Reset password instead →
              </button>
              <button
                type="button"
                onClick={onGoHome}
                className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                Return Home
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
