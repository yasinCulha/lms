import { useEffect, useId, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Card, Icon, Text } from '../../../components';
import { useLessonFeedback } from '../useLessonFeedback';
import { LessonComments } from '../LessonComments';
import styles from './LessonFeedback.module.css';

interface LessonFeedbackProps {
  lessonId: string;
  /** Kursu yöneten (eğitmen/yönetici) beğeni ve puan veremez, yorumlara yanıt verebilir. */
  canManage?: boolean;
}

const STARS = [1, 2, 3, 4, 5];

export function LessonFeedback({ lessonId, canManage = false }: LessonFeedbackProps) {
  const { feedback, loading, error, saving: savingFeedback, setLiked, setRating } = useLessonFeedback(lessonId, true);
  const saving = savingFeedback || canManage;
  const [hover, setHover] = useState<number | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState<number | null>(null);
  const commentsId = useId();

  useEffect(() => {
    setCommentsOpen(false);
    setCommentCount(null);
  }, [lessonId]);

  const shownCommentCount = commentCount ?? feedback?.commentCount ?? 0;

  const mineRating = feedback?.mine.rating ?? null;
  const shown = hover ?? mineRating ?? 0;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (saving) return;
    let next: number | null = null;
    const base = mineRating ?? 0;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(5, base + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(1, base - 1);
    if (next !== null) {
      event.preventDefault();
      setRating(next);
      const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
      buttons[next - 1]?.focus();
    }
  };

  const average =
    feedback && feedback.ratingAverage !== null
      ? `${feedback.ratingAverage.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 5 · ${feedback.ratingCount} puan`
      : 'Henüz puan yok';

  return (
    <Card padding="lg" elevation="1" className={styles.root}>
      <Text role="title-md" as="h2" tone="main">
        Bu ders nasıldı?
      </Text>

      {loading && (
        <Text role="body-sm" tone="muted" as="p">
          Yükleniyor…
        </Text>
      )}

      {feedback && (
        <div className={styles.row}>
          <div className={styles.group}>
            <button
              type="button"
              className={`${styles.likeButton} ${feedback.mine.liked ? styles.likeActive : ''}`}
              aria-pressed={feedback.mine.liked}
              disabled={saving}
              onClick={() => setLiked(!feedback.mine.liked)}
            >
              <Icon name="thumb_up" size="md" filled={feedback.mine.liked} />
              <Text role="label-lg" as="span">
                {feedback.mine.liked ? 'Beğendin' : 'Beğen'}
              </Text>
              <Text role="label-md" as="span" tone="muted">
                {feedback.likeCount}
              </Text>
            </button>
            <Text role="body-sm" tone="muted" as="span">
              {feedback.likeCount === 0 ? 'Henüz beğeni yok' : `${feedback.likeCount} beğeni`}
            </Text>
          </div>

          <div className={styles.group}>
            <div
              className={styles.stars}
              role="radiogroup"
              aria-label="Ders puanı"
              onKeyDown={onKeyDown}
              onMouseLeave={() => setHover(null)}
            >
              {STARS.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={mineRating === n}
                  aria-label={`${n} yıldız`}
                  tabIndex={mineRating === n || (mineRating === null && n === 1) ? 0 : -1}
                  className={`${styles.star} ${n <= shown ? styles.starOn : ''}`}
                  disabled={saving}
                  onMouseEnter={() => setHover(n)}
                  onClick={() => setRating(mineRating === n ? null : n)}
                >
                  <Icon name="star" size="lg" filled={n <= shown} />
                </button>
              ))}
            </div>
            <Text role="body-sm" tone="muted" as="span">
              {average}
            </Text>
            <span className={styles.separator} aria-hidden="true">
              |
            </span>
            <button
              type="button"
              className={`${styles.commentsToggle} ${commentsOpen ? styles.commentsToggleOpen : ''}`}
              aria-expanded={commentsOpen}
              aria-controls={commentsId}
              onClick={() => setCommentsOpen((open) => !open)}
            >
              <Icon name="chat_bubble" size="sm" filled={commentsOpen} />
              <Text role="label-lg" as="span">
                Yorumlar ({shownCommentCount})
              </Text>
              <Icon name={commentsOpen ? 'expand_less' : 'expand_more'} size="sm" />
            </button>
          </div>
        </div>
      )}

      {feedback && commentsOpen && (
        <LessonComments
          id={commentsId}
          lessonId={lessonId}
          canManage={canManage}
          onCountChange={setCommentCount}
        />
      )}

      {error && (
        <div role="alert">
          <Text role="body-sm" tone="error" as="p">
            {error}
          </Text>
        </div>
      )}
    </Card>
  );
}
