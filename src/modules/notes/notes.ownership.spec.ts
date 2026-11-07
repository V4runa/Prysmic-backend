import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { JwtStrategy } from '../auth/jwt.strategy';
import { Tag } from '../tags/tags.entity';
import { TagsService } from '../tags/tags.service';
import { User } from '../users/user.entity';
import { UserService } from '../users/user.service';
import { NoteAttachment } from './note-attachment.entity';
import { NoteAttachmentsController } from './note-attachments.controller';
import { NoteAttachmentsService } from './note-attachments.service';
import { Note } from './notes.entity';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

/* The in-memory repositories and supertest responses are intentionally loose.
   The assertions below are the ownership contract; these rules only add noise. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/require-await */

/**
 * Local in-memory stand-in for the note/tag/user/attachment repositories.
 * Two synthetic users only. No network, no Postgres, no production data.
 * Find/delete honor the criteria the service actually passes, so a missing
 * userId filter shows up as a cross-user read or write.
 */

const TEST_JWT_SECRET = 'test-only-notes-ownership-secret';

const USER_A_ID = 101;
const USER_B_ID = 202;
const PASSWORD_A = 'synthetic-password-hash-a';
const PASSWORD_B = 'synthetic-password-hash-b';

const TAG_A_ID = 11;
const TAG_B_ID = 22;

const NOTE_A_ID = 1001;
const NOTE_B_ID = 2002;
const TITLE_A = 'note-secret-alpha-title';
const TITLE_B = 'note-secret-beta-title';
const BODY_A = '<p>alpha private body</p>';
const BODY_B = '<p>beta private body</p>';

const ATTACHMENT_A_ID = 501;
const ATTACHMENT_A_BYTES = Buffer.from('alpha-private-attachment-bytes');
const ATTACHMENT_B_ID = 502;
const ATTACHMENT_B_BYTES = Buffer.from('beta-private-attachment-bytes');

type StoredUser = {
  id: number;
  username: string;
  email: string;
  password: string;
};

type StoredTag = {
  id: number;
  name: string;
  color?: string;
  user: { id: number };
};

type StoredNote = {
  id: number;
  title: string;
  content: string;
  userId: number;
  tags: StoredTag[];
  isPinned: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  user?: StoredUser;
};

type StoredAttachment = {
  id: number;
  noteId: number;
  userId: number;
  filename: string;
  mimeType: string;
  size: number;
  data: Buffer;
  createdAt: Date;
};

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function idList(value: unknown): number[] | undefined {
  if (value == null) return undefined;
  if (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    (value as { type?: string }).type === 'in'
  ) {
    return ((value as { value: unknown[] }).value ?? []).map((entry) =>
      Number(entry),
    );
  }
  const single = asNumber(value);
  return single === undefined ? undefined : [single];
}

function createMemory() {
  const users: StoredUser[] = [
    {
      id: USER_A_ID,
      username: 'synth-owner-a',
      email: 'synth-a@example.test',
      password: PASSWORD_A,
    },
    {
      id: USER_B_ID,
      username: 'synth-owner-b',
      email: 'synth-b@example.test',
      password: PASSWORD_B,
    },
  ];

  const tags: StoredTag[] = [
    { id: TAG_A_ID, name: 'alpha-tag', color: 'cyan', user: { id: USER_A_ID } },
    { id: TAG_B_ID, name: 'beta-tag', color: 'rose', user: { id: USER_B_ID } },
  ];

  const notes: StoredNote[] = [
    {
      id: NOTE_A_ID,
      title: TITLE_A,
      content: BODY_A,
      userId: USER_A_ID,
      tags: [tags[0]],
      isPinned: false,
      isArchived: false,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
    {
      id: NOTE_B_ID,
      title: TITLE_B,
      content: BODY_B,
      userId: USER_B_ID,
      tags: [tags[1]],
      isPinned: false,
      isArchived: false,
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
      updatedAt: new Date('2026-01-03T00:00:00.000Z'),
    },
  ];

  const attachments: StoredAttachment[] = [
    {
      id: ATTACHMENT_A_ID,
      noteId: NOTE_A_ID,
      userId: USER_A_ID,
      filename: 'alpha-private.txt',
      mimeType: 'text/plain',
      size: ATTACHMENT_A_BYTES.length,
      data: ATTACHMENT_A_BYTES,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    },
    {
      id: ATTACHMENT_B_ID,
      noteId: NOTE_B_ID,
      userId: USER_B_ID,
      filename: 'beta-private.txt',
      mimeType: 'text/plain',
      size: ATTACHMENT_B_BYTES.length,
      data: ATTACHMENT_B_BYTES,
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
    },
  ];

  let noteSeq = 3000;
  let attachmentSeq = 8000;

  const noteRepo = {
    create(partial: Partial<StoredNote>): StoredNote {
      return {
        id: 0,
        title: '',
        content: '',
        userId: 0,
        tags: [],
        isPinned: false,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...partial,
      };
    },
    async save(note: StoredNote): Promise<StoredNote> {
      if (!note.id) note.id = ++noteSeq;
      const existing = notes.find((row) => row.id === note.id);
      if (existing) {
        Object.assign(existing, note);
        return existing;
      }
      notes.push(note);
      return note;
    },
    async findOne(options: {
      where?: { id?: unknown; userId?: unknown };
      relations?: string[];
    }): Promise<StoredNote | null> {
      const id = asNumber(options?.where?.id);
      const userId =
        options?.where && 'userId' in options.where
          ? asNumber(options.where.userId)
          : undefined;
      const found = notes.find(
        (row) =>
          row.id === id && (userId === undefined || row.userId === userId),
      );
      if (!found) return null;
      const copy: StoredNote = {
        ...found,
        tags: found.tags.map((tag) => ({ ...tag, user: { ...tag.user } })),
      };
      if (options.relations?.includes('user')) {
        const owner = users.find((user) => user.id === found.userId);
        if (owner) copy.user = { ...owner };
      }
      return copy;
    },
    async delete(
      criteria: number | string | { id?: unknown; userId?: unknown },
    ): Promise<{ affected: number; raw: unknown[] }> {
      const id =
        typeof criteria === 'object'
          ? asNumber(criteria.id)
          : asNumber(criteria);
      const userId =
        typeof criteria === 'object' &&
        criteria !== null &&
        'userId' in criteria
          ? asNumber(criteria.userId)
          : undefined;
      const before = notes.length;
      for (let i = notes.length - 1; i >= 0; i -= 1) {
        const row = notes[i];
        if (row.id !== id) continue;
        if (userId !== undefined && row.userId !== userId) continue;
        notes.splice(i, 1);
      }
      return { affected: before - notes.length, raw: [] };
    },
    createQueryBuilder() {
      const state: { userId?: number; take?: number; skip?: number } = {};
      const qb = {
        leftJoinAndSelect: () => qb,
        loadRelationCountAndMap: () => qb,
        where: (_sql: string, params?: { userId?: unknown }) => {
          if (params && 'userId' in params)
            state.userId = asNumber(params.userId);
          return qb;
        },
        orderBy: () => qb,
        take: (n: number) => {
          state.take = n;
          return qb;
        },
        skip: (n: number) => {
          state.skip = n;
          return qb;
        },
        getMany: async () => {
          let rows = notes.filter(
            (row) => state.userId === undefined || row.userId === state.userId,
          );
          rows = [...rows].sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
          );
          const skip = state.skip ?? 0;
          rows = rows.slice(skip);
          if (state.take !== undefined) rows = rows.slice(0, state.take);
          return rows.map((row) => ({
            ...row,
            tags: row.tags.map((tag) => ({ ...tag, user: { ...tag.user } })),
            attachmentCount: attachments.filter(
              (item) => item.noteId === row.id,
            ).length,
          }));
        },
      };
      return qb;
    },
  };

  const tagRepo = {
    async find(options?: {
      where?: {
        id?: unknown;
        name?: string;
        user?: { id?: unknown };
      };
    }): Promise<StoredTag[]> {
      const where = options?.where ?? {};
      const ids = idList(where.id);
      const ownerId =
        where.user && 'id' in where.user ? asNumber(where.user.id) : undefined;
      return tags
        .filter((tag) => (ids ? ids.includes(tag.id) : true))
        .filter((tag) =>
          ownerId === undefined ? true : tag.user.id === ownerId,
        )
        .filter((tag) => (where.name ? tag.name === where.name : true))
        .map((tag) => ({ ...tag, user: { ...tag.user } }));
    },
    async findOne(options?: {
      where?: { id?: unknown; name?: string; user?: { id?: unknown } };
    }): Promise<StoredTag | null> {
      const rows = await tagRepo.find(options);
      return rows[0] ?? null;
    },
  };

  const userRepo = {
    async findOne(options?: {
      where?: { id?: unknown; email?: string; username?: string };
    }): Promise<StoredUser | null> {
      const where = options?.where ?? {};
      const id = asNumber(where.id);
      const found = users.find((user) => {
        if (id !== undefined && user.id !== id) return false;
        if (where.email && user.email !== where.email) return false;
        if (where.username && user.username !== where.username) return false;
        return id !== undefined || !!where.email || !!where.username;
      });
      return found ? { ...found } : null;
    },
  };

  const attachmentRepo = {
    create(partial: Partial<StoredAttachment>): StoredAttachment {
      return {
        id: 0,
        noteId: 0,
        userId: 0,
        filename: '',
        mimeType: '',
        size: 0,
        data: Buffer.alloc(0),
        createdAt: new Date(),
        ...partial,
      };
    },
    async save(row: StoredAttachment): Promise<StoredAttachment> {
      if (!row.id) row.id = ++attachmentSeq;
      const existing = attachments.find((item) => item.id === row.id);
      if (existing) {
        Object.assign(existing, row);
        return existing;
      }
      attachments.push(row);
      return row;
    },
    async find(options?: {
      where?: { noteId?: unknown };
    }): Promise<Omit<StoredAttachment, 'data'>[]> {
      const noteId = asNumber(options?.where?.noteId);
      return attachments
        .filter((row) => noteId === undefined || row.noteId === noteId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((row) => ({
          id: row.id,
          noteId: row.noteId,
          userId: row.userId,
          filename: row.filename,
          mimeType: row.mimeType,
          size: row.size,
          createdAt: row.createdAt,
        }));
    },
    async count(options?: { where?: { noteId?: unknown } }): Promise<number> {
      const noteId = asNumber(options?.where?.noteId);
      return attachments.filter(
        (row) => noteId === undefined || row.noteId === noteId,
      ).length;
    },
    async delete(criteria: {
      id?: unknown;
      noteId?: unknown;
    }): Promise<{ affected: number }> {
      const id = asNumber(criteria.id);
      const noteId = asNumber(criteria.noteId);
      const before = attachments.length;
      for (let i = attachments.length - 1; i >= 0; i -= 1) {
        const row = attachments[i];
        if (id !== undefined && row.id !== id) continue;
        if (noteId !== undefined && row.noteId !== noteId) continue;
        attachments.splice(i, 1);
      }
      return { affected: before - attachments.length };
    },
    createQueryBuilder() {
      const state: { id?: number; noteId?: number } = {};
      const qb = {
        addSelect: () => qb,
        where: (_sql: string, params?: { attachmentId?: unknown }) => {
          if (params && 'attachmentId' in params) {
            state.id = asNumber(params.attachmentId);
          }
          return qb;
        },
        andWhere: (_sql: string, params?: { noteId?: unknown }) => {
          if (params && 'noteId' in params)
            state.noteId = asNumber(params.noteId);
          return qb;
        },
        getOne: async () => {
          const found = attachments.find(
            (row) =>
              (state.id === undefined || row.id === state.id) &&
              (state.noteId === undefined || row.noteId === state.noteId),
          );
          return found ? { ...found, data: Buffer.from(found.data) } : null;
        },
      };
      return qb;
    },
  };

  return { noteRepo, tagRepo, userRepo, attachmentRepo, notes, attachments };
}

describe('Note ownership (controller + service)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    const memory = createMemory();
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [() => ({ JWT_SECRET: TEST_JWT_SECRET })],
        }),
        PassportModule,
      ],
      controllers: [NotesController, NoteAttachmentsController],
      providers: [
        NotesService,
        NoteAttachmentsService,
        TagsService,
        UserService,
        JwtStrategy,
        { provide: getRepositoryToken(Note), useValue: memory.noteRepo },
        { provide: getRepositoryToken(Tag), useValue: memory.tagRepo },
        { provide: getRepositoryToken(User), useValue: memory.userRepo },
        {
          provide: getRepositoryToken(NoteAttachment),
          useValue: memory.attachmentRepo,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const jwt = new JwtService({
      secret: TEST_JWT_SECRET,
      signOptions: { expiresIn: '1h' },
    });
    tokenA = jwt.sign({
      sub: USER_A_ID,
      username: 'synth-owner-a',
      email: 'synth-a@example.test',
    });
    tokenB = jwt.sign({
      sub: USER_B_ID,
      username: 'synth-owner-b',
      email: 'synth-b@example.test',
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  const server = () => app.getHttpServer();

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('rejects unauthenticated note and attachment calls with 401', async () => {
    const cases: Array<[string, string]> = [
      ['get', `/notes/${NOTE_A_ID}`],
      ['put', `/notes/${NOTE_A_ID}`],
      ['delete', `/notes/${NOTE_A_ID}`],
      ['get', `/notes/user/${USER_A_ID}`],
      ['post', '/notes'],
      ['get', `/notes/${NOTE_A_ID}/attachments`],
      ['get', `/notes/${NOTE_A_ID}/attachments/${ATTACHMENT_A_ID}/raw`],
      ['delete', `/notes/${NOTE_A_ID}/attachments/${ATTACHMENT_A_ID}`],
    ];

    for (const [method, url] of cases) {
      const response = await request(server())[method](url);
      expect(response.status).toBe(401);
    }

    const bogus = await request(server())
      .get(`/notes/${NOTE_A_ID}`)
      .set('Authorization', 'Bearer not-a-real-token');
    expect(bogus.status).toBe(401);
    expect(JSON.stringify(bogus.body)).not.toContain(TITLE_A);
  });

  it('lets the owner list, read, create, update, and delete their own note', async () => {
    const listed = await request(server())
      .get(`/notes/user/${USER_A_ID}`)
      .set(auth(tokenA));
    expect(listed.status).toBe(200);
    expect(
      listed.body.some((note: { title: string }) => note.title === TITLE_A),
    ).toBe(true);
    expect(
      listed.body.some((note: { title: string }) => note.title === TITLE_B),
    ).toBe(false);
    const listedAlpha = listed.body.find(
      (note: { id: number }) => Number(note.id) === NOTE_A_ID,
    );
    expect(listedAlpha.attachmentCount).toBe(1);
    expect(JSON.stringify(listed.body)).not.toContain(PASSWORD_A);
    expect(JSON.stringify(listed.body)).not.toContain(BODY_B);

    const created = await request(server())
      .post('/notes')
      .set(auth(tokenA))
      .send({
        title: 'owner-created-title',
        content: '<p>mine</p>',
        tagIds: [TAG_A_ID],
      });
    expect(created.status).toBe(201);
    expect(created.body.userId).toBe(USER_A_ID);
    expect(created.body.tags.map((tag: { id: number }) => tag.id)).toEqual([
      TAG_A_ID,
    ]);
    const createdId = created.body.id;

    const read = await request(server())
      .get(`/notes/${createdId}`)
      .set(auth(tokenA));
    expect(read.status).toBe(200);
    expect(read.body.title).toBe('owner-created-title');
    expect(read.body.content).toBe('<p>mine</p>');
    expect(read.body.userId).toBe(USER_A_ID);

    const updated = await request(server())
      .put(`/notes/${createdId}`)
      .set(auth(tokenA))
      .send({
        title: 'owner-updated-title',
        content: '<p>updated</p>',
        tagIds: [TAG_A_ID],
        isPinned: true,
      });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe('owner-updated-title');
    expect(updated.body.userId).toBe(USER_A_ID);
    expect(updated.body.isPinned).toBe(true);
    expect(updated.body.tags.map((tag: { name: string }) => tag.name)).toEqual([
      'alpha-tag',
    ]);

    const removed = await request(server())
      .delete(`/notes/${createdId}`)
      .set(auth(tokenA));
    expect(removed.status).toBe(200);

    const afterDelete = await request(server())
      .get(`/notes/${createdId}`)
      .set(auth(tokenA));
    expect(afterDelete.status).toBe(404);
    expect(afterDelete.body.message).toBe('Note not found');
  });

  it('does not embed the account password on create or read', async () => {
    const created = await request(server())
      .post('/notes')
      .set(auth(tokenA))
      .send({
        title: 'no-password-in-body',
        content: '<p>safe</p>',
        tagIds: [],
      });
    expect(created.status).toBe(201);
    expect(created.body.user).toBeUndefined();
    expect(JSON.stringify(created.body)).not.toContain(PASSWORD_A);

    const read = await request(server())
      .get(`/notes/${NOTE_A_ID}`)
      .set(auth(tokenA));
    expect(read.status).toBe(200);
    expect(read.body.title).toBe(TITLE_A);
    expect(read.body.user).toBeUndefined();
    expect(JSON.stringify(read.body)).not.toContain(PASSWORD_A);
    expect(JSON.stringify(read.body)).not.toContain(PASSWORD_B);
  });

  it('gives another user the same 404 as a missing note for read, update, and delete', async () => {
    const missingRead = await request(server())
      .get('/notes/999999')
      .set(auth(tokenA));
    const foreignRead = await request(server())
      .get(`/notes/${NOTE_B_ID}`)
      .set(auth(tokenA));
    expect(foreignRead.status).toBe(404);
    expect(foreignRead.body).toEqual(missingRead.body);
    expect(foreignRead.body.message).toBe('Note not found');
    expect(JSON.stringify(foreignRead.body)).not.toContain(TITLE_B);
    expect(JSON.stringify(foreignRead.body)).not.toContain(BODY_B);

    const created = await request(server())
      .post('/notes')
      .set(auth(tokenA))
      .send({
        title: 'keep-me',
        content: '<p>still here</p>',
        tagIds: [TAG_A_ID],
      });
    const createdId = created.body.id;

    const missingUpdate = await request(server())
      .put('/notes/999999')
      .set(auth(tokenB))
      .send({ title: 'nope', content: '<p>nope</p>', tagIds: [] });
    const foreignUpdate = await request(server())
      .put(`/notes/${createdId}`)
      .set(auth(tokenB))
      .send({ title: 'taken', content: '<p>taken</p>', tagIds: [TAG_B_ID] });
    expect(foreignUpdate.status).toBe(404);
    expect(foreignUpdate.body).toEqual(missingUpdate.body);
    expect(JSON.stringify(foreignUpdate.body)).not.toContain('still here');

    const stillThere = await request(server())
      .get(`/notes/${createdId}`)
      .set(auth(tokenA));
    expect(stillThere.status).toBe(200);
    expect(stillThere.body.title).toBe('keep-me');
    expect(stillThere.body.userId).toBe(USER_A_ID);

    const missingDelete = await request(server())
      .delete('/notes/999998')
      .set(auth(tokenB));
    const foreignDelete = await request(server())
      .delete(`/notes/${createdId}`)
      .set(auth(tokenB));
    expect(foreignDelete.status).toBe(404);
    expect(foreignDelete.body).toEqual(missingDelete.body);

    const afterAttack = await request(server())
      .get(`/notes/${createdId}`)
      .set(auth(tokenA));
    expect(afterAttack.status).toBe(200);
    expect(afterAttack.body.title).toBe('keep-me');
  });

  it('does not list another user notes when the path user id is not the token subject', async () => {
    const foreignList = await request(server())
      .get(`/notes/user/${USER_B_ID}`)
      .set(auth(tokenA));
    expect(foreignList.status).toBe(404);
    expect(foreignList.body.message).toBe('Note not found');
    expect(JSON.stringify(foreignList.body)).not.toContain(TITLE_B);
    expect(JSON.stringify(foreignList.body)).not.toContain(BODY_B);

    const ownList = await request(server())
      .get(`/notes/user/${USER_A_ID}`)
      .set(auth(tokenA));
    expect(ownList.status).toBe(200);
    expect(
      ownList.body.every(
        (note: { userId: number }) => note.userId === USER_A_ID,
      ),
    ).toBe(true);
  });

  it('ignores a body userId and will not move a note to someone else', async () => {
    const created = await request(server())
      .post('/notes')
      .set(auth(tokenA))
      .send({
        title: 'stays-with-a',
        content: '<p>owned</p>',
        tagIds: [],
        userId: USER_B_ID,
      });
    expect(created.status).toBe(400);

    const listedForB = await request(server())
      .get(`/notes/user/${USER_B_ID}`)
      .set(auth(tokenB));
    expect(
      listedForB.body?.some?.(
        (note: { title: string }) => note.title === 'stays-with-a',
      ) ?? false,
    ).toBe(false);

    const owned = await request(server())
      .post('/notes')
      .set(auth(tokenA))
      .send({ title: 'stays-with-a', content: '<p>owned</p>', tagIds: [] });
    expect(owned.status).toBe(201);
    const ownedId = owned.body.id;

    const transferred = await request(server())
      .put(`/notes/${ownedId}`)
      .set(auth(tokenA))
      .send({
        title: 'renamed-by-body-userid',
        content: '<p>owned</p>',
        tagIds: [],
        userId: USER_B_ID,
      });
    expect(transferred.status).toBe(400);

    const read = await request(server())
      .get(`/notes/${ownedId}`)
      .set(auth(tokenA));
    expect(read.status).toBe(200);
    expect(read.body.userId).toBe(USER_A_ID);
    expect(read.body.title).toBe('stays-with-a');

    const asOther = await request(server())
      .get(`/notes/${ownedId}`)
      .set(auth(tokenB));
    expect(asOther.status).toBe(404);
  });

  it('does not attach another user private tag by id', async () => {
    const created = await request(server())
      .post('/notes')
      .set(auth(tokenA))
      .send({
        title: 'tag-guard',
        content: '<p>tags</p>',
        tagIds: [TAG_B_ID],
      });
    expect(created.status).toBe(400);
    expect(created.body.message).toBe(
      'Some of the provided tag IDs do not exist',
    );
    expect(JSON.stringify(created.body)).not.toMatch(/beta-tag|another user/i);

    const owned = await request(server())
      .post('/notes')
      .set(auth(tokenA))
      .send({ title: 'tag-guard', content: '<p>tags</p>', tagIds: [TAG_A_ID] });
    expect(owned.status).toBe(201);

    const mixed = await request(server())
      .put(`/notes/${owned.body.id}`)
      .set(auth(tokenA))
      .send({
        title: 'tag-guard',
        content: '<p>tags</p>',
        tagIds: [TAG_A_ID, TAG_B_ID],
      });
    expect(mixed.status).toBe(400);
    expect(mixed.body.message).toBe(
      'Some of the provided tag IDs do not exist',
    );

    const read = await request(server())
      .get(`/notes/${owned.body.id}`)
      .set(auth(tokenA));
    expect(read.body.tags.map((tag: { id: number }) => tag.id)).toEqual([
      TAG_A_ID,
    ]);
    expect(JSON.stringify(read.body)).not.toContain('beta-tag');
  });

  it('lets the owner manage attachments and hides them from everyone else', async () => {
    const ownList = await request(server())
      .get(`/notes/${NOTE_A_ID}/attachments`)
      .set(auth(tokenA));
    expect(ownList.status).toBe(200);
    expect(ownList.body.map((item: { id: number }) => item.id)).toContain(
      ATTACHMENT_A_ID,
    );
    expect(JSON.stringify(ownList.body)).not.toContain(
      'alpha-private-attachment-bytes',
    );

    const raw = await request(server())
      .get(`/notes/${NOTE_A_ID}/attachments/${ATTACHMENT_A_ID}/raw`)
      .set(auth(tokenA))
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(raw.status).toBe(200);
    expect(Buffer.compare(raw.body as Buffer, ATTACHMENT_A_BYTES)).toBe(0);

    const uploaded = await request(server())
      .post(`/notes/${NOTE_A_ID}/attachments`)
      .set(auth(tokenA))
      .attach('file', Buffer.from('owned-upload-bytes'), {
        filename: 'owned-upload.txt',
        contentType: 'text/plain',
      });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.filename).toBe('owned-upload.txt');
    const uploadedId = uploaded.body.id;

    const missingNote = await request(server())
      .get('/notes/999999/attachments')
      .set(auth(tokenB));
    const foreignList = await request(server())
      .get(`/notes/${NOTE_A_ID}/attachments`)
      .set(auth(tokenB));
    expect(foreignList.status).toBe(404);
    expect(foreignList.body).toEqual(missingNote.body);
    expect(foreignList.body.message).toBe('Note not found');
    expect(JSON.stringify(foreignList.body)).not.toContain('alpha-private');
    expect(JSON.stringify(foreignList.body)).not.toContain('owned-upload');

    const foreignRaw = await request(server())
      .get(`/notes/${NOTE_A_ID}/attachments/${ATTACHMENT_A_ID}/raw`)
      .set(auth(tokenB));
    expect(foreignRaw.status).toBe(404);
    expect(foreignRaw.body.message).toBe('Note not found');
    expect(JSON.stringify(foreignRaw.body)).not.toContain(
      'alpha-private-attachment-bytes',
    );

    const foreignUpload = await request(server())
      .post(`/notes/${NOTE_A_ID}/attachments`)
      .set(auth(tokenB))
      .attach('file', Buffer.from('intruder'), {
        filename: 'intruder.txt',
        contentType: 'text/plain',
      });
    expect(foreignUpload.status).toBe(404);
    expect(foreignUpload.body.message).toBe('Note not found');

    const foreignDelete = await request(server())
      .delete(`/notes/${NOTE_A_ID}/attachments/${uploadedId}`)
      .set(auth(tokenB));
    expect(foreignDelete.status).toBe(404);

    const stillListed = await request(server())
      .get(`/notes/${NOTE_A_ID}/attachments`)
      .set(auth(tokenA));
    expect(
      stillListed.body.map((item: { filename: string }) => item.filename),
    ).toEqual(
      expect.arrayContaining(['alpha-private.txt', 'owned-upload.txt']),
    );
    expect(
      stillListed.body.map((item: { filename: string }) => item.filename),
    ).not.toContain('intruder.txt');

    const wrongAttachment = await request(server())
      .get(`/notes/${NOTE_A_ID}/attachments/${ATTACHMENT_B_ID}/raw`)
      .set(auth(tokenA));
    expect(wrongAttachment.status).toBe(404);
    expect(wrongAttachment.body.message).toBe('Attachment not found');
    expect(JSON.stringify(wrongAttachment.body)).not.toContain(
      'beta-private-attachment-bytes',
    );

    const removed = await request(server())
      .delete(`/notes/${NOTE_A_ID}/attachments/${uploadedId}`)
      .set(auth(tokenA));
    expect(removed.status).toBe(200);

    const after = await request(server())
      .get(`/notes/${NOTE_A_ID}/attachments`)
      .set(auth(tokenA));
    expect(after.body.map((item: { id: number }) => item.id)).not.toContain(
      uploadedId,
    );
  });
});
