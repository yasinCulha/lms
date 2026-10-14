import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/rbac.js';
import { AppError } from '../errors.js';
import { assertEnrolled, loadPublishedLesson } from '../lib/lessonAccess.js';
import { canManageCourse } from '../lib/courseAccess.js';
import { mergeFeedback, parseFeedbackBody, summarizeGroups } from '../lib/feedback.js';

async function buildFeedback(userId: string, lessonId: string) {
  const [groups, mine, commentCount] = await Promise.all([
    prisma.lessonFeedback.groupBy({
      by: ['liked'],
      where: { lessonId },
      _count: { _all: true, rating: true },
      _sum: { rating: true },
    }),
    prisma.lessonFeedback.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
      select: { liked: true, rating: true },
    }),
    prisma.lessonComment.count({ where: { lessonId } }),
  ]);
  const summary = summarizeGroups(
    groups.map((g) => ({
      liked: g.liked,
      rows: g._count._all,
      ratingCount: g._count.rating,
      ratingSum: g._sum.rating,
    })),
  );
  return { feedback: { ...summary, commentCount, mine: mine ?? { liked: false, rating: null } } };
}

export function registerFeedbackRoutes(app: FastifyInstance) {
  app.get<{ Params: { lessonId: string } }>(
    '/api/v1/lessons/:lessonId/feedback',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const lesson = await loadPublishedLesson(request.params.lessonId);
      const courseId = lesson.module.courseId;
      if (!(await canManageCourse(user, courseId))) {
        await assertEnrolled(user.userId, courseId);
      }
      return buildFeedback(user.userId, lesson.id);
    },
  );

  app.put<{ Params: { lessonId: string } }>(
    '/api/v1/lessons/:lessonId/feedback',
    { preHandler: [requireAuth] },
    async (request) => {
      const userId = request.user!.userId;
      const lesson = await loadPublishedLesson(request.params.lessonId);
      await assertEnrolled(userId, lesson.module.courseId);

      const parsed = parseFeedbackBody(request.body);
      if (!parsed.ok) {
        throw new AppError('VALIDATION_ERROR', parsed.message, 400);
      }
      const where = { userId_lessonId: { userId, lessonId: lesson.id } };

      const apply = async () => {
        const existing = await prisma.lessonFeedback.findUnique({
          where,
          select: { liked: true, rating: true },
        });
        const merged = mergeFeedback(existing, parsed.patch);
        if (!merged.liked && merged.rating === null) {
          await prisma.lessonFeedback.deleteMany({ where: { userId, lessonId: lesson.id } });
          return;
        }
        await prisma.lessonFeedback.upsert({
          where,
          create: { userId, lessonId: lesson.id, ...merged },
          update: merged,
        });
      };

      try {
        await apply();
      } catch (err) {
        // Aynı satırı ilk kez oluşturan eşzamanlı iki istekten kaybeden güncellemeye düşer.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          await apply();
        } else {
          throw err;
        }
      }
      return buildFeedback(userId, lesson.id);
    },
  );
}
