/** Ders yorumları için saf yardımcılar. */

export const MAX_COMMENTS_PER_LESSON = 5;
export const MAX_COMMENT_LENGTH = 1000;

/** "Yasin Çulha" → "Y**** Ç****": her kelimenin baş harfi açık, kalan harfler yıldız. */
export function maskName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '*';
  return words
    .map((word) => {
      const chars = Array.from(word);
      return chars[0] + '*'.repeat(chars.length - 1);
    })
    .join(' ');
}

export function parseCommentBody(
  body: unknown,
): { ok: true; text: string } | { ok: false; message: string } {
  const raw = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>).body : undefined;
  if (typeof raw !== 'string') return { ok: false, message: 'body bir metin olmalıdır.' };
  const text = raw.trim();
  if (text.length === 0) return { ok: false, message: 'Yorum boş olamaz.' };
  if (text.length > MAX_COMMENT_LENGTH) {
    return { ok: false, message: `Yorum en fazla ${MAX_COMMENT_LENGTH} karakter olabilir.` };
  }
  return { ok: true, text };
}

export interface CommentRow {
  id: string;
  userId: string;
  body: string;
  createdAt: Date;
  replyBody: string | null;
  repliedAt: Date | null;
  user: { name: string };
  replyAuthor: { name: string } | null;
}

export function toPublicComment(row: CommentRow, rating: number | null, viewerId: string) {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt,
    author: { displayName: maskName(row.user.name) },
    rating,
    isMine: row.userId === viewerId,
    reply:
      row.replyBody !== null
        ? {
            body: row.replyBody,
            repliedAt: row.repliedAt,
            author: row.replyAuthor ? { name: row.replyAuthor.name } : null,
          }
        : null,
  };
}

/** Prisma select: yalnızca maskeleme için ad; e-posta vb. hiç okunmaz. */
export const commentSelect = {
  id: true,
  userId: true,
  body: true,
  createdAt: true,
  replyBody: true,
  repliedAt: true,
  user: { select: { name: true } },
  replyAuthor: { select: { name: true } },
} as const;
