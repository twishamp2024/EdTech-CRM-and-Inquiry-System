import { defineAdmin } from './Admin.js';
import { defineInquiry } from './Inquiry.js';

/**
 * Registers all models on a Sequelize instance. The schema itself is owned by
 * schema.sql — never call sequelize.sync() against a real database.
 */
export function initModels(sequelize) {
  const Admin = defineAdmin(sequelize);
  const Inquiry = defineInquiry(sequelize);
  return { Admin, Inquiry };
}
