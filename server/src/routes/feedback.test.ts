import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { mergeFeedback, parseFeedbackBody, roundAverage, summarizeGroups } from '../lib/feedback.js';

describe('feedback helpers', () => {
  it('rounds the average to one decimal and returns null without ratings', () => {
    expect(roundAverage(13, 3)).toBe(4.3);
    expect(roundAverage(14, 3)).toBe(4.7);
    expect(roundAverage(9, 2)).toBe(4.5);
    expect(roundAverage(5, 1)).toBe(5);
    expect(roundAverage(0, 0)).toBeNull();
  });

  it('summarizes groups', () => {
    expect(summarizeGroups([])).toEqual({ likeCount: 0, ratingCount: 0, ratingAverage: null });
    expect(
      summarizeGroups([
        { liked: true, rows: 2, ratingCount: 1, ratingSum: 5 },
        { liked: false, rows: 2, ratingCount: 2, ratingSum: 8 },
      ]),
    ).toEqual({ likeCount: 2, ratingCount: 3, ratingAverage: 4.3 });
  });

  it('validates and merges bodies', () => {
    expect(parseFeedbackBody(undefined).ok).toBe(false);
    expect(parseFeedbackBody({}).ok).toBe(false);
    expect(parseFeedbackBody({ rating: 6 }).ok).toBe(false);
    expect(parseFeedbackBody({ rating: null })).toEqual({ ok: true, patch: { rating: null } });
    expect(mergeFeedback(null, { rating: 4 })).toEqual({ liked: false, rating: 4 });
    expect(mergeFeedback({ liked: true, rating: 4 }, { rating: null })).toEqual({ liked: true, rating: null });
    expect(mergeFeedback({ liked: true, rating: 4 }, { liked: false })).toEqual({ liked: false, rating: 4 });
  });
});

describe('feedback routes', () => {
  let app: FastifyInstance;
  let courseId: string;
  let lessonId: string;
  let draftLessonId: string;
  let ids: Record<'s1' | 's2' | 's3' | 'outsider' | 'admin' | 'instructor' | 'otherInstructor', string>;
  const tokens = {} as Record<keyof typeof ids, string>;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const get = (token?: string, id = lessonId) =>
    app.inject({ method: 'GET', url: `/api/v1/lessons/${id}/feedback`, headers: token ? auth(token) : {} });
  const put = (payload: unknown, token = tokens.s1, id = lessonId) =>
    app.inject({
      method: 'PUT',
      url: `/api/v1/lessons/${id}/feedback`,
      headers: auth(token),
      payload: payload as Record<string, unknown>,
    });
  const rows = () => prisma.lessonFeedback.count();

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await prisma.lessonFeedback.deleteMany();
    await prisma.courseInstructor.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.lessonProgress.deleteMany();
    await prisma.lesson.deleteMany();
    await prisma.module.deleteMany();
    await prisma.course.deleteMany();
    await prisma.user.deleteMany();

    const roles = {
      s1: 'STUDENT',
      s2: 'STUDENT',
      s3: 'STUDENT',
      outsider: 'STUDENT',
      admin: 'ADMIN',
      instructor: 'INSTRUCTOR',
      otherInstructor: 'INSTRUCTOR',
    } as const;
    ids = {} as typeof ids;
    for (const [key, role] of Object.entries(roles) as [keyof typeof ids, 'STUDENT' | 'ADMIN' | 'INSTRUCTOR'][]) {
      const user = await prisma.user.create({
        data: { email: `${key}@example.com`, passwordHash: 'x', name: key, role },
      });
      ids[key] = user.id;
      tokens[key] = signToken({ userId: user.id, role, roles: [role] });
    }

    const course = await prisma.course.create({
      data: { title: 'Kurs', description: 'Açıklama', category: 'Test', level: 'Başlangıç', status: 'PUBLISHED' },
    });
    courseId = course.id;
    const mod = await prisma.module.create({ data: { courseId, title: 'Modül', order: 1 } });
    const lesson = await prisma.lesson.create({
      data: { moduleId: mod.id, title: 'Ders', order: 1, status: 'PUBLISHED', contentType: 'TEXT' },
    });
    const draft = await prisma.lesson.create({
      data: { moduleId: mod.id, title: 'Taslak', order: 2, status: 'DRAFT', contentType: 'TEXT' },
    });
    lessonId = lesson.id;
    draftLessonId = draft.id;

    for (const key of ['s1', 's2', 's3'] as const) {
      await prisma.enrollment.create({ data: { userId: ids[key], courseId, method: 'OPEN' } });
    }
    await prisma.courseInstructor.create({ data: { courseId, userId: ids.instructor, position: 1 } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('requires authentication', async () => {
    expect((await get()).statusCode).toBe(401);
    const res = await app.inject({ method: 'PUT', url: `/api/v1/lessons/${lessonId}/feedback`, payload: { liked: true } });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 for missing and draft lessons', async () => {
    for (const id of ['nope', draftLessonId]) {
      const g = await get(tokens.s1, id);
      expect(g.statusCode).toBe(404);
      expect(g.json().error.code).toBe('NOT_FOUND');
      expect((await put({ liked: true }, tokens.s1, id)).statusCode).toBe(404);
    }
  });

  it('returns 403 for unenrolled students on GET and PUT', async () => {
    const g = await get(tokens.outsider);
    expect(g.statusCode).toBe(403);
    expect(g.json().error.code).toBe('NOT_ENROLLED');
    const p = await put({ liked: true }, tokens.outsider);
    expect(p.statusCode).toBe(403);
    expect(p.json().error.code).toBe('NOT_ENROLLED');
  });

  it('lets ADMIN and assigned INSTRUCTOR read but not write; unassigned instructor cannot read', async () => {
    for (const key of ['admin', 'instructor'] as const) {
      const g = await get(tokens[key]);
      expect(g.statusCode).toBe(200);
      expect(g.json().feedback.mine).toEqual({ liked: false, rating: null });
      expect((await put({ liked: true }, tokens[key])).statusCode).toBe(403);
    }
    expect((await get(tokens.otherInstructor)).statusCode).toBe(403);
    expect(await rows()).toBe(0);
  });

  it('returns an empty summary initially', async () => {
    const res = await get(tokens.s1);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      feedback: { likeCount: 0, ratingCount: 0, ratingAverage: null, commentCount: 0, mine: { liked: false, rating: null } },
    });
  });

  it('stores like only, rating only and both', async () => {
    let res = await put({ liked: true });
    expect(res.statusCode).toBe(200);
    expect(res.json().feedback).toEqual({
      likeCount: 1, ratingCount: 0, ratingAverage: null, commentCount: 0, mine: { liked: true, rating: null },
    });

    res = await put({ rating: 4 }, tokens.s2);
    expect(res.json().feedback).toEqual({
      likeCount: 1, ratingCount: 1, ratingAverage: 4, commentCount: 0, mine: { liked: false, rating: 4 },
    });

    res = await put({ liked: true, rating: 5 }, tokens.s3);
    expect(res.json().feedback.mine).toEqual({ liked: true, rating: 5 });
    expect(await rows()).toBe(3);
  });

  it('keeps unsent fields on partial updates and clears rating with null', async () => {
    await put({ liked: true, rating: 3 });
    let res = await put({ rating: 5 });
    expect(res.json().feedback.mine).toEqual({ liked: true, rating: 5 });
    res = await put({ liked: false });
    expect(res.json().feedback.mine).toEqual({ liked: false, rating: 5 });
    res = await put({ liked: true });
    expect(res.json().feedback.mine).toEqual({ liked: true, rating: 5 });
    res = await put({ rating: null });
    expect(res.json().feedback.mine).toEqual({ liked: true, rating: null });
    expect(res.json().feedback.ratingAverage).toBeNull();
    expect(await rows()).toBe(1);
  });

  it('deletes the row when liked is false and rating is null', async () => {
    await put({ liked: true, rating: 2 });
    expect(await rows()).toBe(1);
    const res = await put({ liked: false, rating: null });
    expect(res.statusCode).toBe(200);
    expect(await rows()).toBe(0);
    expect(res.json().feedback.mine).toEqual({ liked: false, rating: null });
    // idempotent
    expect((await put({ liked: false })).statusCode).toBe(200);
    expect(await rows()).toBe(0);
  });

  it('rejects invalid bodies', async () => {
    const bad: unknown[] = [{}, { rating: 0 }, { rating: 6 }, { rating: 3.5 }, { rating: '4' }, { liked: 'yes' }, { liked: 1 }];
    for (const payload of bad) {
      const res = await put(payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
    const empty = await app.inject({ method: 'PUT', url: `/api/v1/lessons/${lessonId}/feedback`, headers: auth(tokens.s1) });
    expect(empty.statusCode).toBe(400);
    expect(await rows()).toBe(0);
  });

  it('aggregates across users and isolates mine', async () => {
    await put({ liked: true, rating: 5 }, tokens.s1);
    await put({ liked: true, rating: 4 }, tokens.s2);
    await put({ rating: 4 }, tokens.s3);

    const s1 = (await get(tokens.s1)).json().feedback;
    expect(s1).toEqual({ likeCount: 2, ratingCount: 3, ratingAverage: 4.3, commentCount: 0, mine: { liked: true, rating: 5 } });
    const s3 = (await get(tokens.s3)).json().feedback;
    expect(s3.mine).toEqual({ liked: false, rating: 4 });
    expect(s3.likeCount).toBe(2);
    const admin = (await get(tokens.admin)).json().feedback;
    expect(admin.mine).toEqual({ liked: false, rating: null });
    expect(admin.ratingAverage).toBe(4.3);
  });

  it('survives concurrent first writes', async () => {
    const results = await Promise.all([
      put({ liked: true }),
      put({ liked: true, rating: 4 }),
      put({ rating: 4 }),
      put({ liked: true }),
    ]);
    for (const res of results) expect(res.statusCode).toBe(200);
    expect(await rows()).toBe(1);
  });

  it('cascades when the lesson is deleted', async () => {
    await put({ liked: true });
    await put({ rating: 3 }, tokens.s2);
    expect(await rows()).toBe(2);
    await prisma.lesson.delete({ where: { id: lessonId } });
    expect(await rows()).toBe(0);
  });
});
