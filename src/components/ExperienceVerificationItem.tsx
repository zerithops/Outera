import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  AlertTriangle,
  Flag,
  ThumbsUp,
  HelpCircle,
  ShieldAlert,
} from 'lucide-react';
import {
  DifferenceReason,
  ExperienceReport,
  VerificationResponseOption,
} from '../types/outera';
import {
  getUserVerificationForReport,
  submitModerationReport,
  submitVerificationAction,
} from '../services/storage';

interface ExperienceVerificationItemProps {
  report: ExperienceReport;
  placeId: string;
  isUserVerifiedVisitor: boolean;
  onVerificationUpdated: () => void;
}

export const ExperienceVerificationItem: React.FC<ExperienceVerificationItemProps> = ({
  report,
  placeId,
  isUserVerifiedVisitor,
  onVerificationUpdated,
}) => {
  const existingVote = getUserVerificationForReport(report.id);
  const [selectedResponse, setSelectedResponse] = useState<VerificationResponseOption | null>(
    existingVote?.response || null
  );
  const [showDifferenceOptions, setShowDifferenceOptions] = useState(false);
  const [selectedDifference, setSelectedDifference] = useState<DifferenceReason | null>(
    existingVote?.differenceReason || null
  );
  const [hasVoted, setHasVoted] = useState(Boolean(existingVote));
  const [voteFeedback, setVoteFeedback] = useState<string | null>(null);

  // Moderation modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState<
    'Wrong information' | 'Spam' | 'Abusive content' | 'Duplicate' | 'Potentially misleading'
  >('Wrong information');
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const verification = report.verification;
  const total = verification.totalResponses || 1;
  const mostlyPct = Math.round((verification.mostlyCount / total) * 100);
  const partlyPct = Math.round((verification.partlyCount / total) * 100);
  const notReallyPct = Math.max(0, 100 - mostlyPct - partlyPct);

  const differenceReasons: DifferenceReason[] = [
    'Price',
    'Quality',
    'Crowd',
    'Location',
    'Opening hours',
    'Service',
    'Overall experience',
    'Other',
  ];

  const handleResponseClick = (choice: VerificationResponseOption) => {
    setSelectedResponse(choice);
    if (choice === 'Mostly') {
      submitVerificationAction(report.id, placeId, 'Mostly');
      setHasVoted(true);
      setShowDifferenceOptions(false);
      setVoteFeedback('Your confirmation was recorded with verified weight.');
      onVerificationUpdated();
      setTimeout(() => setVoteFeedback(null), 3000);
    } else {
      setShowDifferenceOptions(true);
    }
  };

  const handleSelectDifference = (reason: DifferenceReason) => {
    if (!selectedResponse) return;
    setSelectedDifference(reason);
    submitVerificationAction(report.id, placeId, selectedResponse, reason);
    setHasVoted(true);
    setShowDifferenceOptions(false);
    setVoteFeedback('Thank you. Constructive observations keep OUTERA reliable.');
    onVerificationUpdated();
    setTimeout(() => setVoteFeedback(null), 3000);
  };

  const handleSubmitModeration = (e: React.FormEvent) => {
    e.preventDefault();
    submitModerationReport({
      targetId: report.id,
      targetType: 'experience',
      reason: reportReason,
    });
    setReportSubmitted(true);
    setTimeout(() => {
      setReportSubmitted(false);
      setShowReportModal(false);
    }, 1500);
  };

  return (
    <div className="p-4 rounded-xl bg-white/[0.025] border border-white/[0.06] space-y-3 transition-colors hover:border-white/[0.1]">
      {/* Author and Experience Metadata */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-white">{report.authorName}</span>
            {report.authorHandle && (
              <span className="text-[11px] text-zinc-500">{report.authorHandle}</span>
            )}
            {report.isVerifiedVisitor && (
              <span className="text-[10px] font-bold text-[#ccff00] bg-[#ccff00]/10 px-2 py-0.5 rounded-full border border-[#ccff00]/30 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 stroke-[2.5]" />
                <span>Visited</span>
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Vibe: <strong className="text-zinc-200">{report.vibe}</strong> · Crowd:{' '}
            <strong className="text-zinc-200">{report.crowd}</strong>
            {report.approxSpendTaka && (
              <> · Spent: <strong className="text-[#ccff00]">~৳{report.approxSpendTaka}</strong></>
            )}
          </p>
        </div>

        {/* Moderation button */}
        <button
          type="button"
          onClick={() => setShowReportModal(true)}
          className="text-zinc-500 hover:text-zinc-300 p-1 rounded transition-colors"
          title="Report inaccurate content"
          aria-label="Report experience"
        >
          <Flag className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Actual Experience Observation */}
      {report.comment && (
        <p className="text-xs text-zinc-200 leading-relaxed font-normal">
          “{report.comment}”
        </p>
      )}

      {/* Community Verification Bar */}
      <div className="p-3 rounded-xl bg-black/40 border border-white/[0.05] space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-bold text-zinc-300 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-[#ccff00]" />
            <span>Community Verification</span>
          </span>

          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              verification.confidence === 'High'
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : verification.confidence === 'Mixed'
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                : 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30'
            }`}
          >
            {verification.confidence} Confidence
          </span>
        </div>

        {/* Visual Multi-Segment Verification Ratio Bar */}
        <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden flex">
          <div
            style={{ width: `${mostlyPct}%` }}
            className="bg-[#ccff00] h-full transition-all"
            title={`${mostlyPct}% Mostly matches`}
          />
          <div
            style={{ width: `${partlyPct}%` }}
            className="bg-amber-400 h-full transition-all"
            title={`${partlyPct}% Partly matches`}
          />
          <div
            style={{ width: `${notReallyPct}%` }}
            className="bg-zinc-600 h-full transition-all"
            title={`${notReallyPct}% Doesn't match`}
          />
        </div>

        {/* Agreement textual breakdown */}
        <div className="flex items-center justify-between text-[11px] text-zinc-400 font-medium">
          <span>
            <strong className="text-[#ccff00]">{mostlyPct}%</strong> Mostly matches
          </span>
          <span>
            <strong className="text-amber-300">{partlyPct}%</strong> Partly matches
          </span>
          <span>
            <strong className="text-zinc-300">{notReallyPct}%</strong> Doesn't match
          </span>
        </div>

        {/* Top differences cited if any */}
        {verification.commonDifferences.length > 0 && (
          <div className="text-[10px] text-zinc-400 pt-1 border-t border-white/[0.04] flex items-center gap-1.5 flex-wrap">
            <span className="text-zinc-500">Noticed differences:</span>
            {verification.commonDifferences.slice(0, 3).map((d) => (
              <span
                key={d.reason}
                className="px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-300 border border-white/[0.05]"
              >
                {d.reason} ({d.count})
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Verification Prompt: "Did your experience match this?" */}
      <div className="pt-1">
        {voteFeedback ? (
          <p className="text-xs text-[#ccff00] font-semibold py-1">{voteFeedback}</p>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-zinc-300">
              Did your experience match this?{' '}
              {isUserVerifiedVisitor && (
                <span className="text-[#ccff00] font-normal">(Your visit counts 2x)</span>
              )}
            </p>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleResponseClick('Mostly')}
                className={`h-8 px-2 rounded-lg text-xs font-semibold border transition-all ${
                  selectedResponse === 'Mostly'
                    ? 'bg-[#ccff00] text-black border-[#ccff00] font-bold'
                    : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
                }`}
              >
                Mostly
              </button>

              <button
                type="button"
                onClick={() => handleResponseClick('Partly')}
                className={`h-8 px-2 rounded-lg text-xs font-semibold border transition-all ${
                  selectedResponse === 'Partly'
                    ? 'bg-amber-400 text-black border-amber-400 font-bold'
                    : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
                }`}
              >
                Partly
              </button>

              <button
                type="button"
                onClick={() => handleResponseClick('Not really')}
                className={`h-8 px-2 rounded-lg text-xs font-semibold border transition-all ${
                  selectedResponse === 'Not really'
                    ? 'bg-zinc-300 text-black border-zinc-300 font-bold'
                    : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
                }`}
              >
                Not really
              </button>
            </div>

            {/* Prompt for "What was different?" */}
            {showDifferenceOptions && (
              <div className="p-3 rounded-xl bg-[#14171d] border border-amber-400/30 space-y-2 animate-in fade-in duration-150">
                <p className="text-[11px] font-bold text-amber-300">
                  What was different about your experience?
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {differenceReasons.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => handleSelectDifference(reason)}
                      className={`p-2 rounded-lg text-left text-xs border transition-all ${
                        selectedDifference === reason
                          ? 'bg-[#ccff00] text-black font-bold border-[#ccff00]'
                          : 'bg-white/[0.03] text-zinc-300 border-white/[0.06] hover:bg-white/[0.08]'
                      }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Moderation Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#121418] border border-white/[0.1] rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
              <h4 className="text-sm font-bold text-white">Report Experience</h4>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {reportSubmitted ? (
              <p className="text-xs text-[#ccff00] font-semibold text-center py-4">
                Thank you. Moderation team will review this notice.
              </p>
            ) : (
              <form onSubmit={handleSubmitModeration} className="space-y-3">
                <p className="text-xs text-zinc-300">Why are you reporting this contribution?</p>
                <div className="space-y-1.5">
                  {(
                    [
                      'Wrong information',
                      'Spam',
                      'Abusive content',
                      'Duplicate',
                      'Potentially misleading',
                    ] as const
                  ).map((r) => (
                    <label
                      key={r}
                      className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02] border border-white/[0.06] text-xs text-zinc-300 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="reason"
                        checked={reportReason === r}
                        onChange={() => setReportReason(r)}
                        className="text-[#ccff00]"
                      />
                      <span>{r}</span>
                    </label>
                  ))}
                </div>

                <button
                  type="submit"
                  className="w-full h-10 rounded-xl bg-white/[0.1] hover:bg-white/[0.15] text-xs font-bold text-white transition-colors"
                >
                  Submit Report
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
