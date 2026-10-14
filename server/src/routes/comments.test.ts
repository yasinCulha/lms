import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { maskName, parseCommentBody } from '../lib/comments.js';

describe('comment helpers', () => {
  it('masks every word to its first letter', () => {
    expect(maskName('Yasin Çulha')).toBe('Y**** Ç****');
    expect(maskName('  İsmail   Şahin ')).toBe('İ***** Ş****');
    expect(maskName('A')).toBe('A');
    expect(maskName('')).toBe('*');
  });

  it('validates bodies', () => {
    expect(parseCommentBody(undefined).ok).toBe(false);
    expect(parseCommentBody({ body: '   ' }).ok).toBe(false);
    expect(parseCommentBody({ body: 5 }).ok).toBe(false);
    expect(parseCommentBody({ body: 'x'.repeat(1001) }).ok).toBe(false);
    expect(parseCommentBody({ body: '  Güzel ders  ' })).toEqual({ ok: true, text: 'Güzel ders' });
  });
});

describe('comment routes', () => {
  let app: FastifyInstance;
  let courseId: string;
  let lessonId: string;
  let draftLessonId: string;
  let ids: Record<'s1' | 's2' | 'outsider' | 'admin' | 'instructor' | 'otherInstructor', string>;
  const tokens = {} as Record<keyof typeof ids, string>;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const list = (token = tokens.s1, id = lessonId) =>
    app.inject({ method: 'GET', url: `/api/v1/lessons/${id}/comments`, headers: auth(token) });
  const post = (body: unknown, token = tokens.s1, id = lessonId) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/lessons/${id}/comments`,
      headers: auth(token),
      payload: body as Record<string, unknown>,
    });
  const remove = (commentId: string, token = tokens.s1) =>
    app.inject({ method: 'DELETE', url: `/api/v1/comments/${commentId}`, headers: auth(token) });
  const putReply = (commentId: string, body: unknown, token = tokens.instructor) =>
    app.inject({
      method: 'PUT',
      url: `/api/v1/comments/${commentId}/reply`,
      headers: auth(token),
      payload: body as Record<string, unknown>,
    });
  const deleteReply = (commentId: string, token = tokens.instructor) =>
    app.inject({ method: 'DELETE', url: `/api/v1/comments/${commentId}/reply`, headers: auth(token) });

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await prisma.lessonComment.deleteMany();
    await prisma.lessonFeedback.deleteMany();
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
      const user = await prisma.user.create({
        data: { email: `${key}@example.com`, passwordHash: 'x', name, role },
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

    for (const key of ['s1', 's2'] as const) {
      await prisma.enrollment.create({ data: { userId: ids[key], courseId, method: 'OPEN' } });
    }
    await prisma.courseInstructor.create({ data: { courseId, userId: ids.instructor, position: 1 } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('requires authentication', async () => {
    const g = await app.inject({ method: 'GET', url: `/api/v1/lessons/${lessonId}/comments` });
    expect(g.statusCode).toBe(401);
    const p = await app.inject({ method: 'POST', url: `/api/v1/lessons/${lessonId}/comments`, payload: { body: 'x' } });
    expect(p.statusCode).toBe(401);
  });

  it('returns 404 for missing and draft lessons', async () => {
    for (const id of ['nope', draftLessonId]) {
      expect((await list(tokens.s1, id)).statusCode).toBe(404);
      expect((await post({ body: 'x' }, tokens.s1, id)).statusCode).toBe(404);
    }
  });

  it('rejects unenrolled students and unassigned instructors', async () => {
    expect((await list(tokens.outsider)).json().error.code).toBe('NOT_ENROLLED');
    expect((await post({ body: 'x' }, tokens.outsider)).statusCode).toBe(403);
    expect((await list(tokens.otherInstructor)).statusCode).toBe(403);
  });

  it('creates a comment with a masked name and the author rating', async () => {
    await prisma.lessonFeedback.create({ data: { userId: ids.s1, lessonId, rating: 4 } });
    const res = await post({ body: '  Çok faydalı bir ders.  ' });
    expect(res.statusCode).toBe(201);
    const { comment } = res.json();
    expect(comment).toMatchObject({
      body: 'Çok faydalı bir ders.',
      author: { displayName: 'Y**** Ç****' },
      rating: 4,
      isMine: true,
      reply: null,
    });
    const raw = JSON.stringify(comment);
    expect(raw).not.toContain('Yasin');
    expect(raw).not.toContain('@example.com');
  });

  it('lists newest first with null rating when the author did not rate', async () => {
    await post({ body: 'ilk' });
    await post({ body: 'ikinci' }, tokens.s2);
    const body = (await list(tokens.s2)).json();
    expect(body.comments.map((c: { body: string }) => c.body)).toEqual(['ikinci', 'ilk']);
    expect(body.comments[0]).toMatchObject({ isMine: true, rating: null, author: { displayName: 'A*** K***' } });
    expect(body.comments[1].isMine).toBe(false);
    expect(body).toMatchObject({ myCommentCount: 1, maxComments: 5, canComment: true });
  });

  it('enforces 5 comments per student per lesson', async () => {
    for (let i = 0; i < 5; i++) expect((await post({ body: `yorum ${i}` })).statusCode).toBe(201);
    const sixth = await post({ body: 'altıncı' });
    expect(sixth.statusCode).toBe(409);
    expect(sixth.json().error.code).toBe('COMMENT_LIMIT');
    expect((await post({ body: 'başka öğrenci' }, tokens.s2)).statusCode).toBe(201);

    const first = (await list()).json().comments.find((c: { isMine: boolean }) => c.isMine);
    expect((await remove(first.id)).statusCode).toBe(200);
    expect((await post({ body: 'yeniden' })).statusCode).toBe(201);
  });

  it('rejects invalid bodies', async () => {
    for (const payload of [{}, { body: '' }, { body: '   ' }, { body: 3 }, { body: 'x'.repeat(1001) }]) {
      const res = await post(payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('lets managers read but not comment', async () => {
    await post({ body: 'soru' });
    for (const key of ['admin', 'instructor'] as const) {
      const res = await list(tokens[key]);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ canComment: false, myCommentCount: 0 });
      expect(res.json().comments).toHaveLength(1);
      expect((await post({ body: 'x' }, tokens[key])).statusCode).toBe(403);
    }
  });

  it('lets the assigned instructor reply once, overwrite and delete the reply', async () => {
    const id = (await post({ body: 'soru' })).json().comment.id;

    expect((await putReply(id, { body: 'cevap' }, tokens.s1)).statusCode).toBe(403);
    expect((await putReply(id, { body: 'cevap' }, tokens.otherInstructor)).statusCode).toBe(403);
    expect((await putReply(id, { body: '' })).statusCode).toBe(400);

    let res = await putReply(id, { body: 'cevap' });
    expect(res.statusCode).toBe(200);
    expect(res.json().comment.reply).toMatchObject({ body: 'cevap', author: { name: 'Zafer Cömert' } });

    res = await putReply(id, { body: 'düzeltilmiş cevap' });
    expect(res.json().comment.reply.body).toBe('düzeltilmiş cevap');
    expect((await list()).json().comments[0].reply.body).toBe('düzeltilmiş cevap');

    expect((await deleteReply(id, tokens.s1)).statusCode).toBe(403);
    res = await deleteReply(id);
    expect(res.statusCode).toBe(200);
    expect(res.json().comment.reply).toBeNull();
  });

  it('lets the author and managers delete, but not other students', async () => {
    const a = (await post({ body: 'a' })).json().comment.id;
    const b = (await post({ body: 'b' })).json().comment.id;
    expect((await remove(a, tokens.s2)).statusCode).toBe(403);
    expect((await remove(a)).statusCode).toBe(200);
    expect((await remove(b, tokens.instructor)).statusCode).toBe(200);
    expect((await remove('nope')).statusCode).toBe(404);
    expect(await prisma.lessonComment.count()).toBe(0);
  });

  it('reports commentCount in feedback and cascades on lesson delete', async () => {
    await post({ body: 'a' });
    await post({ body: 'b' }, tokens.s2);
    const fb = await app.inject({ method: 'GET', url: `/api/v1/lessons/${lessonId}/feedback`, headers: auth(tokens.s1) });
    expect(fb.json().feedback.commentCount).toBe(2);
    await prisma.lesson.delete({ where: { id: lessonId } });
    expect(await prisma.lessonComment.count()).toBe(0);
  });
});
