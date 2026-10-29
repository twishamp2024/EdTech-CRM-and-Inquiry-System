import { afterAll, describe, expect, it, vi } from 'vitest';
import { CATEGORIES, USER_TYPES } from '../../src/constants/inquiry.js';
import { buildInquiryWhere, escapeLike } from '../../src/utils/buildInquiryWhere.js';
import { listInquiriesQuerySchema } from '../../src/validators/inquiry.schema.js';
import { buildOfflineModels } from '../helpers/testApp.js';

const { sequelize, Inquiry } = buildOfflineModels();
afterAll(() => sequelize.close());

/**
 * The SQL `Inquiry.findAll` sends for these filters, captured instead of
 * executed, so attribute → column mapping is exactly as in production.
 */
async function sqlFor(filters) {
  let captured;
  const spy = vi.spyOn(sequelize, 'query').mockImplementation(async (sql) => {
    captured = sql;
    return [];
  });
  await Inquiry.findAll({ attributes: ['id'], where: buildInquiryWhere(filters) });
  spy.mockRestore();
  return captured;
}

/** SQL with every quoted literal blanked out: what remains is code, not data. */
const outsideLiterals = (sql) => sql.replace(/'(?:[^']|'')*'/g, "''");

describe('escapeLike', () => {
  it('escapes LIKE wildcards and the escape character', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
    expect(escapeLike('plain')).toBe('plain');
  });
});

describe('buildInquiryWhere', () => {
  it('returns no conditions without filters', async () => {
    expect(buildInquiryWhere({})).toEqual({});
    expect(await sqlFor({})).not.toMatch(/WHERE/);
  });

  it.each(CATEGORIES)('filters by category %s', async (category) => {
    expect(await sqlFor({ category })).toContain(`"category" = '${category}'`);
  });

  it.each(USER_TYPES)('filters by user type %s', async (userType) => {
    expect(await sqlFor({ userType })).toContain(`"user_type" = '${userType}'`);
  });

  it('searches name and phone case-insensitively', async () => {
    const sql = await sqlFor({ search: 'Asha' });
    expect(sql).toContain(`"name" ILIKE '%Asha%'`);
    expect(sql).toContain(`"phone" ILIKE '%Asha%'`);
    expect(sql).not.toContain('regexp_replace');
  });

  it('also compares digits-only phones when the search has 3+ digits', async () => {
    const sql = await sqlFor({ search: '98765 43210' });
    expect(sql).toContain(`regexp_replace("phone", '[^0-9]', '', 'g') LIKE '%9876543210%'`);
    expect(await sqlFor({ search: 'Room 12' })).not.toContain('regexp_replace');
  });

  it('treats wildcards in the search literally', async () => {
    // SQL text: ILIKE '%50\%\_%' (backslash is PostgreSQL's LIKE escape).
    expect(await sqlFor({ search: '50%_' })).toContain(String.raw`ILIKE '%50\%\_%'`);
  });

  it('never concatenates raw input: quotes are escaped as literals', async () => {
    const sql = await sqlFor({ search: "x'; DROP TABLE inquiries; --" });
    expect(sql).toContain(`'%x''; DROP TABLE inquiries; --%'`);
    expect(outsideLiterals(sql)).not.toMatch(/DROP|--/);
  });

  it('ANDs filters together and ORs the search columns', async () => {
    const sql = await sqlFor({
      category: 'Concert',
      userType: 'School',
      status: 'New',
      search: 'ravi',
    });
    expect(sql.replaceAll('"Inquiry".', '')).toMatch(
      /"category" = 'Concert' AND "user_type" = 'School' AND "status" = 'New' AND \("name" ILIKE '%ravi%' OR "phone" ILIKE '%ravi%'\)/,
    );
  });
});

describe('listInquiriesQuerySchema', () => {
  const parse = (query) => listInquiriesQuerySchema.safeParse(query);

  it('applies defaults: page 1, 20 per page, newest first', () => {
    expect(parse({}).data).toEqual({ page: 1, pageSize: 20, sortBy: 'createdAt', sortDir: 'desc' });
  });

  it('accepts every category and user type', () => {
    for (const category of CATEGORIES) expect(parse({ category }).success).toBe(true);
    for (const userType of USER_TYPES) expect(parse({ userType }).success).toBe(true);
  });

  it('treats blank filters as "no filter" and normalises the search', () => {
    expect(
      parse({ category: '', userType: ' ', search: '  ravi   kumar ', page: '' }).data,
    ).toEqual({
      page: 1,
      pageSize: 20,
      search: 'ravi kumar',
      sortBy: 'createdAt',
      sortDir: 'desc',
    });
  });

  it.each([
    [{ category: 'Sports' }, 'category'],
    [{ category: 'concert' }, 'category'],
    [{ userType: 'Teacher' }, 'userType'],
    [{ status: 'Closed' }, 'status'],
    [{ sortBy: 'email' }, 'sortBy'],
    [{ sortBy: 'password_hash' }, 'sortBy'],
    [{ sortDir: 'sideways' }, 'sortDir'],
    [{ pageSize: '101' }, 'pageSize'],
    [{ page: '0' }, 'page'],
    [{ search: 'x'.repeat(101) }, 'search'],
    [{ search: 'a\u0000b' }, 'search'],
    [{ category: ['Concert', 'Admission'] }, 'category'],
    [{ unknown: 'x' }, ''],
  ])('rejects %o', (query, field) => {
    const result = parse(query);
    expect(result.success).toBe(false);
    expect(result.error.issues[0].path.join('.')).toBe(field);
  });
});
