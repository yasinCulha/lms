import type { SurveyPace } from '../../types';

export const CLARITY_LABELS = ['Hiç anlaşılır değildi', 'Az anlaşılırdı', 'Orta', 'Anlaşılırdı', 'Çok anlaşılırdı'];
export const DIFFICULTY_LABELS = ['Çok kolay', 'Kolay', 'Orta', 'Zor', 'Çok zor'];

export const PACE_OPTIONS: { value: SurveyPace; label: string }[] = [
  { value: 'SLOW', label: 'Yavaş' },
  { value: 'JUST_RIGHT', label: 'Tam kararında' },
  { value: 'FAST', label: 'Hızlı' },
];

export const PACE_LABELS: Record<SurveyPace, string> = {
  SLOW: 'Yavaş',
  JUST_RIGHT: 'Tam kararında',
  FAST: 'Hızlı',
};
