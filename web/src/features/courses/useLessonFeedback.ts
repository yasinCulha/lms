import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { LessonFeedback } from '../../types';

interface FeedbackResponse {
  feedback: LessonFeedback;
}

type Patch = { liked?: boolean; rating?: number | null };

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function applyPatch(prev: LessonFeedback, patch: Patch): LessonFeedback {
  let { likeCount, ratingCount, ratingAverage } = prev;
  const mine = { ...prev.mine };

  if (patch.liked !== undefined && patch.liked !== prev.mine.liked) {
    likeCount = Math.max(0, likeCount + (patch.liked ? 1 : -1));
    mine.liked = patch.liked;
  }

  if (patch.rating !== undefined && patch.rating !== prev.mine.rating) {
    const sum = (ratingAverage ?? 0) * ratingCount - (prev.mine.rating ?? 0);
    ratingCount = Math.max(0, ratingCount - (prev.mine.rating !== null ? 1 : 0));
    let newSum = sum;
    if (patch.rating !== null) {
      newSum += patch.rating;
      ratingCount += 1;
    }
    ratingAverage = ratingCount > 0 ? round1(newSum / ratingCount) : null;
    mine.rating = patch.rating;
  }

  return { ...prev, likeCount, ratingCount, ratingAverage, mine };
}

export function useLessonFeedback(lessonId: string | undefined, enabled: boolean) {
  const [feedback, setFeedback] = useState<LessonFeedback | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const currentId = useRef(lessonId);
  const latest = useRef<LessonFeedback | null>(null);
  latest.current = feedback;

  useEffect(() => {
    currentId.current = lessonId;
    setFeedback(null);
    setError(null);
    setSaving(false);
    if (!lessonId || !enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiFetch<FeedbackResponse>(`/api/v1/lessons/${lessonId}/feedback`)
      .then((res) => {
        if (!cancelled) setFeedback(res.feedback);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Geri bildirim yüklenemedi.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId, enabled]);

  const save = useCallback(
    async (patch: Patch) => {
      const id = lessonId;
      const previous = latest.current;
      if (!id || !previous) return;
      setError(null);
      setSaving(true);
      setFeedback(applyPatch(previous, patch));
      try {
        const res = await apiFetch<FeedbackResponse>(`/api/v1/lessons/${id}/feedback`, {
          method: 'PUT',
          body: JSON.stringify(patch),
        });
        if (currentId.current !== id) return;
        setFeedback(res.feedback);
      } catch (err) {
        if (currentId.current !== id) return;
        setFeedback(previous);
        setError(err instanceof ApiError ? err.message : 'Geri bildirim kaydedilemedi. Lütfen tekrar deneyin.');
      } finally {
        if (currentId.current === id) setSaving(false);
      }
    },
    [lessonId],
  );

  const setLiked = useCallback((liked: boolean) => save({ liked }), [save]);
  const setRating = useCallback((rating: number | null) => save({ rating }), [save]);

  return { feedback, loading, error, saving, setLiked, setRating };
}
