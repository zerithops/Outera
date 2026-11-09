import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
  Smartphone,
  Info,
} from 'lucide-react';
import {
  isEmailVerified,
  resendVerificationEmail,
  changeUserEmail,
  changeUserPassword,
  signOut,
  getCurrentUser,
} from '../services/supabase';

interface AccountSecuritySectionProps {
  user: any;
  onUserUpdated: (updatedUser: any) => void;
  onSignedOut: () => void;
}

export const AccountSecuritySection: React.FC<AccountSecuritySectionProps> = ({
  user,
  onUserUpdated,
  onSignedOut,
}) => {
  const verified = isEmailVerified(user);
  const currentEmail: string = user?.email || '';
  const pendingNewEmail: string | undefined = user?.new_email;

  // Resend Verification state
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationCooldown, setVerificationCooldown] = useState(0);
  const [verificationNotice, setVerificationNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Change Email state
  const [newEmail, setNewEmail] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [localPendingEmail, setLocalPendingEmail] = useState<string | null>(
    pendingNewEmail || null
  );

  // Change Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Device Sign out state
  const [signingOutScope, setSigningOutScope] = useState<'local' | 'global' | null>(null);

  useEffect(() => {
    if (pendingNewEmail) {
      setLocalPendingEmail(pendingNewEmail);
    }
  }, [pendingNewEmail]);

  useEffect(() => {
    if (verificationCooldown <= 0) return;
    const t = setInterval(() => {
      setVerificationCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [verificationCooldown]);

  const handleResendVerification = async () => {
    if (!currentEmail || verificationCooldown > 0) return;
    setVerificationNotice(null);
    setResendingVerification(true);
    const res = await resendVerificationEmail(currentEmail);
    setResendingVerification(false);

    if (res.success) {
      setVerificationCooldown(60);
      setVerificationNotice({
        type: 'success',
        text: `Verification link sent to ${currentEmail}. Please check your inbox and spam folder.`,
      });
    } else {
      setVerificationNotice({
        type: 'error',
        text: res.error || 'Could not resend verification email right now.',
      });
    }
  };

  const handleRefreshVerificationStatus = async () => {
    const freshUser = await getCurrentUser();
    if (freshUser) {
      onUserUpdated(freshUser);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailStatus(null);

    const clean = newEmail.trim().toLowerCase();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setEmailStatus({ type: 'error', text: 'Please enter a valid new email address.' });
      return;
    }
    if (clean === currentEmail.toLowerCase()) {
      setEmailStatus({
        type: 'error',
        text: 'New email must be different from your current email address.',
      });
      return;
    }

    setChangingEmail(true);
    const res = await changeUserEmail(clean);
    setChangingEmail(false);

    if (!res.success) {
      setEmailStatus({
        type: 'error',
        text: res.error || 'Could not initiate email change.',
      });
      return;
    }

    setLocalPendingEmail(res.pendingEmail || clean);
    setNewEmail('');
    setEmailStatus({
      type: 'success',
      text: `Confirmation sent to ${clean} (and your current email if Dual Confirmation is enabled). Your email will update as soon as you click the confirmation link.`,
    });

    const refreshed = await getCurrentUser();
    if (refreshed) onUserUpdated(refreshed);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus(null);

    if (!currentPassword) {
      setPasswordStatus({ type: 'error', text: 'Please enter your current password.' });
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setPasswordStatus({
        type: 'error',
        text: 'New password must be at least 6 characters long.',
      });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordStatus({
        type: 'error',
        text: 'New password and confirmation do not match.',
      });
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordStatus({
        type: 'error',
        text: 'New password must be different from your current password.',
      });
      return;
    }

    setChangingPassword(true);
    const res = await changeUserPassword(currentPassword, newPassword);
    setChangingPassword(false);

    if (!res.success) {
      setPasswordStatus({
        type: 'error',
        text: res.error || 'Could not update password.',
      });
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordStatus({
      type: 'success',
      text: 'Your password has been updated securely.',
    });
  };

  const handleSignOutScope = async (scope: 'local' | 'global') => {
    setSigningOutScope(scope);
    await signOut(scope);
    setSigningOutScope(null);
    onSignedOut();
  };

  return (
    <div className="space-y-5">
      {/* 1. Account Verification Status Card */}
      <div className="p-5 rounded-2xl bg-[#111317] border border-white/[0.08] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white tracking-tight">
                Email & Verification Status
              </h3>
              {verified ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Verified</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  <ShieldAlert className="w-3 h-3" />
                  <span>Unverified</span>
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-300 font-mono break-all">{currentEmail}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!verified && (
              <button
                type="button"
                disabled={resendingVerification || verificationCooldown > 0}
                onClick={handleResendVerification}
                className="h-9 px-3.5 rounded-xl bg-[#D8FF36] hover:bg-[#e2ff5e] text-black font-extrabold text-xs transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                {resendingVerification
                  ? 'Sending...'
                  : verificationCooldown > 0
                  ? `Resend (${verificationCooldown}s)`
                  : 'Resend Verification'}
              </button>
            )}
            <button
              type="button"
              onClick={handleRefreshVerificationStatus}
              className="h-9 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-zinc-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
              title="Refresh verification status"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {!verified && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200 leading-relaxed">
            Your email address has not been verified yet. Verify your email to unlock full Scout privileges including publishing community reviews and suggesting new places.
          </div>
        )}

        {verificationNotice && (
          <div
            className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
              verificationNotice.type === 'success'
                ? 'bg-[#D8FF36]/10 border border-[#D8FF36]/30 text-[#D8FF36]'
                : 'bg-red-500/10 border border-red-500/25 text-red-300'
            }`}
          >
            {verificationNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{verificationNotice.text}</span>
          </div>
        )}
      </div>

      {/* 2. Change Email Section */}
      <div className="p-5 rounded-2xl bg-[#111317] border border-white/[0.08] space-y-4">
        <div>
          <h3 className="text-sm font-bold text-white tracking-tight">Change Email Address</h3>
          <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
            For account protection, a verification link is sent to confirm your new email address before the change takes effect.
          </p>
        </div>

        {localPendingEmail && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold text-amber-300">Pending Email Change Verification</p>
              <p className="leading-relaxed">
                Awaiting confirmation for{' '}
                <span className="font-mono font-semibold text-white">{localPendingEmail}</span>. Check both your new and current email inboxes to complete the switch.
              </p>
            </div>
          </div>
        )}

        {emailStatus && (
          <div
            className={`p-3.5 rounded-xl text-xs flex items-start gap-2 ${
              emailStatus.type === 'success'
                ? 'bg-[#D8FF36]/10 border border-[#D8FF36]/30 text-[#D8FF36]'
                : 'bg-red-500/10 border border-red-500/25 text-red-300'
            }`}
          >
            {emailStatus.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span className="leading-relaxed">{emailStatus.text}</span>
          </div>
        )}

        <form onSubmit={handleChangeEmail} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                Current Email
              </label>
              <input
                type="email"
                disabled
                value={currentEmail}
                className="w-full h-10 px-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs text-zinc-400 font-mono cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                New Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="new-email@example.com"
                  className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#D8FF36]"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={changingEmail}
              className="h-10 px-4 rounded-xl bg-[#D8FF36] hover:bg-[#e2ff5e] text-black font-extrabold text-xs uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
            >
              {changingEmail ? 'Sending Confirmation...' : 'Update Email'}
            </button>
          </div>
        </form>
      </div>

      {/* 3. Change Password Section */}
      <div className="p-5 rounded-2xl bg-[#111317] border border-white/[0.08] space-y-4">
        <div>
          <h3 className="text-sm font-bold text-white tracking-tight">Change Password</h3>
          <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
            Enter your current password to verify your identity before setting a new password.
          </p>
        </div>

        {passwordStatus && (
          <div
            className={`p-3.5 rounded-xl text-xs flex items-start gap-2 ${
              passwordStatus.type === 'success'
                ? 'bg-[#D8FF36]/10 border border-[#D8FF36]/30 text-[#D8FF36]'
                : 'bg-red-500/10 border border-red-500/25 text-red-300'
            }`}
          >
            {passwordStatus.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span className="leading-relaxed">{passwordStatus.text}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
              Current Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full h-10 pl-9 pr-10 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#D8FF36]"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-1 cursor-pointer"
                aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}
              >
                {showCurrentPassword ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full h-10 pl-9 pr-10 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#D8FF36]"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-1 cursor-pointer"
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                >
                  {showNewPassword ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full h-10 pl-9 pr-10 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#D8FF36]"
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
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={changingPassword}
              className="h-10 px-4 rounded-xl bg-[#D8FF36] hover:bg-[#e2ff5e] text-black font-extrabold text-xs uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
            >
              {changingPassword ? 'Updating Password...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>

      {/* 4. Active Sessions & Sign Out Controls */}
      <div className="p-5 rounded-2xl bg-[#111317] border border-white/[0.08] space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Session Management & Security Notices
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
              Sign out from this browser or revoke all active sessions across every device where your OUTERA account is signed in.
            </p>
          </div>
          <Smartphone className="w-5 h-5 text-[#D8FF36] shrink-0" />
        </div>

        <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs text-zinc-300 space-y-1">
          <p className="font-semibold text-white">Security Notification Policy</p>
          <p className="text-zinc-400 leading-relaxed">
            Whenever your password or email address is modified, a confirmation or security notice is dispatched to your registered email address. Never share magic links or recovery URLs with anyone.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
          <button
            type="button"
            disabled={signingOutScope !== null}
            onClick={() => handleSignOutScope('local')}
            className="h-10 px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.09] text-xs font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 text-zinc-300" />
            <span>
              {signingOutScope === 'local' ? 'Signing out...' : 'Sign Out (This Device)'}
            </span>
          </button>

          <button
            type="button"
            disabled={signingOutScope !== null}
            onClick={() => handleSignOutScope('global')}
            className="h-10 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-bold text-red-300 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 text-red-400" />
            <span>
              {signingOutScope === 'global'
                ? 'Revoking all sessions...'
                : 'Sign Out From All Devices'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
