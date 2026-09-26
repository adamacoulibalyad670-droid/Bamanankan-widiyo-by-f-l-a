/**
 * Comprehensive Bambara (Bamanankan) Linguistic & Number Normalizer Engine
 * Converts numbers, dates, times, percentages, and special characters into clean,
 * noise-free, natural written Bambara text before passing to the TTS Speech Generator.
 */

// Basic single digits 0-10
const BAMBARA_DIGITS: { [key: number]: string } = {
  0: 'fu',
  1: 'kelen',
  2: 'fila', // or fla
  3: 'saba',
  4: 'naani',
  5: 'duuru',
  6: 'wɔɔrɔ',
  7: 'wolonwula', // or wolonwufla
  8: 'seegin', // or lajɛ
  9: 'kɔnɔntɔn',
  10: 'tan',
};

// Tens (20, 30, 40 ... 90)
const BAMBARA_TENS: { [key: number]: string } = {
  20: 'mugan',
  30: 'bisaba',
  40: 'binaani',
  50: 'biduuru',
  60: 'biwɔɔrɔ',
  70: 'biwolonwula',
  80: 'biseegin',
  90: 'bikɔnɔntɔn',
};

/**
 * Convert a positive integer (0 to 999,999,999,999) to full Bambara words
 */
export function numberToBambara(n: number): string {
  if (isNaN(n)) return '';
  n = Math.abs(Math.floor(n));

  if (n <= 10) {
    return BAMBARA_DIGITS[n];
  }

  // 11 to 19
  if (n > 10 && n < 20) {
    const remainder = n - 10;
    return `tan ni ${BAMBARA_DIGITS[remainder]}`;
  }

  // 20 to 99
  if (n >= 20 && n < 100) {
    const tens = Math.floor(n / 10) * 10;
    const remainder = n % 10;
    const tensWord = BAMBARA_TENS[tens] || `${BAMBARA_DIGITS[Math.floor(n / 10)]}bi`;
    if (remainder === 0) return tensWord;
    return `${tensWord} ni ${BAMBARA_DIGITS[remainder]}`;
  }

  // 100 to 999 (kɛmɛ)
  if (n >= 100 && n < 1000) {
    const hundreds = Math.floor(n / 100);
    const remainder = n % 100;
    let base = hundreds === 1 ? 'kɛmɛ' : `kɛmɛ ${BAMBARA_DIGITS[hundreds]}`;
    if (remainder === 0) return base;
    return `${base} ni ${numberToBambara(remainder)}`;
  }

  // 1,000 to 999,999 (bakelen / wagakelen / bakɛmɛ)
  if (n >= 1000 && n < 1000000) {
    const thousands = Math.floor(n / 1000);
    const remainder = n % 1000;
    let base = thousands === 1 ? 'bakelen' : `ba${numberToBambara(thousands)}`;
    if (remainder === 0) return base;
    return `${base} ani ${numberToBambara(remainder)}`;
  }

  // 1,000,000 to 999,999,999 (miliyɔn kelen)
  if (n >= 1000000 && n < 1000000000) {
    const millions = Math.floor(n / 1000000);
    const remainder = n % 1000000;
    let base = millions === 1 ? 'miliyɔn kelen' : `miliyɔn ${numberToBambara(millions)}`;
    if (remainder === 0) return base;
    return `${base} ani ${numberToBambara(remainder)}`;
  }

  // 1,000,000,000+ (miliyari kelen)
  if (n >= 1000000000 && n < 1000000000000) {
    const billions = Math.floor(n / 1000000000);
    const remainder = n % 1000000000;
    let base = billions === 1 ? 'miliyari kelen' : `miliyari ${numberToBambara(billions)}`;
    if (remainder === 0) return base;
    return `${base} ani ${numberToBambara(remainder)}`;
  }

  return `tiriliyɔni kelen`;
}

/**
 * Format clock time expressions to spoken Bambara
 * e.g. "10:30:01" -> "nɛgɛ kanɲɛ tan tɛmɛnen ye ni sanga bisaba ye ani segɔni kelen"
 * e.g. "18:00" -> "nɛgɛ kanɲɛ tan ni seegin"
 */
export function timeToBambara(timeStr: string): string {
  // Matches hh:mm:ss or hh:mm or hh"h"mm:ss
  const parts = timeStr.replace('h', ':').split(':').map((p) => parseInt(p.trim(), 10));
  if (parts.some((p) => isNaN(p))) return timeStr;

  const hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  const seconds = parts[2] || 0;

  const hoursBambara = numberToBambara(hours);
  let result = `nɛgɛ kanɲɛ ${hoursBambara}`;

  if (minutes > 0) {
    result += ` tɛmɛnen ye ni sanga ${numberToBambara(minutes)} ye`;
  }
  if (seconds > 0) {
    result += ` ani segɔni ${numberToBambara(seconds)}`;
  }

  return result;
}

/**
 * Main Text Normalizer for Bambara TTS
 * Replaces numbers, percentages, times, and phonetic spellings with clean Bambara prose.
 */
export function normalizeBambaraText(text: string): string {
  if (!text) return '';

  let normalized = text;

  // 1. Normalize Time signatures (e.g. 10:30:01, 18h02:01, 18:00)
  normalized = normalized.replace(/\b(\d{1,2})[:h](\d{2})(?::(\d{2}))?\b/gi, (match) => {
    return timeToBambara(match);
  });

  // 2. Normalize Percentages (e.g., 1001%, 1,1%, 1%, 5,5%)
  normalized = normalized.replace(/(\d+)(?:[,.](\d+))?\s*%/g, (match, whole, frac) => {
    const wVal = parseInt(whole, 10);
    const wText = numberToBambara(wVal);
    if (!frac || parseInt(frac, 10) === 0) {
      return `kɛmɛsarada la ${wText}`;
    }
    const fText = numberToBambara(parseInt(frac, 10));
    return `kɛmɛsarada la ${wText} n'a kunkanfɛn ${fText}`;
  });

  // 3. Normalize Decimals (e.g. 1,1 or 5.5)
  normalized = normalized.replace(/\b(\d+)[,. ](\d+)\b/g, (match, whole, frac) => {
    // If it looks like a large formatted number (e.g. 100.000 or 40.000)
    if (frac === '000') {
      const thousands = parseInt(whole, 10);
      return `ba${numberToBambara(thousands)}`;
    }
    const wVal = parseInt(whole, 10);
    const fVal = parseInt(frac, 10);
    if (!isNaN(wVal) && !isNaN(fVal) && fVal < 1000) {
      return `${numberToBambara(wVal)} n'a kunkanfɛn ${numberToBambara(fVal)}`;
    }
    return match;
  });

  // 4. Normalize standalone numbers (digits 0-999999999)
  normalized = normalized.replace(/\b\d+\b/g, (match) => {
    const num = parseInt(match, 10);
    if (!isNaN(num)) {
      return numberToBambara(num);
    }
    return match;
  });

  // 5. Clean up extra spaces and phonetic fixes (wolonwula, cogoya, cogo)
  normalized = normalized
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}

/**
 * Linguistic Review & Grammar Inspector for Bamanankan (Bambara)
 * Validates orthography, particle spacing, grammatical markers (bɛ, tɛ, ye, ma, tun, ka),
 * automatically normalizes numbers/dates/percentages into spoken Bambara words,
 * and aligns specialized Bambara terminology before rendering to the user.
 */
export function reviewBambaraGrammar(text: string, tone: 'formal' | 'colloquial' | 'standard' = 'standard'): string {
  if (!text || typeof text !== 'string') return '';

  let reviewed = text.trim();

  // If text is predominantly non-Latin (e.g. pure Arabic script), return as is without Bambara morphing
  const arabicChars = (reviewed.match(/[\u0600-\u06FF]/g) || []).length;
  if (arabicChars > reviewed.length * 0.4) {
    return reviewed;
  }

  // 1. Automatic Numbers & Expressions Normalization (e.g., 2026, 50%, 10:30, 15)
  reviewed = normalizeBambaraText(reviewed);

  // 2. Fix particle spacing and common grammatical markers (without destructive letter replacement)
  reviewed = reviewed
    .replace(/\bbe\b/g, 'bɛ')
    .replace(/\bte\b/g, 'tɛ')
    .replace(/\bkonɔ\b/gi, 'kɔnɔ')
    .replace(/\bkono\b/gi, 'kɔnɔ')
    .replace(/\bfo\b/gi, 'fɔ')
    .replace(/\s+/g, ' ');

  // 3. Bambara Specialized Terminology Standardizer
  for (const [key, val] of Object.entries(BAMBARA_STANDARD_TERMS)) {
    const reg = new RegExp(`\\b${key}\\b`, 'gi');
    reviewed = reviewed.replace(reg, val);
  }

  // 4. Tone / Dialect polish
  if (tone === 'formal') {
    reviewed = reviewed
      .replace(/Bamanankan Kuma/g, 'Bamanankan Sɛbɛn')
      .replace(/Tekinoloji/g, 'Dɔnniya kura');
    if (!reviewed.endsWith('.') && !reviewed.endsWith('!') && !reviewed.endsWith('?')) {
      reviewed += '.';
    }
  } else if (tone === 'colloquial') {
    reviewed = reviewed
      .replace(/Bamanankan Sɛbɛn/g, 'Bamanankan Kuma')
      .replace(/Dɔnniya kura/g, 'Tekinoloji');
  }

  // 5. Clean punctuation spacing
  reviewed = reviewed.replace(/\s+([.,!?:;])/g, '$1').trim();

  // 6. Capitalize first letter of sentence
  if (reviewed.length > 0) {
    reviewed = reviewed.charAt(0).toUpperCase() + reviewed.slice(1);
  }

  return reviewed;
}

/**
 * Standard Bambara Terminology & Dialect Lexicon
 */
export const BAMBARA_STANDARD_TERMS: Record<string, string> = {
  'bambara': 'Bamanankan',
  'bambara kan': 'Bamanankan',
  'bambara-kan': 'Bamanankan',
  'mali': 'Mali',
  'bamako': 'Bamako',
  'technologie': 'Dɔnniya kura',
  'technology': 'Dɔnniya kura',
  'tekinoloji': 'Dɔnniya kura',
  'video': 'Ja tɛmɛnen',
  'audio': 'Kan minɛnen',
  'intelligence artificielle': 'Hakili dilannen',
  'artificial intelligence': 'Hakili dilannen',
  'ai': 'Hakili kura',
  'ordinateur': 'Kɔnpitɛri',
  'computer': 'Kɔnpitɛri',
  'internet': 'Jɛgɛn',
  'education': 'Kalanko',
  'science': 'Dɔnniya',
  'sante': 'Kɛnɛya',
  'santé': 'Kɛnɛya',
  'health': 'Kɛnɛya',
  'merci': 'I ni ce',
  'thanks': 'I ni ce',
  'thank you': 'I ni ce',
  'bonjour': 'I ni sɔgɔma',
};

export interface LinguisticIssue {
  type: 'number' | 'time' | 'percent' | 'term' | 'particle';
  originalMatch: string;
  suggestedBambara: string;
  explanation: string;
  index: number;
}

/**
 * Scans a text snippet for numbers, time formats, percentages, and non-standard terms,
 * returning structured items that can be corrected immediately.
 */
export function detectSegmentLinguisticIssues(text: string): LinguisticIssue[] {
  if (!text || typeof text !== 'string') return [];
  const issues: LinguisticIssue[] = [];
  const seenMatches = new Set<string>();

  // 1. Detect Time signatures (e.g. 10:30, 18:00, 12h30)
  const timeRegex = /\b(\d{1,2})[:h](\d{2})(?::(\d{2}))?\b/gi;
  let match: RegExpExecArray | null;
  while ((match = timeRegex.exec(text)) !== null) {
    const raw = match[0];
    if (!seenMatches.has(raw)) {
      seenMatches.add(raw);
      issues.push({
        type: 'time',
        originalMatch: raw,
        suggestedBambara: timeToBambara(raw),
        explanation: 'صيغة توقيت رقمية بحاجة لنطق بامباري منطوق',
        index: match.index,
      });
    }
  }

  // 2. Detect Percentages (e.g. 50%, 100%)
  const percentRegex = /(\d+)(?:[,.](\d+))?\s*%/g;
  while ((match = percentRegex.exec(text)) !== null) {
    const raw = match[0];
    if (!seenMatches.has(raw)) {
      seenMatches.add(raw);
      const whole = parseInt(match[1], 10);
      const frac = match[2] ? parseInt(match[2], 10) : 0;
      const wText = numberToBambara(whole);
      const suggestion = frac > 0
        ? `kɛmɛsarada la ${wText} n'a kunkanfɛn ${numberToBambara(frac)}`
        : `kɛmɛsarada la ${wText}`;
      issues.push({
        type: 'percent',
        originalMatch: raw,
        suggestedBambara: suggestion,
        explanation: 'نسبة مئوية رقمية (kɛmɛsarada)',
        index: match.index,
      });
    }
  }

  // 3. Detect Raw Digits / Numbers
  const numberRegex = /\b\d+\b/g;
  while ((match = numberRegex.exec(text)) !== null) {
    const raw = match[0];
    if (!seenMatches.has(raw)) {
      seenMatches.add(raw);
      const val = parseInt(raw, 10);
      if (!isNaN(val)) {
        issues.push({
          type: 'number',
          originalMatch: raw,
          suggestedBambara: numberToBambara(val),
          explanation: `رقم حسابي بحاجة للفظ البامباري (${numberToBambara(val)})`,
          index: match.index,
        });
      }
    }
  }

  // 4. Detect Non-Standard Terminology & Loanwords
  for (const [term, standard] of Object.entries(BAMBARA_STANDARD_TERMS)) {
    const termRegex = new RegExp(`\\b${term}\\b`, 'gi');
    while ((match = termRegex.exec(text)) !== null) {
      const raw = match[0];
      // Only flag if it doesn't already match standard casing or word
      if (raw !== standard && !seenMatches.has(raw.toLowerCase())) {
        seenMatches.add(raw.toLowerCase());
        issues.push({
          type: 'term',
          originalMatch: raw,
          suggestedBambara: standard,
          explanation: `مصطلح دخيل بحاجة للمعادل البامباري المعياري (${standard})`,
          index: match.index,
        });
      }
    }
  }

  // 5. Detect Non-Standard Particles (be -> bɛ, te -> tɛ, kono -> kɔnɔ)
  const particleMap: Record<string, string> = {
    'be': 'bɛ',
    'te': 'tɛ',
    'kono': 'kɔnɔ',
    'konɔ': 'kɔnɔ',
  };
  for (const [part, standard] of Object.entries(particleMap)) {
    const pRegex = new RegExp(`\\b${part}\\b`, 'gi');
    while ((match = pRegex.exec(text)) !== null) {
      const raw = match[0];
      if (raw.toLowerCase() !== standard && !seenMatches.has(raw.toLowerCase())) {
        seenMatches.add(raw.toLowerCase());
        issues.push({
          type: 'particle',
          originalMatch: raw,
          suggestedBambara: standard,
          explanation: `علامة نحوية بامبارية بحاجة لضبط الرسم الصوتي (${standard})`,
          index: match.index,
        });
      }
    }
  }

  return issues;
}


