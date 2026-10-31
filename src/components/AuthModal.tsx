import React, { useState } from 'react';
import { X, Sparkles, Check, AlertCircle, Mail, Lock, User as UserIcon, AtSign, ArrowRight } from 'lucide-react';
import {
  registerUser,
  signInUser,
  sendPasswordResetEmail,
  isUsernameAvailable,
} from '../services/supabase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup' | 'forgot';
  contextAction?: string; // e.g. "save places", "mark visits", "share experiences"
  onAuthSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'signup',
  contextAction,
  onAuthSuccess,
}) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

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

  const handleSwitchMode = (newMode: 'signin' | 'signup' | 'forgot') => {
    setMode(newMode);
    setErrorMessage(null);
    setSuccessNotice(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessNotice(null);

    // Mode: Forgot Password
    if (mode === 'forgot') {
      if (!email.trim()) {
        setErrorMessage('Please enter your email address.');
        return;
      }
      setLoading(true);
      const res = await sendPasswordResetEmail(email.trim());
      setLoading(false);
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to send reset link.');
      } else {
        setSuccessNotice('Password reset link sent to your email. Check your inbox.');
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
        setErrorMessage(res.error || 'That email or password is incorrect.');
      } else {
        setSuccessNotice('Signed in successfully!');
        if (onAuthSuccess) onAuthSuccess();
        setTimeout(() => {
          resetForm();
          onClose();
        }, 800);
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
      if (!email.trim()) {
        setErrorMessage('Please enter a valid email.');
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

      // Check username availability
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
          setSuccessNotice(
            'Account created! Please check your email inbox to verify your address before signing in.'
          );
        } else {
          setSuccessNotice('Account created successfully! Welcome to OUTERA.');
          if (onAuthSuccess) onAuthSuccess();
          setTimeout(() => {
            resetForm();
            onClose();
          }, 1000);
        }
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md bg-[#111317] border border-white/[0.1] rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Header Lockup */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-extrabold text-sm tracking-widest text-[#ccff00] font-mono">
                OUTERA
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#ccff00]" />
            </div>
            <h2 id="auth-modal-title" className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {mode === 'forgot' ? 'Reset Password' : 'Join OUTERA'}
            </h2>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              {contextAction
                ? `Create an account or sign in to ${contextAction}.`
                : 'Create an account to save places, share experiences and build your discovery profile.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 flex items-center justify-center text-zinc-400 hover:text-white transition-all border border-white/[0.06]"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Toggle (Sign In vs Create Account) */}
        {mode !== 'forgot' && (
          <div className="flex rounded-xl bg-white/[0.03] p-1 border border-white/[0.06]">
            <button
              type="button"
              onClick={() => handleSwitchMode('signup')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                mode === 'signup'
                  ? 'bg-[#ccff00] text-black font-extrabold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Create Account
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode('signin')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                mode === 'signin'
                  ? 'bg-[#ccff00] text-black font-extrabold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
          </div>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <p className="leading-snug">{errorMessage}</p>
          </div>
        )}

        {/* Success Notification */}
        {successNotice && (
          <div className="p-3 rounded-xl bg-[#ccff00]/10 border border-[#ccff00]/30 text-[#ccff00] text-xs flex items-center gap-2 animate-in fade-in">
            <Check className="w-4 h-4 shrink-0 text-[#ccff00]" />
            <p className="leading-snug">{successNotice}</p>
          </div>
        )}

        {/* Forms */}
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
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
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
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
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
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
              />
            </div>
          </div>

          {/* Password */}
          {mode !== 'forgot' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold text-zinc-400">Password</label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => handleSwitchMode('forgot')}
                    className="text-[11px] text-[#ccff00] hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
                />
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
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
                />
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
                  className="mt-0.5 rounded border-white/20 bg-white/5 text-[#ccff00] focus:ring-[#ccff00]"
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
              disabled={loading}
              className="w-full h-11 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50 active:scale-[0.99] shadow-lg shadow-[#ccff00]/10"
            >
              <span>
                {loading
                  ? 'Connecting...'
                  : mode === 'signup'
                  ? 'Create Account'
                  : mode === 'signin'
                  ? 'Sign In'
                  : 'Send Reset Link'}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Forgot Password back to sign in */}
          {mode === 'forgot' && (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => handleSwitchMode('signin')}
                className="text-xs text-zinc-400 hover:text-white underline underline-offset-2"
              >
                Back to Sign In
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
