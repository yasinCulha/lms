import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/rbac.js';
import { AppError } from '../errors.js';
import { assertEnrolled, loadPublishedLesson } from '../lib/lessonAccess.js';
import { assertCanManageCourse, canManageCourse } from '../lib/courseAccess.js';
import {
  MAX_COMMENTS_PER_LESSON,
  commentSelect,
  parseCommentBody,
  toPublicComment,
} from '../lib/comments.js';

async function ratingsFor(lessonId: string, userIds: string[]): Promise<Map<string, number | null>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.lessonFeedback.findMany({
    where: { lessonId, userId: { in: userIds } },
    select: { userId: true, rating: true },
  });
  return new Map(rows.map((row) => [row.userId, row.rating]));
}

/** Yorumu dersin kursuyla getirir; ders taslaksa yorum da yokmuş gibi davranılır. */
async function loadComment(commentId: string) {
  const comment = await prisma.lessonComment.findUnique({
    where: { id: commentId },
    select: { ...commentSelect, lessonId: true, lesson: { select: { status: true, module: { select: { courseId: true } } } } },
  });
  if (!comment || comment.lesson.status !== 'PUBLISHED') {
    throw new AppError('NOT_FOUND', 'Yorum bulunamadı.', 404);
  }
  return comment;
}

async function publicComment(commentId: string, viewerId: string) {
  const row = await prisma.lessonComment.findUniqueOrThrow({
    where: { id: commentId },
    select: { ...commentSelect, lessonId: true },
  });
  const ratings = await ratingsFor(row.lessonId, [row.userId]);
  return toPublicComment(row, ratings.get(row.userId) ?? null, viewerId);
}

export function registerCommentRoutes(app: FastifyInstance) {
  app.get<{ Params: { lessonId: string } }>(
    '/api/v1/lessons/:lessonId/comments',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const lesson = await loadPublishedLesson(request.params.lessonId);
      const canManage = await canManageCourse(user, lesson.module.courseId);
      if (!canManage) {
        await assertEnrolled(user.userId, lesson.module.courseId);
      }

      const rows = await prisma.lessonComment.findMany({
        where: { lessonId: lesson.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: commentSelect,
      });
      const ratings = await ratingsFor(lesson.id, [...new Set(rows.map((row) => row.userId))]);
      const myCommentCount = rows.filter((row) => row.userId === user.userId).length;

      return {
        comments: rows.map((row) => toPublicComment(row, ratings.get(row.userId) ?? null, user.userId)),
        myCommentCount,
        maxComments: MAX_COMMENTS_PER_LESSON,
        canComment: !canManage,
      };
    },
  );

  app.post<{ Params: { lessonId: string } }>(
    '/api/v1/lessons/:lessonId/comments',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = request.user!.userId;
      const lesson = await loadPublishedLesson(request.params.lessonId);
      await assertEnrolled(userId, lesson.module.courseId);

      const parsed = parseCommentBody(request.body);
      if (!parsed.ok) {
        throw new AppError('VALIDATION_ERROR', parsed.message, 400);
      }

      const created = await prisma.$transaction(async (tx) => {
        const count = await tx.lessonComment.count({ where: { lessonId: lesson.id, userId } });
        if (count >= MAX_COMMENTS_PER_LESSON) {
          throw new AppError(
            'COMMENT_LIMIT',
            `Bu derse en fazla ${MAX_COMMENTS_PER_LESSON} yorum yapabilirsiniz.`,
            409,
          );
        }
        return tx.lessonComment.create({
          data: { lessonId: lesson.id, userId, body: parsed.text },
          select: { id: true },
        });
      });

      reply.status(201);
      return { comment: await publicComment(created.id, userId) };
    },
  );

  app.delete<{ Params: { commentId: string } }>(
    '/api/v1/comments/:commentId',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const comment = await loadComment(request.params.commentId);
      if (comment.userId !== user.userId) {
        await assertCanManageCourse(user, comment.lesson.module.courseId, 'Bu yorumu silme yetkiniz yok.');
      }
      await prisma.lessonComment.deleteMany({ where: { id: comment.id } });
      return { deleted: true };
    },
  );

  app.put<{ Params: { commentId: string } }>(
    '/api/v1/comments/:commentId/reply',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const comment = await loadComment(request.params.commentId);
      await assertCanManageCourse(user, comment.lesson.module.courseId, 'Yalnızca dersin eğitmeni yanıt verebilir.');

      const parsed = parseCommentBody(request.body);
      if (!parsed.ok) {
        throw new AppError('VALIDATION_ERROR', parsed.message, 400);
      }
      await prisma.lessonComment.update({
        where: { id: comment.id },
        data: { replyBody: parsed.text, replyAuthorId: user.userId, repliedAt: new Date() },
      });
      return { comment: await publicComment(comment.id, user.userId) };
    },
  );

  app.delete<{ Params: { commentId: string } }>(
    '/api/v1/comments/:commentId/reply',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const comment = await loadComment(request.params.commentId);
      await assertCanManageCourse(user, comment.lesson.module.courseId, 'Yalnızca dersin eğitmeni yanıtı silebilir.');
      await prisma.lessonComment.update({
        where: { id: comment.id },
        data: { replyBody: null, replyAuthorId: null, repliedAt: null },
      });
      return { comment: await publicComment(comment.id, user.userId) };
    },
  );
}
