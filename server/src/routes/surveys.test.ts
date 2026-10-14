import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { parseSurveyBody, summarizeSurveys } from '../lib/surveys.js';

const answer = { clarity: 4, difficulty: 3, pace: 'JUST_RIGHT', note: '  Örnekler çok iyiydi.  ' };

describe('survey helpers', () => {
  it('validates bodies', () => {
    expect(parseSurveyBody({ skipped: true })).toEqual({ ok: true, input: { skipped: true } });
    expect(parseSurveyBody(answer)).toEqual({
      ok: true,
      input: { skipped: false, clarity: 4, difficulty: 3, pace: 'JUST_RIGHT', note: 'Örnekler çok iyiydi.' },
    });
    expect(parseSurveyBody({ ...answer, note: '   ' })).toMatchObject({ ok: true, input: { note: null } });
    for (const bad of [null, {}, { ...answer, clarity: 0 }, { ...answer, difficulty: 6 }, { ...answer, pace: 'X' }, { ...answer, note: 5 }, { ...answer, note: 'x'.repeat(1001) }]) {
      expect(parseSurveyBody(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it('summarizes', () => {
    expect(summarizeSurveys([])).toEqual({ count: 0, clarityAverage: null, difficultyAverage: null, pace: { SLOW: 0, JUST_RIGHT: 0, FAST: 0 } });
    expect(
      summarizeSurveys([
        { clarity: 5, difficulty: 2, pace: 'FAST' },
        { clarity: 4, difficulty: 3, pace: 'FAST' },
        { clarity: 4, difficulty: 3, pace: 'SLOW' },
      ]),
    ).toEqual({ count: 3, clarityAverage: 4.3, difficultyAverage: 2.7, pace: { SLOW: 1, JUST_RIGHT: 0, FAST: 2 } });
  });
});

describe('survey routes', () => {
  let app: FastifyInstance;
  let courseId: string;
  let otherCourseId: string;
  let lessonId: string;
  let lesson2Id: string;
  let otherLessonId: string;
  let ids: Record<'s1' | 's2' | 'outsider' | 'admin' | 'instructor' | 'otherInstructor', string>;
  const tokens = {} as Record<keyof typeof ids, string>;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const getState = (token = tokens.s1, id = lessonId) =>
    app.inject({ method: 'GET', url: `/api/v1/lessons/${id}/survey`, headers: auth(token) });
  const submit = (body: unknown, token = tokens.s1, id = lessonId) =>
    app.inject({ method: 'POST', url: `/api/v1/lessons/${id}/survey`, headers: auth(token), payload: body as Record<string, unknown> });
  const list = (token = tokens.instructor, query = '') =>
    app.inject({ method: 'GET', url: `/api/v1/surveys${query}`, headers: auth(token) });
  const markRead = (surveyIds: unknown, token = tokens.instructor) =>
    app.inject({ method: 'POST', url: '/api/v1/surveys/read', headers: auth(token), payload: { ids: surveyIds } as Record<string, unknown> });
  const complete = (userKey: keyof typeof ids, id: string) =>
    prisma.lessonProgress.create({ data: { userId: ids[userKey], lessonId: id } });

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await prisma.lessonSurveyRead.deleteMany();
    await prisma.lessonSurvey.deleteMany();
    await prisma.courseInstructor.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.lessonProgress.deleteMany();
    await prisma.lesson.deleteMany();
    await prisma.module.deleteMany();
    await prisma.course.deleteMany();
    await prisma.user.deleteMany();

    const users = {
      s1: ['STUDENT', 'Yasin Çulha'],
      s2: ['STUDENT', 'Ayşe Kaya'],
      outsider: ['STUDENT', 'Dış Öğrenci'],
      admin: ['ADMIN', 'Yönetici'],
      instructor: ['INSTRUCTOR', 'Zafer Cömert'],
      otherInstructor: ['INSTRUCTOR', 'Başka Hoca'],
    } as const;
    ids = {} as typeof ids;
    for (const [key, [role, name]] of Object.entries(users) as [keyof typeof ids, readonly ['STUDENT' | 'ADMIN' | 'INSTRUCTOR', string]][]) {
      const user = await prisma.user.create({ data: { email: `${key}@example.com`, passwordHash: 'x', name, role } });
      ids[key] = user.id;
      tokens[key] = signToken({ userId: user.id, role, roles: [role] });
    }

    const makeCourse = async (title: string) => {
      const course = await prisma.course.create({
        data: { title, description: 'Açıklama', category: 'Test', level: 'Başlangıç', status: 'PUBLISHED' },
      });
      const mod = await prisma.module.create({ data: { courseId: course.id, title: 'Modül', order: 1 } });
      const lessons = await Promise.all(
        [1, 2].map((order) =>
          prisma.lesson.create({ data: { moduleId: mod.id, title: `Ders ${order}`, order, status: 'PUBLISHED', contentType: 'TEXT' } }),
        ),
      );
      return { course, lessons };
    };
    const main = await makeCourse('Ana Kurs');
    const other = await makeCourse('Diğer Kurs');
    courseId = main.course.id;
    otherCourseId = other.course.id;
    [lessonId, lesson2Id] = main.lessons.map((l) => l.id);
    otherLessonId = other.lessons[0].id;

    for (const key of ['s1', 's2'] as const) {
      await prisma.enrollment.create({ data: { userId: ids[key], courseId, method: 'OPEN' } });
      await prisma.enrollment.create({ data: { userId: ids[key], courseId: otherCourseId, method: 'OPEN' } });
    }
    await prisma.courseInstructor.create({ data: { courseId, userId: ids.instructor, position: 1 } });
    await prisma.courseInstructor.create({ data: { courseId: otherCourseId, userId: ids.otherInstructor, position: 1 } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('requires enrollment for the student endpoints', async () => {
    expect((await getState(tokens.outsider)).statusCode).toBe(403);
    expect((await submit(answer, tokens.outsider)).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: `/api/v1/lessons/${lessonId}/survey` })).statusCode).toBe(401);
  });

  it('reports pending state and refuses surveys for uncompleted lessons', async () => {
    expect((await getState()).json()).toEqual({
      survey: { status: 'PENDING', lessonCompleted: false },
      lesson: { id: lessonId, title: 'Ders 1' },
    });
    const res = await submit(answer);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('LESSON_NOT_COMPLETED');
  });

  it('accepts one answer per lesson', async () => {
    await complete('s1', lessonId);
    const res = await submit(answer);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ survey: { status: 'ANSWERED', lessonCompleted: true } });
    const again = await submit(answer);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('SURVEY_ALREADY_SUBMITTED');
    expect((await submit({ skipped: true })).statusCode).toBe(409);
  });

  it('records skips so the survey is not asked again, and hides them from instructors', async () => {
    await complete('s1', lessonId);
    const res = await submit({ skipped: true });
    expect(res.json().survey.status).toBe('SKIPPED');
    expect((await getState()).json().survey.status).toBe('SKIPPED');
    expect((await list()).json()).toMatchObject({ surveys: [], unreadCount: 0 });
  });

  it('rejects invalid bodies', async () => {
    await complete('s1', lessonId);
    for (const bad of [{}, { ...answer, clarity: 9 }, { ...answer, pace: 'slow' }]) {
      expect((await submit(bad)).statusCode, JSON.stringify(bad)).toBe(400);
    }
  });

  it('shows instructors only their courses with masked names', async () => {
    await complete('s1', lessonId);
    await complete('s2', otherLessonId);
    await submit(answer, tokens.s1, lessonId);
    await submit({ clarity: 2, difficulty: 5, pace: 'FAST' }, tokens.s2, otherLessonId);

    const mine = (await list()).json();
    expect(mine.unreadCount).toBe(1);
    expect(mine.surveys).toHaveLength(1);
    expect(mine.surveys[0]).toMatchObject({
      author: { displayName: 'Y**** Ç****' },
      course: { id: courseId, title: 'Ana Kurs' },
      lesson: { id: lessonId, title: 'Ders 1' },
      clarity: 4,
      difficulty: 3,
      pace: 'JUST_RIGHT',
      note: 'Örnekler çok iyiydi.',
      read: false,
    });
    expect(JSON.stringify(mine)).not.toContain('Yasin');

    expect((await list(tokens.admin)).json().surveys).toHaveLength(2);
    expect((await list(tokens.s1)).statusCode).toBe(403);
    expect((await list(tokens.otherInstructor, `?courseId=${courseId}`)).statusCode).toBe(403);
  });

  it('returns a course summary when filtered by course', async () => {
    await complete('s1', lessonId);
    await complete('s2', lesson2Id);
    await submit({ clarity: 5, difficulty: 2, pace: 'FAST' }, tokens.s1, lessonId);
    await submit({ clarity: 4, difficulty: 3, pace: 'FAST' }, tokens.s2, lesson2Id);
    const body = (await list(tokens.instructor, `?courseId=${courseId}`)).json();
    expect(body.surveys).toHaveLength(2);
    expect(body.summary).toEqual({ count: 2, clarityAverage: 4.5, difficultyAverage: 2.5, pace: { SLOW: 0, JUST_RIGHT: 0, FAST: 2 } });
  });

  it('tracks read state per instructor', async () => {
    await prisma.courseInstructor.create({ data: { courseId, userId: ids.otherInstructor, position: 2 } });
    await complete('s1', lessonId);
    await complete('s2', otherLessonId);
    await submit(answer, tokens.s1, lessonId);
    await submit(answer, tokens.s2, otherLessonId);

    const unread = (await list(tokens.instructor, '?unread=true')).json();
    expect(unread.surveys).toHaveLength(1);
    const surveyId = unread.surveys[0].id;
    const foreignId = (await list(tokens.admin)).json().surveys.find((s: { id: string }) => s.id !== surveyId).id;

    // Yönetmediği kursun anketini okundu işaretleyemez.
    const res = await markRead([surveyId, foreignId]);
    expect(res.json()).toEqual({ marked: 1 });
    expect((await list(tokens.instructor, '?unread=true')).json()).toMatchObject({ surveys: [], unreadCount: 0 });
    expect((await list()).json().surveys[0].read).toBe(true);
    expect((await markRead([surveyId])).json()).toEqual({ marked: 0 });

    // Diğer eğitmen için hâlâ okunmamış.
    expect((await list(tokens.otherInstructor, '?unread=true')).json().unreadCount).toBe(2);
    expect((await markRead([])).statusCode).toBe(400);
    expect((await markRead([surveyId], tokens.s1)).statusCode).toBe(403);
  });

  it('cascades when the lesson is deleted', async () => {
    await complete('s1', lessonId);
    await submit(answer);
    const id = (await list()).json().surveys[0].id;
    await markRead([id]);
    await prisma.lesson.delete({ where: { id: lessonId } });
    expect(await prisma.lessonSurvey.count()).toBe(0);
    expect(await prisma.lessonSurveyRead.count()).toBe(0);
  });
});
