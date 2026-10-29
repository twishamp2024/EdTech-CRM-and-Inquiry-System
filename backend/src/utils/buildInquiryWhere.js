import { Op, Sequelize } from 'sequelize';

/** Searches with at least this many digits also match phones ignoring formatting. */
export const MIN_SEARCH_DIGITS = 3;

/**
 * Escapes LIKE/ILIKE wildcards so user input matches literally ("50%" finds
 * "50%", not everything starting with "50"). PostgreSQL's default LIKE escape
 * character is the backslash.
 */
export function escapeLike(value) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Turns validated list filters into a Sequelize `where` clause.
 *
 *   category AND userType AND status AND (name ILIKE term OR phone ILIKE term
 *                                        OR digits(phone) LIKE digits(term))
 *
 * Every value goes through Sequelize as an escaped literal; no user input is
 * concatenated into SQL. Pure function, unit-tested without a database.
 */
export function buildInquiryWhere({ category, userType, status, search } = {}) {
  const conditions = [];
  if (category) conditions.push({ category });
  if (userType) conditions.push({ userType });
  if (status) conditions.push({ status });

  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    const matches = [{ name: { [Op.iLike]: pattern } }, { phone: { [Op.iLike]: pattern } }];

    // "98765 43210" should find "+91 98765-43210": compare digits only.
    const digits = search.replace(/\D/g, '');
    if (digits.length >= MIN_SEARCH_DIGITS) {
      matches.push(
        Sequelize.where(Sequelize.fn('regexp_replace', Sequelize.col('phone'), '[^0-9]', '', 'g'), {
          [Op.like]: `%${digits}%`,
        }),
      );
    }
    conditions.push({ [Op.or]: matches });
  }

  return conditions.length ? { [Op.and]: conditions } : {};
}
