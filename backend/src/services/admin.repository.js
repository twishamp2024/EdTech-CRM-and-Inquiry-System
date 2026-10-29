/**
 * The admin lookups the auth service needs, backed by the Sequelize model.
 * Kept behind this small interface so the auth service can be tested with an
 * in-memory implementation.
 */
export function createAdminRepository(Admin) {
  return {
    /** Includes `passwordHash` — only for verifying a login. */
    async findByEmailWithPassword(email) {
      const admin = await Admin.scope('withPassword').findOne({ where: { email } });
      return admin && { id: admin.id, email: admin.email, passwordHash: admin.passwordHash };
    },

    /** Never includes `passwordHash` (the model's default scope excludes it). */
    async findById(id) {
      const admin = await Admin.findByPk(id);
      return admin && { id: admin.id, email: admin.email };
    },
  };
}
