/** Ders sonu anketi için saf yardımcılar. */
import { MAX_COMMENT_LENGTH, maskName } from './comments.js';
import { roundAverage } from './feedback.js';

export const PACE_VALUES = ['SLOW', 'JUST_RIGHT', 'FAST'] as const;
export type Pace = (typeof PACE_VALUES)[number];

export type SurveyInput =
  | { skipped: true }
  | { skipped: false; clarity: number; difficulty: number; pace: Pace; note: string | null };

const isScore = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;

export function parseSurveyBody(body: unknown): { ok: true; input: SurveyInput } | { ok: false; message: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, message: 'Geçersiz istek gövdesi.' };
  }
  const raw = body as Record<string, unknown>;
  if (raw.skipped === true) return { ok: true, input: { skipped: true } };

  if (!isScore(raw.clarity)) return { ok: false, message: 'clarity 1 ile 5 arasında bir tam sayı olmalıdır.' };
  if (!isScore(raw.difficulty)) return { ok: false, message: 'difficulty 1 ile 5 arasında bir tam sayı olmalıdır.' };
  if (typeof raw.pace !== 'string' || !(PACE_VALUES as readonly string[]).includes(raw.pace)) {
    return { ok: false, message: 'pace SLOW, JUST_RIGHT veya FAST olmalıdır.' };
  }
  let note: string | null = null;
  if (raw.note !== undefined && raw.note !== null) {
    if (typeof raw.note !== 'string') return { ok: false, message: 'note bir metin olmalıdır.' };
    const trimmed = raw.note.trim();
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      return { ok: false, message: `Not en fazla ${MAX_COMMENT_LENGTH} karakter olabilir.` };
    }
    note = trimmed || null;
  }
  return {
    ok: true,
    input: { skipped: false, clarity: raw.clarity, difficulty: raw.difficulty, pace: raw.pace as Pace, note },
  };
}

export interface SurveyRow {
  id: string;
  createdAt: Date;
  clarity: number | null;
  difficulty: number | null;
  pace: string | null;
  note: string | null;
  user: { name: string };
  lesson: { id: string; title: string; module: { course: { id: string; title: string } } };
  reads: { id: string }[];
}

export function toInstructorSurvey(row: SurveyRow) {
  return {
    id: row.id,
    createdAt: row.createdAt,
    author: { displayName: maskName(row.user.name) },
    course: row.lesson.module.course,
    lesson: { id: row.lesson.id, title: row.lesson.title },
    clarity: row.clarity,
    difficulty: row.difficulty,
    pace: row.pace,
    note: row.note,
    read: row.reads.length > 0,
  };
}

export function summarizeSurveys(rows: Pick<SurveyRow, 'clarity' | 'difficulty' | 'pace'>[]) {
  const pace: Record<Pace, number> = { SLOW: 0, JUST_RIGHT: 0, FAST: 0 };
  let clarity = 0;
  let difficulty = 0;
  for (const row of rows) {
    clarity += row.clarity ?? 0;
    difficulty += row.difficulty ?? 0;
    if (row.pace && row.pace in pace) pace[row.pace as Pace] += 1;
  }
  return {
    count: rows.length,
    clarityAverage: roundAverage(clarity, rows.length),
    difficultyAverage: roundAverage(difficulty, rows.length),
    pace,
  };
}
