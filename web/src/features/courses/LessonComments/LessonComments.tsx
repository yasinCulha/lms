import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Badge, Button, ConfirmDialog, Icon, Text, formStyles } from '../../../components';
import { ApiError } from '../../../lib/apiClient';
import { useLessonComments } from '../useLessonComments';
import type { LessonComment } from '../../../types';
import styles from './LessonComments.module.css';

const MAX_LENGTH = 1000;
const STARS = [1, 2, 3, 4, 5];

interface LessonCommentsProps {
  id?: string;
  lessonId: string;
  canManage: boolean;
  onCountChange: (count: number) => void;
}

type PendingDelete = { kind: 'comment' | 'reply'; commentId: string } | null;

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function LessonComments({ id, lessonId, canManage, onCountChange }: LessonCommentsProps) {
  const { data, loading, error, addComment, deleteComment, saveReply, deleteReply } = useLessonComments(lessonId, true);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

  const count = data?.comments.length;
  useEffect(() => {
    if (count !== undefined) onCountChange(count);
  }, [count, onCountChange]);

  return (
    <section id={id} className={styles.root} aria-label="Ders yorumları">
      {loading && (
        <Text role="body-sm" tone="muted" as="p">
          Yorumlar yükleniyor…
        </Text>
      )}
      {error && (
        <div role="alert">
          <Text role="body-sm" tone="error" as="p">
            {error}
          </Text>
        </div>
      )}

      {data && (
        <>
          {data.canComment && (
            <CommentForm
              remaining={data.maxComments - data.myCommentCount}
              max={data.maxComments}
              onSubmit={addComment}
            />
          )}

          {data.comments.length === 0 ? (
            <Text role="body-md" tone="muted" as="p" className={styles.empty}>
              Bu derse henüz yorum yapılmamış.
            </Text>
          ) : (
            <ul className={styles.list}>
              {data.comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  canManage={canManage}
                  onDelete={() => setPendingDelete({ kind: 'comment', commentId: comment.id })}
                  onDeleteReply={() => setPendingDelete({ kind: 'reply', commentId: comment.id })}
                  onSaveReply={(body) => saveReply(comment.id, body)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={pendingDelete.kind === 'comment' ? 'Yorumu sil' : 'Yanıtı sil'}
          confirmLabel="Sil"
          destructive
          onClose={() => setPendingDelete(null)}
          onConfirm={async () => {
            try {
              if (pendingDelete.kind === 'comment') await deleteComment(pendingDelete.commentId);
              else await deleteReply(pendingDelete.commentId);
              setPendingDelete(null);
            } catch (err) {
              throw new Error(errorMessage(err, 'Silme işlemi tamamlanamadı.'));
            }
          }}
        >
          <Text role="body-md" as="p">
            {pendingDelete.kind === 'comment'
              ? 'Bu yorum kalıcı olarak silinecek. Emin misiniz?'
              : 'Eğitmen yanıtı kalıcı olarak silinecek. Emin misiniz?'}
          </Text>
        </ConfirmDialog>
      )}
    </section>
  );
}

interface CommentFormProps {
  remaining: number;
  max: number;
  onSubmit: (body: string) => Promise<void>;
}

function CommentForm({ remaining, max, onSubmit }: CommentFormProps) {
  const fieldId = useId();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (remaining <= 0) {
    return (
      <Text role="body-sm" tone="muted" as="p" className={styles.limit}>
        Bu derse en fazla {max} yorum yapabilirsiniz. Yeni yorum için önceki yorumlarınızdan birini silebilirsiniz.
      </Text>
    );
  }

  const trimmed = text.trim();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await onSubmit(trimmed);
      setText('');
    } catch (err) {
      setFormError(errorMessage(err, 'Yorum gönderilemedi. Lütfen tekrar deneyin.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <label htmlFor={fieldId} className={formStyles.srOnly}>
        Yorumunuz
      </label>
      <textarea
        id={fieldId}
        className={formStyles.textarea}
        rows={3}
        maxLength={MAX_LENGTH}
        placeholder="Bu ders hakkındaki düşüncelerini paylaş…"
        value={text}
        disabled={submitting}
        onChange={(event) => setText(event.target.value)}
      />
      <div className={styles.formFooter}>
        <Text role="label-md" tone="muted" as="span">
          Kalan yorum hakkı: {remaining} / {max} · {text.length} / {MAX_LENGTH}
        </Text>
        <Button type="submit" variant="primary" size="sm" iconStart="send" disabled={!trimmed || submitting}>
          {submitting ? 'Gönderiliyor…' : 'Yorum Gönder'}
        </Button>
      </div>
      {formError && (
        <div role="alert">
          <Text role="body-sm" tone="error" as="p">
            {formError}
          </Text>
        </div>
      )}
    </form>
  );
}

interface CommentItemProps {
  comment: LessonComment;
  canManage: boolean;
  onDelete: () => void;
  onDeleteReply: () => void;
  onSaveReply: (body: string) => Promise<void>;
}

function CommentItem({ comment, canManage, onDelete, onDeleteReply, onSaveReply }: CommentItemProps) {
  const [editing, setEditing] = useState(false);

  return (
    <li className={styles.item}>
      <div className={styles.itemHeader}>
        <span className={styles.avatar} aria-hidden="true">
          <Icon name="person" size="sm" />
        </span>
        <div className={styles.meta}>
          <Text role="label-lg" as="span" tone="main">
            {comment.author.displayName}
            {comment.isMine && (
              <Text role="label-md" as="span" tone="muted">
                {' '}
                (Sen)
              </Text>
            )}
          </Text>
          <div className={styles.metaRow}>
            {comment.rating !== null && (
              <span className={styles.stars} role="img" aria-label={`5 üzerinden ${comment.rating} yıldız`}>
                {STARS.map((n) => (
                  <Icon
                    key={n}
                    name="star"
                    size="sm"
                    filled={n <= comment.rating!}
                    className={n <= comment.rating! ? styles.starOn : styles.starOff}
                  />
                ))}
              </span>
            )}
            <Text role="label-md" as="span" tone="muted">
              <time dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time>
            </Text>
          </div>
        </div>
        {(comment.isMine || canManage) && (
          <button type="button" className={styles.iconAction} onClick={onDelete} aria-label="Yorumu sil">
            <Icon name="delete" size="sm" />
          </button>
        )}
      </div>

      <Text role="body-md" as="p" className={styles.body}>
        {comment.body}
      </Text>

      {comment.reply && !editing && (
        <div className={styles.reply}>
          <div className={styles.replyHeader}>
            <Badge tone="navy" variant="soft" icon="school">
              Eğitmen
            </Badge>
            <Text role="label-lg" as="span" tone="main">
              {comment.reply.author?.name ?? 'Eğitmen'}
            </Text>
            <Text role="label-md" as="span" tone="muted">
              <time dateTime={comment.reply.repliedAt}>{formatDate(comment.reply.repliedAt)}</time>
            </Text>
          </div>
          <Text role="body-md" as="p" className={styles.body}>
            {comment.reply.body}
          </Text>
          {canManage && (
            <div className={styles.replyActions}>
              <Button variant="ghost" size="sm" iconStart="edit" onClick={() => setEditing(true)}>
                Yanıtı Düzenle
              </Button>
              <Button variant="ghost" size="sm" iconStart="delete" onClick={onDeleteReply}>
                Yanıtı Sil
              </Button>
            </div>
          )}
        </div>
      )}

      {canManage && !comment.reply && !editing && (
        <div className={styles.replyActions}>
          <Button variant="ghost" size="sm" iconStart="reply" onClick={() => setEditing(true)}>
            Yanıtla
          </Button>
        </div>
      )}

      {canManage && editing && (
        <ReplyForm
          initial={comment.reply?.body ?? ''}
          onCancel={() => setEditing(false)}
          onSave={async (body) => {
            await onSaveReply(body);
            setEditing(false);
          }}
        />
      )}
    </li>
  );
}

interface ReplyFormProps {
  initial: string;
  onCancel: () => void;
  onSave: (body: string) => Promise<void>;
}

function ReplyForm({ initial, onCancel, onSave }: ReplyFormProps) {
  const fieldId = useId();
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const trimmed = text.trim();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      await onSave(trimmed);
    } catch (err) {
      setFormError(errorMessage(err, 'Yanıt kaydedilemedi. Lütfen tekrar deneyin.'));
      setSaving(false);
    }
  };

  return (
    <form className={`${styles.reply} ${styles.form}`} onSubmit={submit}>
      <label htmlFor={fieldId} className={formStyles.srOnly}>
        Eğitmen yanıtı
      </label>
      <textarea
        id={fieldId}
        className={formStyles.textarea}
        rows={3}
        maxLength={MAX_LENGTH}
        placeholder="Öğrenciye yanıtını yaz…"
        value={text}
        disabled={saving}
        autoFocus
        onChange={(event) => setText(event.target.value)}
      />
      <div className={styles.formFooter}>
        <Text role="label-md" tone="muted" as="span">
          {text.length} / {MAX_LENGTH}
        </Text>
        <div className={styles.replyActions}>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            Vazgeç
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={!trimmed || saving}>
            {saving ? 'Kaydediliyor…' : 'Yanıtı Kaydet'}
          </Button>
        </div>
      </div>
      {formError && (
        <div role="alert">
          <Text role="body-sm" tone="error" as="p">
            {formError}
          </Text>
        </div>
      )}
    </form>
  );
}
