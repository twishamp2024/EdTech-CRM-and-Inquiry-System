import { describe, expect, it, vi } from 'vitest';
import { createInquiryService } from '../../src/services/inquiry.service.js';

function serviceWith(groups) {
  const Inquiry = {
    findAll: vi.fn(async ({ group }) => groups[group[0]] ?? []),
  };
  const sequelize = { fn: (name, arg) => ({ fn: name, arg }), col: (name) => ({ col: name }) };
  return { Inquiry, service: createInquiryService({ sequelize, Inquiry, duplicateWindowMs: 0 }) };
}

describe('getInquiryStats', () => {
  it('aggregates with COUNT … GROUP BY, never loading rows', async () => {
    const { Inquiry, service } = serviceWith({});
    await service.getInquiryStats();

    expect(Inquiry.findAll).toHaveBeenCalledTimes(2);
    for (const [options] of Inquiry.findAll.mock.calls) {
      expect(options.raw).toBe(true);
      expect(options.group).toHaveLength(1);
      expect(options.attributes[1]).toEqual([{ fn: 'COUNT', arg: { col: 'id' } }, 'count']);
      expect(options).not.toHaveProperty('limit');
    }
  });

  it('zero-fills every status and category, converts counts to numbers, sums the total', async () => {
    const { service } = serviceWith({
      status: [
        { status: 'New', count: '7' },
        { status: 'Resolved', count: '2' },
      ],
      category: [{ category: 'Concert', count: '9' }],
    });
    expect(await service.getInquiryStats()).toEqual({
      total: 9,
      byStatus: { New: 7, 'In Progress': 0, Resolved: 2 },
      byCategory: { Scholarship: 0, Concert: 9, Admission: 0, 'General Query': 0 },
    });
  });

  it('reports zeros for an empty database', async () => {
    const { service } = serviceWith({});
    expect(await service.getInquiryStats()).toEqual({
      total: 0,
      byStatus: { New: 0, 'In Progress': 0, Resolved: 0 },
      byCategory: { Scholarship: 0, Concert: 0, Admission: 0, 'General Query': 0 },
    });
  });

  it('ignores values outside the allowed lists', async () => {
    const { service } = serviceWith({ status: [{ status: 'Archived', count: '4' }] });
    expect((await service.getInquiryStats()).total).toBe(0);
  });
});
