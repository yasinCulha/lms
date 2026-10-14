import { useEffect, useState } from 'react';
import { Button, Panel, Text } from '../../../components';
import { apiFetch, ApiError } from '../../../lib/apiClient';
import type { SurveysResponse } from '../../../types';
import { SurveyCard } from '../SurveyCard';
import { PACE_OPTIONS } from '../surveyLabels';
import styles from './CourseSurveysPanel.module.css';

const INITIAL_VISIBLE = 5;

function formatAverage(value: number | null) {
  return value === null ? '—' : value.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Kursu yönetenler için ders sonu anketlerinin özeti ve listesi. */
export function CourseSurveysPanel({ courseId, className }: { courseId: string; className?: string }) {
  const [data, setData] = useState<SurveysResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    apiFetch<SurveysResponse>(`/api/v1/surveys?courseId=${encodeURIComponent(courseId)}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Geri bildirimler yüklenemedi.');
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const summary = data?.summary;
  const visible = data ? (showAll ? data.surveys : data.surveys.slice(0, INITIAL_VISIBLE)) : [];

  return (
    <Panel title="Öğrenci Geri Bildirimleri" icon="rate_review" className={className}>
      {!data && !error && (
        <Text role="body-md" tone="muted" as="p">
          Yükleniyor…
        </Text>
      )}
      {error && (
        <Text role="body-md" tone="error" as="p">
          {error}
        </Text>
      )}
      {data && summary && summary.count === 0 && (
        <Text role="body-md" tone="muted" as="p">
          Henüz geri bildirim yok. Öğrenciler bir dersi tamamlayıp ders ekranından çıktıklarında kısa bir anket
          doldurmaları istenir.
        </Text>
      )}
      {data && summary && summary.count > 0 && (
        <div className={styles.content}>
          <dl className={styles.summary}>
            <div className={styles.stat}>
              <dt>
                <Text role="label-md" tone="muted" as="span">
                  Yanıt
                </Text>
              </dt>
              <dd>
                <Text role="headline-sm" as="span" tone="main">
                  {summary.count}
                </Text>
              </dd>
            </div>
            <div className={styles.stat}>
              <dt>
                <Text role="label-md" tone="muted" as="span">
                  Ort. anlaşılırlık
                </Text>
              </dt>
              <dd>
                <Text role="headline-sm" as="span" tone="main">
                  {formatAverage(summary.clarityAverage)} / 5
                </Text>
              </dd>
            </div>
            <div className={styles.stat}>
              <dt>
                <Text role="label-md" tone="muted" as="span">
                  Ort. zorluk
                </Text>
              </dt>
              <dd>
                <Text role="headline-sm" as="span" tone="main">
                  {formatAverage(summary.difficultyAverage)} / 5
                </Text>
              </dd>
            </div>
            <div className={styles.stat}>
              <dt>
                <Text role="label-md" tone="muted" as="span">
                  Tempo
                </Text>
              </dt>
              <dd className={styles.pace}>
                {PACE_OPTIONS.map((option) => (
                  <Text key={option.value} role="label-md" as="span" tone="main">
                    {option.label}: {summary.pace[option.value]}
                  </Text>
                ))}
              </dd>
            </div>
          </dl>

          <div className={styles.list}>
            {visible.map((survey) => (
              <SurveyCard key={survey.id} survey={survey} showCourse={false} />
            ))}
          </div>
          {data.surveys.length > INITIAL_VISIBLE && (
            <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Daha az göster' : `Tümünü göster (${data.surveys.length})`}
            </Button>
          )}
        </div>
      )}
    </Panel>
  );
}
