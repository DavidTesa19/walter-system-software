// Approximate matching for Jarvis's search: typos, names a speech transcript
// got slightly wrong, Czech case endings and codes said without their leading
// zeros. Text here is already normalizeText()-ed (no diacritics, lower case).
//
// Exact matches always win; this only runs when they come up short, and its
// results go back to the model marked as approximate.

// Spellings that sound alike, folded together: Nowak = Novák, Komány = Komani,
// Philip = Filip, Schmidtt = Schmidt.
export const phoneticKey = (word) =>
  word
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/ck/g, 'k')
    .replace(/w/g, 'v')
    .replace(/y/g, 'i')
    .replace(/x/g, 'ks')
    .replace(/q/g, 'kv')
    .replace(/(.)\1+/g, '$1');

// Czech noun and adjective case endings, without diacritics, longest first.
const CASE_ENDINGS = [
  'ovou', 'ovi', 'ova', 'ove', 'ovy', 'emu', 'ymu', 'imu', 'eho', 'iho', 'ych', 'ich', 'ymi', 'imi', 'ach', 'ech', 'ami',
  'em', 'ou', 'um', 'ym', 'im', 'a', 'u', 'e', 'y', 'i',
];

// How many typos a word of this length may carry and still count.
const allowedEdits = (length) => (length <= 3 ? 0 : length <= 5 ? 1 : length <= 9 ? 2 : 3);

// Edit distance with adjacent swaps (Damerau, optimal string alignment),
// giving up as soon as it must exceed `max`.
export function boundedDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous2 = null;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (previous2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, previous2[j - 2] + 1);
      }
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    previous2 = previous;
    previous = current;
  }
  return previous[b.length];
}

// "k12" and "k12-3" are what people say for K012 and K012-003.
export function codeVariants(token) {
  const match = /^([a-z]{1,3})-?(\d{1,3})(?:-(\d{1,3}))?$/.exec(token);
  if (!match) return [];
  const [, letters, subject, commission] = match;
  const padded = `${letters}${subject.padStart(3, '0')}${commission ? `-${commission.padStart(3, '0')}` : ''}`;
  return padded === token ? [] : [padded];
}

// The distinct words of a record's search text, as phonetic keys.
export function recordWords(text) {
  return [...new Set(text.split(/[^a-z0-9]+/).filter((word) => word.length >= 2).map(phoneticKey))];
}

// How well one query token matches a record: 1 for an exact hit, less for an
// approximate one, 0 for none. `match` names the word it was taken for.
export function matchToken(token, text, words) {
  if (text.includes(token)) return { score: 1 };
  for (const variant of codeVariants(token)) {
    if (text.includes(variant)) return { score: 1, match: variant };
  }
  // Numbers, phone numbers and codes only ever match exactly.
  if (/\d/.test(token)) return { score: 0 };

  let best = { score: 0 };
  const consider = (score, match) => {
    if (score > best.score) best = { score, match };
  };

  // Czech case endings: Dvořákovi, Nováka, Nowakovi → Dvořák, Novák. Only real
  // endings come off ("nowak" must not become "nowa" and match every Nová).
  // A stem that is a whole word beats one that only starts a longer word.
  if (token.length >= 5) {
    for (const ending of CASE_ENDINGS) {
      if (!token.endsWith(ending)) continue;
      const stem = token.slice(0, -ending.length);
      if (stem.length < 4) continue;
      const stemKey = phoneticKey(stem);
      if (words.includes(stemKey)) consider(0.88, stemKey);
      else if (text.includes(stem) || words.some((word) => word.startsWith(stemKey))) consider(0.65, `${stemKey}…`);
    }
  }

  const key = phoneticKey(token);
  const max = allowedEdits(key.length);
  for (const word of words) {
    if (word === key) {
      consider(0.95, word);
      continue;
    }
    if (word.includes(key) && key.length >= 4) {
      consider(0.9, word);
      continue;
    }
    if (max === 0) continue;
    const distance = boundedDistance(key, word, max);
    if (distance <= max) {
      consider(0.85 - distance * 0.1, word);
      continue;
    }
    // A misspelt start of a longer word ("dvorakv" for dvorakova).
    if (word.length > key.length) {
      const prefixDistance = boundedDistance(key, word.slice(0, key.length), max);
      if (prefixDistance <= max) consider(0.75 - prefixDistance * 0.1, word);
    }
  }
  return best;
}

// Every token must match a record at least approximately. Returns the
// record's score (higher is closer) and what each token was taken for, or
// null when some token matches nothing.
export function matchRecord(tokens, text, words) {
  let score = 0;
  const matched = [];
  for (const token of tokens) {
    const result = matchToken(token, text, words);
    if (result.score === 0) return null;
    score += result.score;
    if (result.match && result.match !== token) matched.push(`${token} ≈ ${result.match}`);
  }
  return { score, matched };
}
