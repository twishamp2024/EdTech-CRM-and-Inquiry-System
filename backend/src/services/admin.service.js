import { UniqueConstraintError } from 'sequelize';
import { AppError } from '../utils/AppError.js';
import { hashPassword } from '../utils/password.js';
import { adminEmailSchema, validateNewPassword } from '../validators/auth.schema.js';

/**
 * Creates an admin account. Used by scripts/createAdmin.js; there is no HTTP
 * endpoint for it. Only the bcrypt hash is stored. Throws AppError with
 * code INVALID_ADMIN_INPUT (details listed) or ADMIN_EXISTS.
 *
 * @returns {Promise<{ id: string, email: string }>}
 */
export async function createAdminAccount({ Admin, email, password, saltRounds }) {
  const parsedEmail = adminEmailSchema.safeParse(email);
  const problems = [
    ...(parsedEmail.success ? [] : parsedEmail.error.issues.map((issue) => issue.message)),
    ...validateNewPassword(password, { email: parsedEmail.data }),
  ];
  if (problems.length) {
    throw new AppError(400, 'INVALID_ADMIN_INPUT', 'Admin details are invalid', {
      details: problems.map((message) => ({ message })),
    });
  }

  const normalisedEmail = parsedEmail.data;
  const duplicate = () =>
    new AppError(409, 'ADMIN_EXISTS', `An admin with the email ${normalisedEmail} already exists`);

  if (await Admin.findOne({ where: { email: normalisedEmail }, attributes: ['id'] })) {
    throw duplicate();
  }

  const passwordHash = await hashPassword(password, saltRounds);
  try {
    const admin = await Admin.create({ email: normalisedEmail, passwordHash });
    return { id: admin.id, email: admin.email };
  } catch (err) {
    // Two concurrent creations: the UNIQUE constraint decides.
    if (err instanceof UniqueConstraintError) throw duplicate();
    throw err;
  }
}
