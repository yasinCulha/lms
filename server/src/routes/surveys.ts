import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/rbac.js';
import { AppError } from '../errors.js';
import { assertEnrolled, loadPublishedLesson } from '../lib/lessonAccess.js';
import { assertCanManageCourse, assignedCourseIds } from '../lib/courseAccess.js';
import { parseSurveyBody, summarizeSurveys, toInstructorSurvey } from '../lib/surveys.js';
import type { TokenPayload } from '../lib/jwt.js';

type SurveyStatus = 'PENDING' | 'ANSWERED' | 'SKIPPED';

async function surveyState(userId: string, lessonId: string) {
  const [survey, progress] = await Promise.all([
    prisma.lessonSurvey.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
      select: { skipped: true },
    }),
    prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
      select: { id: true },
    }),
  ]);
  const status: SurveyStatus = !survey ? 'PENDING' : survey.skipped ? 'SKIPPED' : 'ANSWERED';
  return { status, lessonCompleted: Boolean(progress) };
}

/** Kullanıcının anketlerini görebileceği kursların filtresi: ADMIN hepsi, INSTRUCTOR atandıkları. */
async function managedCourseFilter(user: TokenPayload, courseId?: string): Promise<Prisma.LessonSurveyWhereInput> {
  if (courseId) {
    await assertCanManageCourse(user, courseId);
    return { lesson: { module: { courseId } } };
  }
  if (user.role === 'ADMIN') return {};
  return { lesson: { module: { courseId: { in: [...(await assignedCourseIds(user))] } } } };
}

const surveySelect = (viewerId: string) =>
  ({
    id: true,
    createdAt: true,
    clarity: true,
    difficulty: true,
    pace: true,
    note: true,
    user: { select: { name: true } },
    lesson: {
      select: { id: true, title: true, module: { select: { course: { select: { id: true, title: true } } } } },
    },
    reads: { where: { userId: viewerId }, select: { id: true } },
  }) as const;

const SURVEY_LIST_LIMIT = 100;

export function registerSurveyRoutes(app: FastifyInstance) {
  app.get<{ Params: { lessonId: string } }>(
    '/api/v1/lessons/:lessonId/survey',
    { preHandler: [requireAuth] },
    async (request) => {
      const userId = request.user!.userId;
      const lesson = await loadPublishedLesson(request.params.lessonId);
      await assertEnrolled(userId, lesson.module.courseId);
      return { survey: await surveyState(userId, lesson.id), lesson: { id: lesson.id, title: lesson.title } };
    },
  );

  app.post<{ Params: { lessonId: string } }>(
    '/api/v1/lessons/:lessonId/survey',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = request.user!.userId;
      const lesson = await loadPublishedLesson(request.params.lessonId);
      await assertEnrolled(userId, lesson.module.courseId);

      const parsed = parseSurveyBody(request.body);
      if (!parsed.ok) throw new AppError('VALIDATION_ERROR', parsed.message, 400);

      const state = await surveyState(userId, lesson.id);
      if (!state.lessonCompleted) {
        throw new AppError('LESSON_NOT_COMPLETED', 'Anket yalnızca tamamlanan dersler için doldurulabilir.', 409);
      }
      if (state.status !== 'PENDING') {
        throw new AppError('SURVEY_ALREADY_SUBMITTED', 'Bu ders için anket zaten yanıtlandı.', 409);
      }

      const { input } = parsed;
      try {
        await prisma.lessonSurvey.create({
          data: input.skipped
            ? { userId, lessonId: lesson.id, skipped: true }
            : {
                userId,
                lessonId: lesson.id,
                clarity: input.clarity,
                difficulty: input.difficulty,
                pace: input.pace,
                note: input.note,
              },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new AppError('SURVEY_ALREADY_SUBMITTED', 'Bu ders için anket zaten yanıtlandı.', 409);
        }
        throw err;
      }
      reply.status(201);
      return { survey: await surveyState(userId, lesson.id) };
    },
  );

  app.get<{ Querystring: { courseId?: string; unread?: string } }>(
    '/api/v1/surveys',
    { preHandler: [requireAuth, requireRole('INSTRUCTOR', 'ADMIN')] },
    async (request) => {
      const user = request.user!;
      const { courseId } = request.query;
      const unreadOnly = request.query.unread === 'true';
      const where: Prisma.LessonSurveyWhereInput = {
        ...(await managedCourseFilter(user, courseId)),
        skipped: false,
        ...(unreadOnly ? { reads: { none: { userId: user.userId } } } : {}),
      };

      const [rows, unreadCount] = await Promise.all([
        prisma.lessonSurvey.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: SURVEY_LIST_LIMIT,
          select: surveySelect(user.userId),
        }),
        prisma.lessonSurvey.count({ where: { ...where, reads: { none: { userId: user.userId } } } }),
      ]);

      const summary = courseId
        ? summarizeSurveys(
            await prisma.lessonSurvey.findMany({
              where: { lesson: { module: { courseId } }, skipped: false },
              select: { clarity: true, difficulty: true, pace: true },
            }),
          )
        : undefined;

      return { surveys: rows.map(toInstructorSurvey), unreadCount, ...(summary ? { summary } : {}) };
    },
  );

  app.post(
    '/api/v1/surveys/read',
    { preHandler: [requireAuth, requireRole('INSTRUCTOR', 'ADMIN')] },
    async (request) => {
      const user = request.user!;
      const raw = (request.body ?? {}) as { ids?: unknown };
      if (!Array.isArray(raw.ids) || raw.ids.length === 0 || raw.ids.length > 500 || !raw.ids.every((id) => typeof id === 'string')) {
        throw new AppError('VALIDATION_ERROR', 'ids boş olmayan bir metin dizisi olmalıdır.', 400);
      }
      const visible = await prisma.lessonSurvey.findMany({
        where: {
          ...(await managedCourseFilter(user)),
          id: { in: raw.ids as string[] },
          reads: { none: { userId: user.userId } },
        },
        select: { id: true },
      });
      for (const { id } of visible) {
        await prisma.lessonSurveyRead.upsert({
          where: { surveyId_userId: { surveyId: id, userId: user.userId } },
          create: { surveyId: id, userId: user.userId },
          update: {},
        });
      }
      return { marked: visible.length };
    },
  );
}
