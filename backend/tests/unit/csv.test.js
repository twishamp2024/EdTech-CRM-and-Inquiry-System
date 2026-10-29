import { describe, expect, it } from 'vitest';
import { csvField, neutralizeFormula, toCsv, UTF8_BOM } from '../../src/utils/csv.js';
import {
  exportFilename,
  INQUIRY_EXPORT_ATTRIBUTES,
  INQUIRY_EXPORT_COLUMNS,
  inquiriesToCsv,
} from '../../src/utils/inquiryCsv.js';
import { parseCsv } from '../helpers/csv.js';

describe('csvField', () => {
  it.each([
    ['plain', '"plain"'],
    ['a,b', '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ['line 1\nline 2', '"line 1\nline 2"'],
    ['line 1\r\nline 2', '"line 1\r\nline 2"'],
    ['', '""'],
    [null, '""'],
    [undefined, '""'],
    [42, '"42"'],
    [new Date('2026-10-01T12:00:00Z'), '"2026-10-01T12:00:00.000Z"'],
    [new Date('nope'), '""'],
  ])('encodes %j as %j', (value, expected) => {
    expect(csvField(value)).toBe(expected);
  });
});

describe('spreadsheet formula injection', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['=HYPERLINK("http://evil.example","click")', `'=HYPERLINK("http://evil.example","click")`],
    ['+cmd|" /C calc"!A0', `'+cmd|" /C calc"!A0`],
    ['-2+3', "'-2+3"],
    ['@SUM(A1:A2)', "'@SUM(A1:A2)"],
    ['\t=1+1', "'\t=1+1"],
    ['\r=1+1', "'\r=1+1"],
    ['  =1+1', "'  =1+1"],
    ['+91 98765 43210', "'+91 98765 43210"],
  ])('neutralises %j', (input, expected) => {
    expect(neutralizeFormula(input)).toBe(expected);
  });

  it.each(['Asha Verma', 'asha@example.com', 'a=b', 'x-y', 'email@domain', '(555) 010-0000'])(
    'leaves %j alone',
    (input) => {
      expect(neutralizeFormula(input)).toBe(input);
    },
  );

  it('neutralises inside the quoted field, keeping the value readable', () => {
    expect(csvField('=1+"2"')).toBe(`"'=1+""2"""`);
  });

  it('does not alter generated values such as dates', () => {
    expect(csvField(new Date('2026-01-02T03:04:05Z'))).toBe('"2026-01-02T03:04:05.000Z"');
  });
});

describe('toCsv', () => {
  it('adds a UTF-8 BOM, a header row and CRLF line endings', () => {
    const csv = toCsv(
      [
        { header: 'A', value: (row) => row.a },
        { header: 'B', value: (row) => row.b },
      ],
      [
        { a: 'x', b: 'y, z' },
        { a: 'Zoë', b: 'multi\nline' },
      ],
    );
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv).toBe(`${UTF8_BOM}"A","B"\r\n"x","y, z"\r\n"Zoë","multi\nline"\r\n`);
    expect(parseCsv(csv)).toEqual([
      ['A', 'B'],
      ['x', 'y, z'],
      ['Zoë', 'multi\nline'],
    ]);
  });

  it('produces just the header for no rows', () => {
    expect(parseCsv(toCsv([{ header: 'A', value: () => 1 }], []))).toEqual([['A']]);
  });
});

describe('inquiry export format', () => {
  it('has readable headers and only inquiry fields', () => {
    expect(INQUIRY_EXPORT_COLUMNS.map((column) => column.header)).toEqual([
      'Name',
      'Phone',
      'Email',
      'User Type',
      'Category',
      'Status',
      'Submitted (UTC)',
      'Last updated (UTC)',
      'Message',
      'Reference ID',
    ]);
    expect(INQUIRY_EXPORT_ATTRIBUTES.join()).not.toMatch(/password|hash|token|secret/i);
  });

  it('round-trips a hostile record safely', () => {
    const csv = inquiriesToCsv([
      {
        id: 'abc',
        name: '=IMPORTXML("http://evil.example")',
        phone: '+1 (555) 010-0000',
        email: 'x@example.com',
        userType: 'Parent',
        category: 'Concert',
        status: 'New',
        createdAt: new Date('2026-10-01T12:00:00Z'),
        updatedAt: new Date('2026-10-02T12:00:00Z'),
        message: 'Line one, with comma\nLine "two"',
        passwordHash: '$2b$12$shouldneverappear',
      },
    ]);
    const [, row] = parseCsv(csv);
    expect(row).toEqual([
      `'=IMPORTXML("http://evil.example")`,
      "'+1 (555) 010-0000",
      'x@example.com',
      'Parent',
      'Concert',
      'New',
      '2026-10-01T12:00:00.000Z',
      '2026-10-02T12:00:00.000Z',
      'Line one, with comma\nLine "two"',
      'abc',
    ]);
    expect(csv).not.toContain('shouldneverappear');
  });

  it('names the file after the export date', () => {
    expect(exportFilename(new Date('2026-10-30T23:00:00Z'))).toBe('inquiries-2026-10-30.csv');
  });
});
