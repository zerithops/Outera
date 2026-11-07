import type { NormalizedManeuverType, NormalizedRouteStep } from './navigationRoute';

export type VoiceLanguageMode = 'en' | 'bn' | 'both';

export interface VoiceAvailabilityState {
  speechSynthesisSupported: boolean;
  voicesLoaded: boolean;
  englishVoiceAvailable: boolean;
  bengaliVoiceAvailable: boolean;
  englishVoice: SpeechSynthesisVoice | null;
  bengaliVoice: SpeechSynthesisVoice | null;
  englishVoiceName: string | null;
  bengaliVoiceName: string | null;
}

export interface BilingualManeuverPrompt {
  maneuverType: NormalizedManeuverType;
  distanceMeters: number;
  englishText: string;
  bengaliText: string;
  announcementBucket: 'start' | '200m' | 'near' | 'now' | 'arrived';
  dedupeKey: string;
}

const BENGALI_DIGITS: Record<string, string> = {
  '0': '০',
  '1': '১',
  '2': '২',
  '3': '৩',
  '4': '৪',
  '5': '৫',
  '6': '৬',
  '7': '৭',
  '8': '৮',
  '9': '৯',
};

/**
 * Converts ASCII digits in a number or string into Bengali numerals (০-৯)
 */
export function toBengaliNumerals(input: number | string): string {
  return String(input).replace(/[0-9]/g, (digit) => BENGALI_DIGITS[digit] ?? digit);
}

/**
 * Rounds a raw meter distance to a clean human-friendly spoken value
 * (e.g., 194m -> 200m, 48m -> 50m, 83m -> 80m)
 */
export function roundDistanceForSpeech(meters: number): number {
  if (!Number.isFinite(meters) || meters <= 0) return 0;
  if (meters < 30) return Math.max(10, Math.round(meters / 5) * 5);
  if (meters < 100) return Math.round(meters / 10) * 10;
  if (meters < 500) return Math.round(meters / 50) * 50;
  return Math.round(meters / 100) * 100;
}

/**
 * Formats distance for natural English spoken instruction
 * e.g., 200 -> "200 meters", 1400 -> "1.4 kilometers"
 */
export function formatSpokenDistanceEnglish(meters: number): string {
  const rounded = roundDistanceForSpeech(meters);
  if (rounded >= 1000) {
    const km = Number((rounded / 1000).toFixed(1));
    return km === 1 ? '1 kilometer' : `${km} kilometers`;
  }
  return `${rounded} meters`;
}

/**
 * Formats distance for natural Bengali spoken instruction
 * e.g., 200 -> "২০০ মিটার", 1400 -> "১.৪ কিলোমিটার"
 */
export function formatSpokenDistanceBengali(meters: number): string {
  const rounded = roundDistanceForSpeech(meters);
  if (rounded >= 1000) {
    const km = Number((rounded / 1000).toFixed(1));
    return `${toBengaliNumerals(km)} কিলোমিটার`;
  }
  return `${toBengaliNumerals(rounded)} মিটার`;
}

/**
 * Resolves the most accurate maneuver type by inspecting both the normalized maneuverType
 * and known fixed English keywords in the step instruction if needed.
 */
export function resolveCanonicalManeuverType(
  step: Pick<NormalizedRouteStep, 'maneuverType' | 'instruction'> | null | undefined,
  hasArrived?: boolean
): NormalizedManeuverType {
  if (hasArrived) return 'arrive';
  if (!step) return 'continue-straight';

  const type = step.maneuverType;
  const text = (step.instruction || '').toLowerCase();

  if (type && type !== 'continue-straight' && type !== 'depart' && type !== 'unknown') {
    return type;
  }

  if (text.includes('u-turn') || text.includes('u turn')) return 'u-turn';
  if (text.includes('sharp left')) return 'turn-sharp-left';
  if (text.includes('sharp right')) return 'turn-sharp-right';
  if (text.includes('slight left') || text.includes('bear left')) return 'turn-slight-left';
  if (text.includes('slight right') || text.includes('bear right')) return 'turn-slight-right';
  if (text.includes('keep left')) return 'keep-left';
  if (text.includes('keep right')) return 'keep-right';
  if (text.includes('turn left') || text.includes('left onto')) return 'turn-left';
  if (text.includes('turn right') || text.includes('right onto')) return 'turn-right';
  if (text.includes('exit roundabout') || text.includes('leave roundabout')) return 'exit-roundabout';
  if (text.includes('roundabout')) return 'enter-roundabout';
  if (text.includes('arrive')) return 'arrive';

  return type || 'continue-straight';
}

interface ManeuverDictionaryEntry {
  englishWithDistance: (distEn: string) => string;
  englishImmediate: string;
  bengaliWithDistance: (distBn: string) => string;
  bengaliImmediate: string;
}

/**
 * Clean, deterministic translation dictionary for all supported navigation maneuvers.
 * Never uses unreliable automatic translation.
 */
export const MANEUVER_TRANSLATION_DICTIONARY: Record<
  NormalizedManeuverType,
  ManeuverDictionaryEntry
> = {
  'continue-straight': {
    englishWithDistance: (distEn) => `Continue straight for ${distEn}.`,
    englishImmediate: 'Continue straight.',
    bengaliWithDistance: (distBn) => `${distBn} পর্যন্ত সোজা এগিয়ে যান।`,
    bengaliImmediate: 'সোজা এগিয়ে যান।',
  },
  'turn-left': {
    englishWithDistance: (distEn) => `Turn left in ${distEn}.`,
    englishImmediate: 'Turn left now.',
    bengaliWithDistance: (distBn) => `${distBn} পর বামে মোড় নিন।`,
    bengaliImmediate: 'এখন বামে মোড় নিন।',
  },
  'turn-right': {
    englishWithDistance: (distEn) => `Turn right in ${distEn}.`,
    englishImmediate: 'Turn right now.',
    bengaliWithDistance: (distBn) => `${distBn} পর ডানে মোড় নিন।`,
    bengaliImmediate: 'এখন ডানে মোড় নিন।',
  },
  'turn-slight-left': {
    englishWithDistance: (distEn) => `Slight left in ${distEn}.`,
    englishImmediate: 'Bear slightly left now.',
    bengaliWithDistance: (distBn) => `${distBn} পর সামান্য বামে যান।`,
    bengaliImmediate: 'এখন সামান্য বামে যান।',
  },
  'turn-slight-right': {
    englishWithDistance: (distEn) => `Slight right in ${distEn}.`,
    englishImmediate: 'Bear slightly right now.',
    bengaliWithDistance: (distBn) => `${distBn} পর সামান্য ডানে যান।`,
    bengaliImmediate: 'এখন সামান্য ডানে যান।',
  },
  'turn-sharp-left': {
    englishWithDistance: (distEn) => `Sharp left in ${distEn}.`,
    englishImmediate: 'Take a sharp left now.',
    bengaliWithDistance: (distBn) => `${distBn} পর তীব্রভাবে বামে মোড় নিন।`,
    bengaliImmediate: 'এখন তীব্রভাবে বামে মোড় নিন।',
  },
  'turn-sharp-right': {
    englishWithDistance: (distEn) => `Sharp right in ${distEn}.`,
    englishImmediate: 'Take a sharp right now.',
    bengaliWithDistance: (distBn) => `${distBn} পর তীব্রভাবে ডানে মোড় নিন।`,
    bengaliImmediate: 'এখন তীব্রভাবে ডানে মোড় নিন।',
  },
  'u-turn': {
    englishWithDistance: (distEn) => `Make a U-turn in ${distEn}.`,
    englishImmediate: 'Make a U-turn now.',
    bengaliWithDistance: (distBn) => `${distBn} পর ইউ-টার্ন নিন।`,
    bengaliImmediate: 'এখন ইউ-টার্ন নিন।',
  },
  'keep-left': {
    englishWithDistance: (distEn) => `Keep left in ${distEn}.`,
    englishImmediate: 'Keep left now.',
    bengaliWithDistance: (distBn) => `${distBn} পর বাম দিকে থাকুন।`,
    bengaliImmediate: 'এখন বাম দিকে থাকুন।',
  },
  'keep-right': {
    englishWithDistance: (distEn) => `Keep right in ${distEn}.`,
    englishImmediate: 'Keep right now.',
    bengaliWithDistance: (distBn) => `${distBn} পর ডান দিকে থাকুন।`,
    bengaliImmediate: 'এখন ডান দিকে থাকুন।',
  },
  'enter-roundabout': {
    englishWithDistance: (distEn) => `Enter the roundabout in ${distEn}.`,
    englishImmediate: 'Enter the roundabout now.',
    bengaliWithDistance: (distBn) => `${distBn} পর গোলচত্বরে প্রবেশ করুন।`,
    bengaliImmediate: 'এখন গোলচত্বরে প্রবেশ করুন।',
  },
  'exit-roundabout': {
    englishWithDistance: (distEn) => `Exit the roundabout in ${distEn}.`,
    englishImmediate: 'Exit the roundabout now.',
    bengaliWithDistance: (distBn) => `${distBn} পর গোলচত্বর থেকে বের হন।`,
    bengaliImmediate: 'এখন গোলচত্বর থেকে বের হন।',
  },
  depart: {
    englishWithDistance: (distEn) => `Continue straight for ${distEn}.`,
    englishImmediate: 'Continue straight.',
    bengaliWithDistance: (distBn) => `${distBn} পর্যন্ত সোজা এগিয়ে যান।`,
    bengaliImmediate: 'সোজা এগিয়ে যান।',
  },
  arrive: {
    englishWithDistance: (distEn) => `You will arrive at your destination in ${distEn}.`,
    englishImmediate: 'Arrived at destination.',
    bengaliWithDistance: (distBn) => `${distBn} পর আপনি গন্তব্যে পৌঁছাবেন।`,
    bengaliImmediate: 'আপনি গন্তব্যে পৌঁছেছেন।',
  },
  unknown: {
    englishWithDistance: (distEn) => `Continue straight for ${distEn}.`,
    englishImmediate: 'Continue straight.',
    bengaliWithDistance: (distBn) => `${distBn} পর্যন্ত সোজা এগিয়ে যান।`,
    bengaliImmediate: 'সোজা এগিয়ে যান।',
  },
};

/**
 * Builds a bilingual (English + Bengali) instruction pair for a maneuver step and distance.
 * Also determines the distance announcement bucket and deduplication key so the same maneuver
 * is never announced repeatedly.
 */
export function buildBilingualManeuverPrompt(params: {
  step: NormalizedRouteStep | null;
  distanceMeters: number;
  hasArrived: boolean;
}): BilingualManeuverPrompt {
  const { step, distanceMeters, hasArrived } = params;
  const maneuverType = resolveCanonicalManeuverType(step, hasArrived);
  const dict =
    MANEUVER_TRANSLATION_DICTIONARY[maneuverType] ||
    MANEUVER_TRANSLATION_DICTIONARY['continue-straight'];

  if (hasArrived || maneuverType === 'arrive' && distanceMeters <= 25) {
    return {
      maneuverType: 'arrive',
      distanceMeters: 0,
      englishText: MANEUVER_TRANSLATION_DICTIONARY.arrive.englishImmediate,
      bengaliText: MANEUVER_TRANSLATION_DICTIONARY.arrive.bengaliImmediate,
      announcementBucket: 'arrived',
      dedupeKey: 'nav-arrived-destination',
    };
  }

  const stepIndex = step?.index ?? 0;

  // Bucket 1: Immediate turn ("now" <= 25m)
  if (distanceMeters <= 25) {
    return {
      maneuverType,
      distanceMeters,
      englishText: dict.englishImmediate,
      bengaliText: dict.bengaliImmediate,
      announcementBucket: 'now',
      dedupeKey: `step-${stepIndex}-${maneuverType}-now`,
    };
  }

  // Bucket 2: Final approach (26m - 80m, e.g. "in 50 meters")
  if (distanceMeters <= 80) {
    const distEn = formatSpokenDistanceEnglish(distanceMeters);
    const distBn = formatSpokenDistanceBengali(distanceMeters);
    return {
      maneuverType,
      distanceMeters,
      englishText: dict.englishWithDistance(distEn),
      bengaliText: dict.bengaliWithDistance(distBn),
      announcementBucket: 'near',
      dedupeKey: `step-${stepIndex}-${maneuverType}-near`,
    };
  }

  // Bucket 3: Standard 200m approach (81m - 240m, e.g. "Turn left in 200 meters." / "২০০ মিটার পর বামে মোড় নিন।")
  if (distanceMeters <= 240) {
    const effectiveMeters = distanceMeters >= 165 && distanceMeters <= 235 ? 200 : distanceMeters;
    const distEn = formatSpokenDistanceEnglish(effectiveMeters);
    const distBn = formatSpokenDistanceBengali(effectiveMeters);
    return {
      maneuverType,
      distanceMeters,
      englishText: dict.englishWithDistance(distEn),
      bengaliText: dict.bengaliWithDistance(distBn),
      announcementBucket: '200m',
      dedupeKey: `step-${stepIndex}-${maneuverType}-200m`,
    };
  }

  // Bucket 4: Initial step entry (> 240m)
  const distEn = formatSpokenDistanceEnglish(distanceMeters);
  const distBn = formatSpokenDistanceBengali(distanceMeters);
  return {
    maneuverType,
    distanceMeters,
    englishText: dict.englishWithDistance(distEn),
    bengaliText: dict.bengaliWithDistance(distBn),
    announcementBucket: 'start',
    dedupeKey: `step-${stepIndex}-${maneuverType}-start`,
  };
}

/**
 * Inspects `window.speechSynthesis.getVoices()` to detect installed English and Bengali voices separately.
 * Never claims Bengali is supported if no `bn` (`bn-BD`, `bn-IN`, etc.) voice exists on the device.
 */
export function detectAvailableNavigationVoices(): VoiceAvailabilityState {
  if (
    typeof window === 'undefined' ||
    typeof window.speechSynthesis === 'undefined' ||
    typeof window.speechSynthesis.getVoices !== 'function'
  ) {
    return {
      speechSynthesisSupported: false,
      voicesLoaded: false,
      englishVoiceAvailable: false,
      bengaliVoiceAvailable: false,
      englishVoice: null,
      bengaliVoice: null,
      englishVoiceName: null,
      bengaliVoiceName: null,
    };
  }

  const voices = window.speechSynthesis.getVoices() || [];

  // 1. Detect Bengali voices (`bn-BD`, `bn-IN`, `bn`, or voice name containing Bengali/Bangla/বাংলা)
  const bengaliCandidates = voices.filter((v) => {
    const lang = (v.lang || '').toLowerCase().replace('_', '-');
    const name = (v.name || '').toLowerCase();
    return (
      lang === 'bn' ||
      lang.startsWith('bn-') ||
      name.includes('bengali') ||
      name.includes('bangla') ||
      name.includes('বাংলা')
    );
  });

  // Prefer bn-BD first, then bn-IN, then any bn voice
  const preferredBengaliVoice =
    bengaliCandidates.find((v) => (v.lang || '').toLowerCase().replace('_', '-').startsWith('bn-bd')) ||
    bengaliCandidates.find((v) => (v.lang || '').toLowerCase().replace('_', '-').startsWith('bn-in')) ||
    bengaliCandidates[0] ||
    null;

  // 2. Detect English voices (`en-US`, `en-GB`, `en-IN`, `en`, etc.)
  const englishCandidates = voices.filter((v) => {
    const lang = (v.lang || '').toLowerCase().replace('_', '-');
    return lang === 'en' || lang.startsWith('en-');
  });

  const preferredEnglishVoice =
    englishCandidates.find((v) => v.default) ||
    englishCandidates.find((v) => (v.lang || '').toLowerCase().replace('_', '-').startsWith('en-us')) ||
    englishCandidates.find((v) => (v.lang || '').toLowerCase().replace('_', '-').startsWith('en-gb')) ||
    englishCandidates.find((v) => (v.lang || '').toLowerCase().replace('_', '-').startsWith('en-in')) ||
    englishCandidates[0] ||
    null;

  return {
    speechSynthesisSupported: true,
    voicesLoaded: voices.length > 0,
    englishVoiceAvailable: Boolean(preferredEnglishVoice),
    bengaliVoiceAvailable: Boolean(preferredBengaliVoice),
    englishVoice: preferredEnglishVoice,
    bengaliVoice: preferredBengaliVoice,
    englishVoiceName: preferredEnglishVoice ? `${preferredEnglishVoice.name} (${preferredEnglishVoice.lang})` : null,
    bengaliVoiceName: preferredBengaliVoice ? `${preferredBengaliVoice.name} (${preferredBengaliVoice.lang})` : null,
  };
}

/**
 * Speaks a navigation prompt using `window.speechSynthesis` according to the user's selected
 * language mode (`en`, `bn`, or `both`) and detected installed voices.
 *
 * - Uses an available English voice for English instructions.
 * - Uses an available Bengali voice for Bengali instructions.
 * - If `bn` or `both` is selected but no Bengali voice is installed on the device,
 *   honestly falls back to speaking the English instruction with the English voice
 *   (and returns `{ usedBengaliFallback: true }` so the UI can inform the user).
 */
export function speakNavigationPrompt(params: {
  prompt: BilingualManeuverPrompt;
  languageMode: VoiceLanguageMode;
  voices: VoiceAvailabilityState;
  isMuted: boolean;
}): { spoken: boolean; usedBengaliFallback: boolean } {
  const { prompt, languageMode, voices, isMuted } = params;

  if (isMuted || !voices.speechSynthesisSupported || typeof window === 'undefined') {
    return { spoken: false, usedBengaliFallback: false };
  }

  const synth = window.speechSynthesis;
  try {
    synth.cancel();
  } catch {
    // ignore
  }

  const createEnglishUtterance = (): SpeechSynthesisUtterance | null => {
    if (!voices.englishVoiceAvailable && !voices.voicesLoaded) {
      // Allow browser default English utterance if voices list is still initializing
      const u = new SpeechSynthesisUtterance(prompt.englishText);
      u.lang = 'en-US';
      u.rate = 1.0;
      return u;
    }
    if (!voices.englishVoice) return null;
    const u = new SpeechSynthesisUtterance(prompt.englishText);
    u.voice = voices.englishVoice;
    u.lang = voices.englishVoice.lang || 'en-US';
    u.rate = 1.0;
    return u;
  };

  const createBengaliUtterance = (): SpeechSynthesisUtterance | null => {
    if (!voices.bengaliVoiceAvailable || !voices.bengaliVoice) {
      return null;
    }
    const u = new SpeechSynthesisUtterance(prompt.bengaliText);
    u.voice = voices.bengaliVoice;
    u.lang = voices.bengaliVoice.lang || 'bn-BD';
    u.rate = 0.96;
    return u;
  };

  try {
    if (languageMode === 'en') {
      const enUtterance = createEnglishUtterance();
      if (enUtterance) {
        synth.speak(enUtterance);
        return { spoken: true, usedBengaliFallback: false };
      }
      return { spoken: false, usedBengaliFallback: false };
    }

    if (languageMode === 'bn') {
      const bnUtterance = createBengaliUtterance();
      if (bnUtterance) {
        synth.speak(bnUtterance);
        return { spoken: true, usedBengaliFallback: false };
      }
      // Fallback: Bengali voice is not installed on this device; use English voice if available
      const fallbackEn = createEnglishUtterance();
      if (fallbackEn) {
        synth.speak(fallbackEn);
        return { spoken: true, usedBengaliFallback: true };
      }
      return { spoken: false, usedBengaliFallback: true };
    }

    // languageMode === 'both' (Bilingual: English followed by Bengali)
    const enUtterance = createEnglishUtterance();
    const bnUtterance = createBengaliUtterance();

    if (enUtterance && bnUtterance) {
      synth.speak(enUtterance);
      synth.speak(bnUtterance);
      return { spoken: true, usedBengaliFallback: false };
    }

    if (enUtterance && !bnUtterance) {
      synth.speak(enUtterance);
      return { spoken: true, usedBengaliFallback: true };
    }

    if (!enUtterance && bnUtterance) {
      synth.speak(bnUtterance);
      return { spoken: true, usedBengaliFallback: false };
    }
  } catch {
    // Ignore browser speech synthesis error
  }

  return { spoken: false, usedBengaliFallback: !voices.bengaliVoiceAvailable };
}

/**
 * Builds a bilingual announcement when automatic rerouting calculates a new route.
 */
export function buildReroutedManeuverPrompt(params: {
  firstStep: NormalizedRouteStep | null;
  distanceToFirstTurnMeters: number;
  rerouteCount: number;
}): BilingualManeuverPrompt {
  const basePrompt = buildBilingualManeuverPrompt({
    step: params.firstStep,
    distanceMeters: params.distanceToFirstTurnMeters,
    hasArrived: false,
  });

  return {
    ...basePrompt,
    englishText: `Route recalculated. ${basePrompt.englishText}`,
    bengaliText: `নতুন রুট নির্ধারণ করা হয়েছে। ${basePrompt.bengaliText}`,
    dedupeKey: `reroute-${params.rerouteCount}-${basePrompt.dedupeKey}`,
  };
}

