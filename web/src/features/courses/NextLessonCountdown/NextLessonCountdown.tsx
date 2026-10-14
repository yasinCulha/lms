import { useEffect, useRef, useState } from 'react';
import { Button, Text } from '../../../components';
import styles from './NextLessonCountdown.module.css';

const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface NextLessonCountdownProps {
  nextTitle: string;
  seconds?: number;
  onElapsed: () => void;
  onCancel: () => void;
}

/** Video bitince videonun üstünde açılır; süre dolunca sonraki derse geçilir. */
export function NextLessonCountdown({ nextTitle, seconds = 5, onElapsed, onCancel }: NextLessonCountdownProps) {
  const [remaining, setRemaining] = useState(seconds);
  const rootRef = useRef<HTMLDivElement>(null);
  const onElapsedRef = useRef(onElapsed);
  onElapsedRef.current = onElapsed;

  useEffect(() => {
    rootRef.current?.querySelector('button')?.focus({ preventScroll: true });
    const timer = setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (remaining === 0) onElapsedRef.current();
  }, [remaining]);

  return (
    <div ref={rootRef} className={styles.overlay} role="dialog" aria-modal="false" aria-label="Sonraki derse geçiş">
      <Text role="label-lg" tone="on-primary" as="p" className={styles.caption}>
        Sonraki ders
      </Text>
      <Text role="title-md" tone="on-primary" as="p" className={styles.title}>
        {nextTitle}
      </Text>

      <div className={styles.ring}>
        <svg viewBox="0 0 100 100" className={styles.svg} aria-hidden="true">
          <circle className={styles.track} cx="50" cy="50" r={RADIUS} />
          <circle
            className={styles.progress}
            cx="50"
            cy="50"
            r={RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - remaining / seconds)}
          />
        </svg>
        <Text role="display-hero" tone="on-primary" as="span" className={styles.count}>
          {remaining}
        </Text>
      </div>

      <p className={styles.srOnly} aria-live="polite">
        {remaining > 0 ? `${remaining} saniye içinde sonraki derse geçiliyor.` : 'Sonraki derse geçiliyor.'}
      </p>

      <Button variant="secondary" iconStart="close" onClick={onCancel}>
        İptal
      </Button>
    </div>
  );
}
