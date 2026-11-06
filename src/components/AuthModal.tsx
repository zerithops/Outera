import React, { useState, useEffect } from 'react';
import {
  X,
  Check,
  AlertCircle,
  Mail,
  Lock,
  User as UserIcon,
  AtSign,
  ArrowRight,
  Eye,
  EyeOff,
  Sparkles,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  registerUser,
  signInUser,
  sendPasswordResetEmail,
  resendVerificationEmail,
  sendMagicLink,
  isUsernameAvailable,
} from '../services/supabase';
import { OuteraLogo } from './OuteraLogo';

export type AuthModalMode = 'signin' | 'signup' | 'forgot' | 'magic' | 'verify_pending';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: AuthModalMode;
  contextAction?: string;
  onAuthSuccess?: () => void;
  onOpenForgotPasswordPage?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'signup',
  contextAction,
  onAuthSuccess,
  onOpenForgotPasswordPage,
}) => {
  const [mode, setMode] = useState<AuthModalMode>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setErrorMessage(null);
      setSuccessNotice(null);
    }
  }, [isOpen, initialMode]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  if (!isOpen) return null;

  const resetForm = () => {
    setDisplayName('');
    setUsername('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setAgreeTerms(false);
    setErrorMessage(null);
    setSuccessNotice(null);
  };

  const handleSwitchMode = (newMode: AuthModalMode) => {
    setMode(newMode);
    setErrorMessage(null);
    setSuccessNotice(null);
  };

  const handleResendVerification = async () => {
    if (!email.trim() || resendCooldown > 0) return;
    setErrorMessage(null);
    setSuccessNotice(null);
    setLoading(true);
    const res = await resendVerificationEmail(email.trim());
    setLoading(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Could not resend verification email right now.');
    } else {
      setResendCooldown(60);
      setSuccessNotice(`Verification email resent to ${email.trim()}. Please check your inbox.`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessNotice(null);

    // Mode: Forgot Password
    if (mode === 'forgot') {
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setErrorMessage('Please enter a valid email address.');
        return;
      }
      setLoading(true);
      const res = await sendPasswordResetEmail(email.trim());
      setLoading(false);
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to send reset link.');
      } else {
        setSuccessNotice(
          'If an account exists for this email address, we have sent a password reset link. Please check your inbox.'
        );
      }
      return;
    }

    // Mode: Magic Link (Passwordless)
    if (mode === 'magic') {
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setErrorMessage('Please enter a valid email address.');
        return;
      }
      setLoading(true);
      const res = await sendMagicLink(email.trim());
      setLoading(false);
      if (!res.success) {
        setErrorMessage(res.error || 'Could not send magic link.');
      } else {
        setResendCooldown(60);
        setSuccessNotice(
          `Magic sign-in link sent to ${email.trim()}. Click the link in your email to sign in instantly.`
        );
      }
      return;
    }

    // Mode: Sign In
    if (mode === 'signin') {
      if (!email.trim() || !password) {
        setErrorMessage('Please enter your email and password.');
        return;
      }
      setLoading(true);
      const res = await signInUser(email.trim(), password);
      setLoading(false);

      if (!res.success) {
        if (res.requiresEmailVerification) {
          setMode('verify_pending');
          setErrorMessage(
            res.error || 'Please verify your email address before signing in.'
          );
          return;
        }
        setErrorMessage(res.error || 'That email or password is incorrect.');
      } else {
        setSuccessNotice('Signed in successfully!');
        if (onAuthSuccess) onAuthSuccess();
        setTimeout(() => {
          resetForm();
          onClose();
        }, 700);
      }
      return;
    }

    // Mode: Create Account (Sign Up)
    if (mode === 'signup') {
      if (!displayName.trim()) {
        setErrorMessage('Please enter your display name.');
        return;
      }
      const cleanUsername = username.replace(/^@/, '').trim().toLowerCase();
      if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 20) {
        setErrorMessage('Username must be between 3 and 20 characters.');
        return;
      }
      if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
        setErrorMessage('Username can only contain letters, numbers, and underscores.');
        return;
      }
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setErrorMessage('Please enter a valid email address.');
        return;
      }
      if (!password) {
        setErrorMessage('Password is required.');
        return;
      }
      if (password.length < 6) {
        setErrorMessage('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match.');
        return;
      }
      if (!agreeTerms) {
        setErrorMessage('Please agree to the Terms & Conditions to continue.');
        return;
      }

      setLoading(true);

      const available = await isUsernameAvailable(cleanUsername);
      if (!available) {
        setLoading(false);
        setErrorMessage('That username is already taken.');
        return;
      }

      const res = await registerUser({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        username: cleanUsername,
      });

      setLoading(false);

      if (!res.success) {
        setErrorMessage(res.error || 'Could not complete registration. Please try again.');
      } else {
        if (res.requiresEmailVerification) {
          setResendCooldown(60);
          setMode('verify_pending');
          setSuccessNotice(
            `Verification link sent to ${email.trim()}. Confirm your email to activate your Scout account.`
          );
        } else {
          setSuccessNotice('Account created successfully! Welcome to OUTERA.');
          if (onAuthSuccess) onAuthSuccess();
          setTimeout(() => {
            resetForm();
            onClose();
          }, 900);
        }
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full sm:max-w-md bg-[#111317] border-t sm:border border-white/[0.1] rounded-t-3xl sm:rounded-3xl p-5 sm:p-7 shadow-2xl space-y-5 max-h-[92dvh] overflow-y-auto no-scrollbar animate-in fade-in zoom-in-95 duration-200">
        {/* Header Lockup with Official Logo */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mb-2.5">
              <OuteraLogo size="sm" />
            </div>
            <h2 id="auth-modal-title" className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              {mode === 'verify_pending'
                ? 'Verify your email'
                : mode === 'forgot'
                ? 'Reset Password'
                : mode === 'magic'
                ? 'Magic Link Sign In'
                : mode === 'signin'
                ? 'Welcome back'
                : 'Join as a Scout'}
            </h2>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              {mode === 'verify_pending'
                ? 'Check your email inbox and click the confirmation link to verify your account.'
                : contextAction
                ? `Create an account or sign in to ${contextAction}.`
                : 'Create an account to save places, share experiences, and build your discovery profile.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 flex items-center justify-center text-zinc-400 hover:text-white transition-all border border-white/[0.06] shrink-0 cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Toggle (Sign Up vs Sign In) */}
        {(mode === 'signup' || mode === 'signin' || mode === 'magic') && (
          <div className="flex rounded-xl bg-white/[0.03] p-1 border border-white/[0.06]">
            <button
              type="button"
              onClick={() => handleSwitchMode('signup')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                mode === 'signup'
                  ? 'bg-[#D8FF36] text-black font-extrabold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Create Account
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode('signin')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                mode === 'signin'
                  ? 'bg-[#D8FF36] text-black font-extrabold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode('magic')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                mode === 'magic'
                  ? 'bg-[#D8FF36] text-black font-extrabold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Magic Link
            </button>
          </div>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-start gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            <p className="leading-snug">{errorMessage}</p>
          </div>
        )}

        {/* Success Notification */}
        {successNotice && (
          <div className="p-3 rounded-xl bg-[#D8FF36]/10 border border-[#D8FF36]/30 text-[#D8FF36] text-xs flex items-start gap-2 animate-in fade-in">
            <Check className="w-4 h-4 shrink-0 text-[#D8FF36] mt-0.5" />
            <p className="leading-snug">{successNotice}</p>
          </div>
        )}

        {/* Verification Pending Screen */}
        {mode === 'verify_pending' ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/15 px-2.5 py-0.5 rounded-md border border-amber-500/30">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Verification Pending</span>
                </span>
                <span className="text-[11px] text-zinc-400 font-mono truncate max-w-[180px]">
                  {email}
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                We sent a confirmation link to <span className="text-white font-semibold">{email || 'your email'}</span>. Click the link in that email to verify your address and unlock Scout reviews and place suggestions.
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                disabled={loading || resendCooldown > 0}
                onClick={handleResendVerification}
                className="w-full h-11 rounded-xl bg-[#D8FF36] hover:bg-[#e2ff5e] text-black font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>
                  {loading
                    ? 'Sending Verification Email...'
                    : resendCooldown > 0
                    ? `Resend Verification Email (${resendCooldown}s)`
                    : 'Resend Verification Email'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchMode('signin')}
                className="w-full h-10 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-bold text-white transition-all cursor-pointer"
              >
                Already verified? Sign In
              </button>
            </div>
          </div>
        ) : (
          /* Forms for Sign Up, Sign In, Magic Link, and Forgot Password */
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'signup' && (
              <>
                {/* Display Name */}
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                    Display Name
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your Name or Alias"
                      className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#D8FF36]"
                    />
                  </div>
                </div>

                {/* Username */}
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                    Username
                  </label>
                  <div className="relative">
                    <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="username"
                      className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#D8FF36]"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Email */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#D8FF36]"
                />
              </div>
            </div>

            {mode === 'magic' && (
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Prefer signing in without a password? We will email you a one-time Magic Link that signs you into OUTERA immediately.
              </p>
            )}

            {/* Password */}
            {(mode === 'signin' || mode === 'signup') && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-semibold text-zinc-400">Password</label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenForgotPasswordPage) {
                          onClose();
                          onOpenForgotPasswordPage();
                        } else {
                          handleSwitchMode('forgot');
                        }
                      }}
                      className="text-[11px] text-[#D8FF36] hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full h-10 pl-9 pr-10 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#D8FF36]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-1 cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}

            {/* Confirm Password (Registration only) */}
            {mode === 'signup' && (
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full h-10 pl-9 pr-10 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#D8FF36]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-1 cursor-pointer"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Terms & Conditions (Registration only) */}
            {mode === 'signup' && (
              <div className="pt-1">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="mt-0.5 rounded border-white/20 bg-white/5 text-[#D8FF36] focus:ring-[#D8FF36]"
                  />
                  <span className="text-[11px] text-zinc-400 leading-tight">
                    I agree to the OUTERA{' '}
                    <span className="text-zinc-300 underline underline-offset-2">Terms of Service</span>{' '}
                    and <span className="text-zinc-300 underline underline-offset-2">Community Guidelines</span>.
                  </span>
                </label>
              </div>
            )}

            {/* Submit Action */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || (mode === 'magic' && resendCooldown > 0)}
                className="w-full h-11 rounded-xl bg-[#D8FF36] hover:bg-[#e2ff5e] text-black font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50 active:scale-[0.99] shadow-lg shadow-[#D8FF36]/10 cursor-pointer"
              >
                {mode === 'magic' && <Sparkles className="w-3.5 h-3.5" />}
                <span>
                  {loading
                    ? 'Connecting...'
                    : mode === 'signup'
                    ? 'Create Account'
                    : mode === 'signin'
                    ? 'Sign In'
                    : mode === 'magic'
                    ? resendCooldown > 0
                      ? `Resend Magic Link (${resendCooldown}s)`
                      : 'Send Magic Link'
                    : 'Send Reset Link'}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        )}

        {/* Footer Mode Switch */}
        {mode === 'forgot' && (
          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => handleSwitchMode('signin')}
              className="text-xs text-zinc-400 hover:text-white cursor-pointer"
            >
              Remembered your password? <span className="text-[#D8FF36] font-bold">Sign In</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
