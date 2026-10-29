import { Op } from 'sequelize';
import { AppError } from '../utils/AppError.js';

// The only attributes a public submission may set. Everything else (id,
// status, timestamps) comes from model/database defaults.
export const CREATABLE_FIELDS = Object.freeze([
  'name',
  'email',
  'phone',
  'userType',
  'category',
  'message',
]);

function pickCreatable(input) {
  return Object.fromEntries(CREATABLE_FIELDS.map((field) => [field, input[field]]));
}

/**
 * @param {object} deps
 * @param {import('sequelize').Sequelize} deps.sequelize
 * @param {import('sequelize').ModelStatic<any>} deps.Inquiry
 * @param {number} deps.duplicateWindowMs  identical submissions within this window
 *   return the existing inquiry instead of creating another (0 disables)
 */
export function createInquiryService({ sequelize, Inquiry, duplicateWindowMs }) {
  /**
   * Stores a validated public submission. Resolves only after the transaction
   * has committed, so callers never report success for data that was not saved.
   *
   * @returns {Promise<{ inquiry: { id: string }, created: boolean }>}
   */
  async function createInquiry(input) {
    const values = pickCreatable(input);

    if (duplicateWindowMs <= 0) {
      const inquiry = await Inquiry.create(values, { fields: [...CREATABLE_FIELDS] });
      return { inquiry, created: true };
    }

    return sequelize.transaction(async (transaction) => {
      // Serialise identical submissions (double clicks, client retries) so the
      // check-then-insert below cannot race. The lock is held until commit.
      await sequelize.query('SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))', {
        replacements: { key: JSON.stringify(CREATABLE_FIELDS.map((field) => values[field])) },
        transaction,
      });

      const existing = await Inquiry.findOne({
        attributes: ['id'],
        where: {
          ...values,
          createdAt: { [Op.gte]: new Date(Date.now() - duplicateWindowMs) },
        },
        order: [['createdAt', 'DESC']],
        transaction,
      });
      if (existing) return { inquiry: existing, created: false };

      const inquiry = await Inquiry.create(values, { fields: [...CREATABLE_FIELDS], transaction });
      return { inquiry, created: true };
    });
  }

  /** Newest first; `id` breaks ties so pages are stable. */
  async function listInquiries({ page, pageSize }) {
    const { rows, count } = await Inquiry.findAndCountAll({
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return {
      inquiries: rows.map((row) => row.get({ plain: true })),
      meta: { page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) },
    };
  }

  async function findInquiryOrFail(id) {
    const inquiry = await Inquiry.findByPk(id);
    if (!inquiry) throw new AppError(404, 'NOT_FOUND', 'Inquiry not found');
    return inquiry;
  }

  async function getInquiry(id) {
    return (await findInquiryOrFail(id)).get({ plain: true });
  }

  async function updateInquiryStatus(id, status) {
    const inquiry = await findInquiryOrFail(id);
    if (inquiry.status !== status) {
      await inquiry.update({ status }, { fields: ['status'] });
    }
    return inquiry.get({ plain: true });
  }

  return { createInquiry, listInquiries, getInquiry, updateInquiryStatus };
}
