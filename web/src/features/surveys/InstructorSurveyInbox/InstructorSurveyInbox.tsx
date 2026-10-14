import { useEffect, useState } from 'react';
import { Button, Dialog, Text } from '../../../components';
import { apiFetch, ApiError } from '../../../lib/apiClient';
import type { InstructorSurvey, SurveysResponse } from '../../../types';
import { SurveyCard } from '../SurveyCard';
import styles from './InstructorSurveyInbox.module.css';

const SNOOZE_KEY = 'surveyInboxSnoozed';

function isSnoozed(userId: string) {
  try {
    return sessionStorage.getItem(SNOOZE_KEY) === userId;
  } catch {
    return false;
  }
}

function snooze(userId: string) {
  try {
    sessionStorage.setItem(SNOOZE_KEY, userId);
  } catch {
    // Depolama kapalıysa bir sonraki yüklemede yeniden sorulur.
  }
}

interface InstructorSurveyInboxProps {
  userId: string;
}

/** Eğitmen uygulamayı açtığında okunmamış öğrenci geri bildirimlerini modalda gösterir. */
export function InstructorSurveyInbox({ userId }: InstructorSurveyInboxProps) {
  const [surveys, setSurveys] = useState<InstructorSurvey[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isSnoozed(userId)) return;
    let cancelled = false;
    apiFetch<SurveysResponse>('/api/v1/surveys?unread=true')
      .then((res) => {
        if (cancelled || res.surveys.length === 0) return;
        setSurveys(res.surveys);
        setUnreadCount(res.unreadCount);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!surveys) return null;

  const later = () => {
    snooze(userId);
    setSurveys(null);
  };

  const markRead = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/v1/surveys/read', {
        method: 'POST',
        body: JSON.stringify({ ids: surveys.map((s) => s.id) }),
      });
      setSurveys(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'İşaretlenemedi. Lütfen tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={`Yeni öğrenci geri bildirimleri (${unreadCount})`} size="lg" busy={busy} onClose={later}>
      <Text role="body-md" tone="muted" as="p" className={styles.intro}>
        Öğrencilerin, tamamladıkları dersler için gönderdiği yanıtlar. Tüm geri bildirimleri kurs sayfasındaki
        “Öğrenci Geri Bildirimleri” panelinde de görebilirsiniz.
      </Text>
      <div className={styles.list}>
        {surveys.map((survey) => (
          <SurveyCard key={survey.id} survey={survey} />
        ))}
      </div>
      {unreadCount > surveys.length && (
        <Text role="body-sm" tone="muted" as="p">
          En yeni {surveys.length} geri bildirim gösteriliyor.
        </Text>
      )}
      {error && (
        <div role="alert">
          <Text role="body-sm" tone="error" as="p">
            {error}
          </Text>
        </div>
      )}
      <div className={styles.actions}>
        <Button variant="ghost" onClick={later} disabled={busy}>
          Daha Sonra
        </Button>
        <Button variant="primary" iconStart="done_all" onClick={markRead} disabled={busy}>
          {busy ? 'İşaretleniyor…' : 'Okundu Olarak İşaretle'}
        </Button>
      </div>
    </Dialog>
  );
}
