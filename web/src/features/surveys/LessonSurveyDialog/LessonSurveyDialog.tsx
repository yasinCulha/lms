import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Dialog, Text, formStyles } from '../../../components';
import { apiFetch, ApiError } from '../../../lib/apiClient';
import type { LessonSurveyAnswer, LessonSurveyStateResponse, SurveyPace } from '../../../types';
import { CLARITY_LABELS, DIFFICULTY_LABELS, PACE_OPTIONS } from '../surveyLabels';
import styles from './LessonSurveyDialog.module.css';

const SCORES = [1, 2, 3, 4, 5];
const MAX_NOTE = 1000;

interface LessonSurveyDialogProps {
  lessonId: string;
  onClose: () => void;
}

/**
 * Öğrenci tamamladığı bir dersten ayrılınca açılır. Anket zaten yanıtlandıysa/atlandıysa ya da
 * ders tamamlanmadıysa hiçbir şey göstermeden kapanır. Esc/arka plan ile kapatmak kayıt bırakmaz.
 */
export function LessonSurveyDialog({ lessonId, onClose }: LessonSurveyDialogProps) {
  const [lessonTitle, setLessonTitle] = useState<string | null>(null);
  const [clarity, setClarity] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [pace, setPace] = useState<SurveyPace | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteId = useId();

  useEffect(() => {
    let cancelled = false;
    apiFetch<LessonSurveyStateResponse>(`/api/v1/lessons/${lessonId}/survey`)
      .then((res) => {
        if (cancelled) return;
        if (res.survey.status === 'PENDING' && res.survey.lessonCompleted) setLessonTitle(res.lesson.title);
        else onClose();
      })
      .catch(() => {
        if (!cancelled) onClose();
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId, onClose]);

  if (!lessonTitle) return null;

  const send = async (body: LessonSurveyAnswer | { skipped: true }) => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/lessons/${lessonId}/survey`, { method: 'POST', body: JSON.stringify(body) });
      if ('skipped' in body) onClose();
      else setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SURVEY_ALREADY_SUBMITTED') {
        onClose();
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Yanıtın gönderilemedi. Lütfen tekrar dene.');
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (clarity === null || difficulty === null || pace === null) return;
    const trimmed = note.trim();
    send({ clarity, difficulty, pace, ...(trimmed ? { note: trimmed } : {}) });
  };

  if (done) {
    return (
      <Dialog title="Teşekkürler!" size="sm" onClose={onClose}>
        <Text role="body-md" as="p" className={styles.intro}>
          Geri bildirimin dersin eğitmenine iletildi. Dersleri geliştirmemize yardımcı olduğun için teşekkür ederiz.
        </Text>
        <div className={styles.actions}>
          <Button variant="primary" onClick={onClose}>
            Kapat
          </Button>
        </div>
      </Dialog>
    );
  }

  const complete = clarity !== null && difficulty !== null && pace !== null;

  return (
    <Dialog title="Ders nasıl geçti?" size="md" busy={busy} onClose={onClose}>
      <form className={styles.form} onSubmit={submit}>
        <Text role="body-md" tone="muted" as="p" className={styles.intro}>
          <strong>{lessonTitle}</strong> dersini tamamladın. Birkaç saniyeni ayırırsan yanıtların yalnızca dersin
          eğitmenine iletilir; adın sansürlenerek gösterilir.
        </Text>

        <ScaleQuestion
          legend="Konu ne kadar anlaşılırdı?"
          labels={CLARITY_LABELS}
          value={clarity}
          onChange={setClarity}
          disabled={busy}
        />
        <ScaleQuestion
          legend="Ders senin için ne kadar zordu?"
          labels={DIFFICULTY_LABELS}
          value={difficulty}
          onChange={setDifficulty}
          disabled={busy}
        />

        <fieldset className={styles.question} disabled={busy}>
          <legend>
            <Text role="label-lg" as="span" tone="main">
              Anlatım temposu nasıldı?
            </Text>
          </legend>
          <div className={styles.options}>
            {PACE_OPTIONS.map((option) => (
              <label key={option.value} className={`${styles.option} ${pace === option.value ? styles.optionOn : ''}`}>
                <input
                  type="radio"
                  name="pace"
                  value={option.value}
                  checked={pace === option.value}
                  onChange={() => setPace(option.value)}
                  className={styles.radio}
                />
                <Text role="label-lg" as="span">
                  {option.label}
                </Text>
              </label>
            ))}
          </div>
        </fieldset>

        <div className={styles.question}>
          <label htmlFor={noteId}>
            <Text role="label-lg" as="span" tone="main">
              Eğitmenine iletmek istediğin bir not var mı? <Text role="label-md" as="span" tone="muted">(isteğe bağlı)</Text>
            </Text>
          </label>
          <textarea
            id={noteId}
            className={formStyles.textarea}
            rows={3}
            maxLength={MAX_NOTE}
            value={note}
            disabled={busy}
            placeholder="Ör. Örnekler çok iyiydi, ama ikinci kısım biraz hızlı geçti…"
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        {error && (
          <div role="alert">
            <Text role="body-sm" tone="error" as="p">
              {error}
            </Text>
          </div>
        )}

        <div className={styles.actions}>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => send({ skipped: true })}>
            Bu dersi atla
          </Button>
          <Button type="submit" variant="primary" iconEnd="send" disabled={!complete || busy}>
            {busy ? 'Gönderiliyor…' : 'Gönder'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

interface ScaleQuestionProps {
  legend: string;
  labels: string[];
  value: number | null;
  onChange: (value: number) => void;
  disabled: boolean;
}

function ScaleQuestion({ legend, labels, value, onChange, disabled }: ScaleQuestionProps) {
  const name = useId();
  return (
    <fieldset className={styles.question} disabled={disabled}>
      <legend>
        <Text role="label-lg" as="span" tone="main">
          {legend}
        </Text>
      </legend>
      <div className={styles.scale}>
        {SCORES.map((score) => (
          <label key={score} className={`${styles.scaleOption} ${value === score ? styles.optionOn : ''}`}>
            <input
              type="radio"
              name={name}
              value={score}
              checked={value === score}
              onChange={() => onChange(score)}
              className={styles.radio}
              aria-label={`${score} – ${labels[score - 1]}`}
            />
            <Text role="title-md" as="span">
              {score}
            </Text>
          </label>
        ))}
      </div>
      <div className={styles.scaleEnds} aria-hidden="true">
        <Text role="label-md" tone="muted" as="span">
          {labels[0]}
        </Text>
        <Text role="label-md" tone="muted" as="span">
          {value !== null ? labels[value - 1] : ''}
        </Text>
        <Text role="label-md" tone="muted" as="span">
          {labels[labels.length - 1]}
        </Text>
      </div>
    </fieldset>
  );
}
