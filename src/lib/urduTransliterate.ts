/**
 * Real-time Roman Urdu to Urdu Script (اردو رسم الخط / نستعلیق) transliteration utility for PATAH.
 */

// Dictionary of common Roman Urdu direction phrases, landmarks, and general terms
const COMMON_PHRASES: Record<string, string> = {
  'kuchh meetha': 'کچھ میٹھا',
  'kuch meetha': 'کچھ میٹھا',
  'neela gate': 'نیلا گیٹ',
  'blue gate': 'نیلا گیٹ',
  'peela gate': 'پیلا گیٹ',
  'yellow gate': 'پیلا گیٹ',
  'kala gate': 'کالا گیٹ',
  'black gate': 'کالا گیٹ',
  'safaid gate': 'سفید گیٹ',
  'white gate': 'سفید گیٹ',
  'sabz gate': 'سبز گیٹ',
  'green gate': 'سبز گیٹ',
  'masjid ke peechay': 'مسجد کے پیچھے',
  'masjid k peeche': 'مسجد کے پیچھے',
  'masjid ke samnay': 'مسجد کے سامنے',
  'masjid k samne': 'مسجد کے سامنے',
  'masjid ke sath': 'مسجد کے ساتھ',
  'masjid k sath': 'مسجد کے ساتھ',
  'doosra ghar': 'دوسرا گھر',
  'dusra ghar': 'دوسرا گھر',
  'second house': 'دوسرا گھر',
  'teesra ghar': 'تیسرا گھر',
  'third house': 'تیسرا گھر',
  'pehla ghar': 'پہلا گھر',
  'first house': 'پہلا گھر',
  'aakhri ghar': 'آخری گھر',
  'corner wala ghar': 'کارنر والا گھر',
  'gali number': 'گلی نمبر',
  'street number': 'گلی نمبر',
  'makan number': 'مکان نمبر',
  'house number': 'مکان نمبر',
  'flat number': 'فلیٹ نمبر',
  'floor number': 'منزل نمبر',
  'pehli manzil': 'پہلی منزل',
  'doosri manzil': 'دوسری منزل',
  'teesri manzil': 'تیسری منزل',
  'ground floor': 'گراؤنڈ فلور',
  'daayein hath': 'دائیں ہاتھ',
  'dayen hath': 'دائیں ہاتھ',
  'baayein hath': 'بائیں ہاتھ',
  'bayen hath': 'بائیں ہاتھ',
  'seedha aana': 'سیدھا آنا',
  'seedha chalay': 'سیدھا چلیں',
  'seedha aana hai': 'سیدھا آنا ہے',
  'chowk ke paas': 'چوک کے پاس',
  'chowk pe': 'چوک پر',
  'dukan ke sath': 'دکان کے ساتھ',
  'bakery ke samnay': 'بیکری کے سامنے',
  'school ke peechay': 'اسکول کے پیچھے',
  'hospital ke kareeb': 'ہسپتال کے قریب',
  'park ke samnay': 'پارک کے سامنے',
  'bell bajana': 'گھنٹی بجانا',
  'ghanti bajayein': 'گھنٹی بجائیں',
  'call karna': 'کال کرنا',
  'call karein': 'کال کریں',
  'salam bhai': 'سلام بھائی',
  'assalam o alaikum': 'السلام علیکم',
  'shukriya': 'شکریہ',
};

// Single-word dictionary
const WORD_DICT: Record<string, string> = {
  'kuchh': 'کچھ',
  'kuch': 'کچھ',
  'meetha': 'میٹھا',
  'mitha': 'میٹھا',
  'neela': 'نیلا',
  'peela': 'پیلا',
  'kala': 'کالا',
  'safaid': 'سفید',
  'sabz': 'سبز',
  'laal': 'لال',
  'gate': 'گیٹ',
  'darwaza': 'دروازہ',
  'masjid': 'مسجد',
  'mosque': 'مسجد',
  'peechay': 'پیچھے',
  'peeche': 'پیچھے',
  'samnay': 'سامنے',
  'samne': 'سامنے',
  'sath': 'ساتھ',
  'saath': 'ساتھ',
  'kareeb': 'قریب',
  'paas': 'پاس',
  'ghar': 'گھر',
  'makan': 'مکان',
  'makaan': 'مکان',
  'flat': 'فلیٹ',
  'apartment': 'اپارٹمنٹ',
  'floor': 'فلور',
  'manzil': 'منزل',
  'gali': 'گلی',
  'street': 'اسٹریٹ',
  'road': 'روڈ',
  'chowk': 'چوک',
  'kona': 'کونا',
  'corner': 'کارنر',
  'daayein': 'دائیں',
  'dayen': 'دائیں',
  'right': 'دائیں',
  'baayein': 'بائیں',
  'bayen': 'بائیں',
  'left': 'بائیں',
  'seedha': 'سیدھا',
  'straight': 'سیدھا',
  'turn': 'موڑ',
  'mor': 'موڑ',
  'dukan': 'دکان',
  'shop': 'دکان',
  'bazaar': 'بازار',
  'darakht': 'درخت',
  'tree': 'درخت',
  'bell': 'گھنٹی',
  'ghanti': 'گھنٹی',
  'seedhiyan': 'سیڑھیاں',
  'stairs': 'سیڑھیاں',
  'park': 'پارک',
  'school': 'اسکول',
  'hospital': 'ہسپتال',
  'bakery': 'بیکری',
  'colony': 'کالونی',
  'sector': 'سیکٹر',
  'phase': 'فیز',
  'block': 'بلاک',
  'chak': 'چک',
  'number': 'نمبر',
  'doosra': 'دوسرا',
  'dusra': 'دوسرا',
  'teesra': 'تیسرا',
  'pehla': 'پہلا',
  'aakhri': 'آخری',
  'wala': 'والا',
  'wali': 'والی',
  'wale': 'والے',
  'ke': 'کے',
  'k': 'کے',
  'ki': 'کی',
  'ka': 'کا',
  'ko': 'کو',
  'mein': 'میں',
  'me': 'میں',
  'par': 'پر',
  'pe': 'پر',
  'se': 'سے',
  'hai': 'ہے',
  'hain': 'ہیں',
  'aur': 'اور',
  'bhi': 'بھی',
  'nahi': 'نہیں',
  'ye': 'یہ',
  'woh': 'وہ',
  'mera': 'میرا',
  'meri': 'میری',
  'apna': 'اپنا',
  'apni': 'اپنی',
  'shukriya': 'شکریہ',
  'salam': 'سلام',
  'bhai': 'بھائی',
  'aana': 'آنا',
  'jana': 'جانا',
  'kar': 'کر',
  'karna': 'کرنا',
  'hath': 'ہاتھ',
  'haath': 'ہاتھ',
  'naam': 'نام',
  'pata': 'پتہ',
  'phone': 'فون',
  'call': 'کال',
  'order': 'آرڈر',
  'parcel': 'پارسل',
  'rider': 'رائیڈر',
};

// Multi-character phonetic transliteration clusters
const PHONETIC_CLUSTERS: [RegExp, string][] = [
  [/kh/gi, 'کھ'],
  [/gh/gi, 'غ'],
  [/ch/gi, 'چ'],
  [/jh/gi, 'جھ'],
  [/th/gi, 'تھ'],
  [/dh/gi, 'دھ'],
  [/ph/gi, 'پھ'],
  [/bh/gi, 'بھ'],
  [/sh/gi, 'ش'],
  [/zh/gi, 'ژ'],
  [/aa/gi, 'آ'],
  [/ee/gi, 'ی'],
  [/oo/gi, 'و'],
  [/ai/gi, 'ئے'],
];

// Single letter phonetic fallback
const PHONETIC_CHARS: Record<string, string> = {
  a: 'ا',
  b: 'ب',
  p: 'پ',
  t: 'ت',
  s: 'س',
  j: 'ج',
  c: 'ک',
  h: 'ہ',
  d: 'د',
  r: 'ر',
  z: 'ز',
  x: 'کس',
  f: 'ف',
  q: 'ق',
  k: 'ک',
  g: 'گ',
  l: 'ل',
  m: 'م',
  n: 'ن',
  w: 'و',
  v: 'و',
  y: 'ی',
  u: 'و',
  i: 'ی',
  o: 'و',
  e: 'ے',
};

/**
 * Transliterates Roman Urdu text into authentic Urdu script (نستعلیق / عربی رسم الخط).
 * Handles whole phrases, individual words, numbers, and phonetic fallbacks.
 */
export function romanUrduToUrduScript(romanText: string): string {
  if (!romanText || typeof romanText !== 'string') return '';
  const trimmed = romanText.trim();
  if (!trimmed) return '';

  // If text already contains Urdu/Arabic characters, preserve it
  if (/[\u0600-\u06FF]/.test(trimmed)) {
    return trimmed;
  }

  let lower = trimmed.toLowerCase();

  // 1. Check known phrases
  for (const [phrase, urdu] of Object.entries(COMMON_PHRASES)) {
    const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
    lower = lower.replace(regex, urdu);
  }

  // 2. Tokenize words, punctuation, and numbers
  const tokens = lower.split(/(\s+|[.,!?;:()"-]+|\d+)/);

  const resultTokens = tokens.map((token) => {
    // Preserve whitespace and punctuation
    if (!token || /^\s+$/.test(token) || /^[.,!?;:()"-]+$/.test(token)) {
      return token;
    }

    // Preserve numbers (convert to Urdu digits if desired, or keep as digits)
    if (/^\d+$/.test(token)) {
      return token;
    }

    // Already Urdu
    if (/[\u0600-\u06FF]/.test(token)) {
      return token;
    }

    const clean = token.toLowerCase();

    // Direct dictionary lookup
    if (WORD_DICT[clean]) {
      return WORD_DICT[clean];
    }

    // Phonetic cluster fallback
    let converted = clean;
    for (const [clusterRegex, urduCluster] of PHONETIC_CLUSTERS) {
      converted = converted.replace(clusterRegex, urduCluster);
    }

    // Single character conversion for remaining letters
    let finalWord = '';
    for (const char of converted) {
      if (/[\u0600-\u06FF]/.test(char)) {
        finalWord += char;
      } else if (PHONETIC_CHARS[char]) {
        finalWord += PHONETIC_CHARS[char];
      } else {
        finalWord += char;
      }
    }

    return finalWord;
  });

  return resultTokens.join('');
}
