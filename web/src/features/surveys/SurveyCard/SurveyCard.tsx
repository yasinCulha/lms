import { Badge, Icon, Text } from '../../../components';
import type { InstructorSurvey } from '../../../types';
import { CLARITY_LABELS, DIFFICULTY_LABELS, PACE_LABELS } from '../surveyLabels';
import styles from './SurveyCard.module.css';

interface SurveyCardProps {
  survey: InstructorSurvey;
  /** Kurs sayfasında kurs adı tekrar edilmez. */
  showCourse?: boolean;
}

export function SurveyCard({ survey, showCourse = true }: SurveyCardProps) {
  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <Text role="label-lg" as="h3" tone="main">
            {showCourse ? `${survey.course.title} · ${survey.lesson.title}` : survey.lesson.title}
          </Text>
          <Text role="label-md" tone="muted" as="span">
            {survey.author.displayName} ·{' '}
            <time dateTime={survey.createdAt}>{new Date(survey.createdAt).toLocaleDateString('tr-TR')}</time>
          </Text>
        </div>
        {!survey.read && (
          <Badge tone="info" variant="soft" shape="pill">
            Yeni
          </Badge>
        )}
      </header>

      <dl className={styles.metrics}>
        <div className={styles.metric}>
          <dt>
            <Text role="label-md" tone="muted" as="span">
              Anlaşılırlık
            </Text>
          </dt>
          <dd>
            <Text role="label-lg" as="span" tone="main">
              {survey.clarity}/5 · {CLARITY_LABELS[survey.clarity - 1]}
            </Text>
          </dd>
        </div>
        <div className={styles.metric}>
          <dt>
            <Text role="label-md" tone="muted" as="span">
              Zorluk
            </Text>
          </dt>
          <dd>
            <Text role="label-lg" as="span" tone="main">
              {survey.difficulty}/5 · {DIFFICULTY_LABELS[survey.difficulty - 1]}
            </Text>
          </dd>
        </div>
        <div className={styles.metric}>
          <dt>
            <Text role="label-md" tone="muted" as="span">
              Tempo
            </Text>
          </dt>
          <dd>
            <Text role="label-lg" as="span" tone="main">
              {PACE_LABELS[survey.pace]}
            </Text>
          </dd>
        </div>
      </dl>

      {survey.note && (
        <div className={styles.note}>
          <Icon name="format_quote" size="sm" />
          <Text role="body-md" as="p">
            {survey.note}
          </Text>
        </div>
      )}
    </article>
  );
}
