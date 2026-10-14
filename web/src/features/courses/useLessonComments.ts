import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { LessonComment, LessonCommentsResponse } from '../../types';

interface CommentResponse {
  comment: LessonComment;
}

/**
 * Ders yorumlarını yükler ve yönetir. Eylemler hata durumunda ApiError fırlatır;
 * çağıran taraf (form/onay diyaloğu) mesajı kendisi gösterir.
 */
export function useLessonComments(lessonId: string, enabled: boolean) {
  const [data, setData] = useState<LessonCommentsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentId = useRef(lessonId);

  useEffect(() => {
    currentId.current = lessonId;
    setData(null);
    setError(null);
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiFetch<LessonCommentsResponse>(`/api/v1/lessons/${lessonId}/comments`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Yorumlar yüklenemedi.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId, enabled]);

  const replaceComment = useCallback((id: string, comment: LessonComment) => {
    if (currentId.current !== id) return;
    setData((prev) =>
      prev ? { ...prev, comments: prev.comments.map((c) => (c.id === comment.id ? comment : c)) } : prev,
    );
  }, []);

  const addComment = useCallback(
    async (body: string) => {
      const id = lessonId;
      const res = await apiFetch<CommentResponse>(`/api/v1/lessons/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
      if (currentId.current !== id) return;
      setData((prev) =>
        prev
          ? { ...prev, comments: [res.comment, ...prev.comments], myCommentCount: prev.myCommentCount + 1 }
          : prev,
      );
    },
    [lessonId],
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      const id = lessonId;
      await apiFetch(`/api/v1/comments/${commentId}`, { method: 'DELETE' });
      if (currentId.current !== id) return;
      setData((prev) => {
        if (!prev) return prev;
        const target = prev.comments.find((c) => c.id === commentId);
        return {
          ...prev,
          comments: prev.comments.filter((c) => c.id !== commentId),
          myCommentCount: prev.myCommentCount - (target?.isMine ? 1 : 0),
        };
      });
    },
    [lessonId],
  );

  const saveReply = useCallback(
    async (commentId: string, body: string) => {
      const id = lessonId;
      const res = await apiFetch<CommentResponse>(`/api/v1/comments/${commentId}/reply`, {
        method: 'PUT',
        body: JSON.stringify({ body }),
      });
      replaceComment(id, res.comment);
    },
    [lessonId, replaceComment],
  );

  const deleteReply = useCallback(
    async (commentId: string) => {
      const id = lessonId;
      const res = await apiFetch<CommentResponse>(`/api/v1/comments/${commentId}/reply`, { method: 'DELETE' });
      replaceComment(id, res.comment);
    },
    [lessonId, replaceComment],
  );

  return { data, loading, error, addComment, deleteComment, saveReply, deleteReply };
}
