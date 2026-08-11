/**
 * Mastermind solving assistant.
 *
 * This isn't a puzzle the app poses and checks — it's a helper for playing
 * the real (or another) game as the codebreaker. You build each guess with
 * the peg colours you actually played, mark the feedback you actually got,
 * and the app narrows down which codes still fit and suggests what to try
 * next.
 *
 * A code is always CODE_LENGTH pegs. Feedback is the classic two counts —
 * `exact` (right colour, right position) and `colorOnly` (right colour,
 * wrong position) — never which positions, since the real game doesn't
 * reveal that either.
 *
 * Even at the largest setting (10 colours) there are only 10⁴ = 10,000
 * possible codes, so brute-force search runs comfortably on the main thread.
 */

export const CODE_LENGTH = 4;
export const MIN_COLORS = 2;
export const MAX_COLORS = 10;
export const MAX_ATTEMPTS = 12;

export const EMPTY_PEG = -1;

export const FB_NONE = 0;
export const FB_EXACT = 1;
export const FB_COLOR_ONLY = 2;

export type CodeArr = number[];

export interface Feedback {
  exact: number;
  colorOnly: number;
}

export interface Attempt {
  guess: CodeArr;
  feedbackPegs: number[];
}

export const COLOR_PALETTE = [
  { name: "Red", hex: "#ef4444" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Green", hex: "#22c55e" },
  { name: "Yellow", hex: "#eab308" },
  { name: "Orange", hex: "#f97316" },
  { name: "Purple", hex: "#a855f7" },
  { name: "Cyan", hex: "#06b6d4" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Brown", hex: "#92400e" },
  { name: "Gray", hex: "#6b7280" },
] as const;

export function emptyAttempt(): Attempt {
  return { guess: new Array(CODE_LENGTH).fill(EMPTY_PEG), feedbackPegs: new Array(CODE_LENGTH).fill(FB_NONE) };
}

export function cycleFeedbackPeg(v: number): number {
  return (v + 1) % 3;
}

export function feedbackFromPegs(pegs: readonly number[]): Feedback {
  let exact = 0;
  let colorOnly = 0;
  for (const p of pegs) {
    if (p === FB_EXACT) exact++;
    else if (p === FB_COLOR_ONLY) colorOnly++;
  }
  return { exact, colorOnly };
}

export function scoreGuess(guess: CodeArr, secret: CodeArr): Feedback {
  let exact = 0;
  const guessLeft: number[] = [];
  const secretLeft: number[] = [];
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === secret[i]) exact++;
    else {
      guessLeft.push(guess[i]);
      secretLeft.push(secret[i]);
    }
  }
  const remaining = new Map<number, number>();
  for (const v of secretLeft) remaining.set(v, (remaining.get(v) ?? 0) + 1);
  let colorOnly = 0;
  for (const v of guessLeft) {
    const left = remaining.get(v) ?? 0;
    if (left > 0) {
      colorOnly++;
      remaining.set(v, left - 1);
    }
  }
  return { exact, colorOnly };
}

function feedbackKey(f: Feedback): number {
  return f.exact * (CODE_LENGTH + 1) + f.colorOnly;
}

function feedbackEqual(a: Feedback, b: Feedback): boolean {
  return a.exact === b.exact && a.colorOnly === b.colorOnly;
}

export function allCodes(numColors: number): CodeArr[] {
  const total = numColors ** CODE_LENGTH;
  const codes: CodeArr[] = new Array(total);
  for (let i = 0; i < total; i++) {
    const code: CodeArr = new Array(CODE_LENGTH);
    let n = i;
    for (let p = 0; p < CODE_LENGTH; p++) {
      code[p] = n % numColors;
      n = Math.floor(n / numColors);
    }
    codes[i] = code;
  }
  return codes;
}

/** A colour-agnostic opener: two of one colour, two of another (Knuth's
 * classic pattern) — or one colour repeated when there's only one to pick. */
export function openingGuess(numColors: number): CodeArr {
  const second = numColors > 1 ? 1 : 0;
  return [0, 0, second, second];
}

export function filterCandidates(
  candidates: readonly CodeArr[],
  guess: CodeArr,
  feedback: Feedback,
): CodeArr[] {
  return candidates.filter((code) => feedbackEqual(scoreGuess(guess, code), feedback));
}

/** Caps how many guesses the minimax search tries when the remaining pool is
 * large, so it never takes more than a beat even at 10 colours. */
const MAX_GUESS_POOL = 1500;

/**
 * Picks the next guess to try: the one that, across every feedback it could
 * possibly get, leaves the smallest largest remaining group (Knuth's minimax
 * strategy) — ties broken in favour of guesses that are themselves still
 * possible answers, so a lucky guess can win outright instead of only
 * eliminating options.
 */
export function pickNextGuess(candidates: readonly CodeArr[]): CodeArr | null {
  if (candidates.length === 0) return null;
  if (candidates.length <= 2) return candidates[0];

  const candidateSet = new Set(candidates.map((c) => c.join(",")));
  let pool: readonly CodeArr[] = candidates;
  if (pool.length > MAX_GUESS_POOL) {
    const step = pool.length / MAX_GUESS_POOL;
    const sampled: CodeArr[] = [];
    for (let i = 0; i < MAX_GUESS_POOL; i++) sampled.push(pool[Math.floor(i * step)]);
    pool = sampled;
  }

  let best: CodeArr | null = null;
  let bestWorst = Infinity;
  let bestIsCandidate = false;

  for (const guess of pool) {
    const buckets = new Map<number, number>();
    for (const code of candidates) {
      const key = feedbackKey(scoreGuess(guess, code));
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    let worst = 0;
    for (const count of buckets.values()) worst = Math.max(worst, count);
    const isCandidate = candidateSet.has(guess.join(","));

    if (worst < bestWorst || (worst === bestWorst && isCandidate && !bestIsCandidate)) {
      best = guess;
      bestWorst = worst;
      bestIsCandidate = isCandidate;
    }
  }
  return best;
}
