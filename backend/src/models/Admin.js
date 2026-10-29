import { DataTypes } from 'sequelize';
import { FIELD_LIMITS } from '../constants/inquiry.js';

/**
 * Maps to public.admins (schema.sql). The password hash is excluded from
 * queries by default; use `Admin.scope('withPassword')` when verifying a login.
 */
export function defineAdmin(sequelize) {
  const Admin = sequelize.define(
    'Admin',
    {
      id: {
        type: DataTypes.UUID,
        field: 'id',
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      email: {
        type: DataTypes.TEXT,
        field: 'email',
        allowNull: false,
        unique: true,
        set(value) {
          this.setDataValue(
            'email',
            typeof value === 'string' ? value.trim().toLowerCase() : value,
          );
        },
        validate: {
          isEmail: true,
          len: [3, FIELD_LIMITS.email.max],
        },
      },
      passwordHash: {
        type: DataTypes.TEXT,
        field: 'password_hash',
        allowNull: false,
        validate: {
          is: /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/,
        },
      },
      createdAt: {
        type: DataTypes.DATE,
        field: 'created_at',
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'admins',
      timestamps: true,
      updatedAt: false,
      defaultScope: { attributes: { exclude: ['passwordHash'] } },
      scopes: { withPassword: {} },
    },
  );

  // Defence in depth: never serialise the hash, even if it was loaded.
  Admin.prototype.toJSON = function toJSON() {
    const { passwordHash: _omit, ...values } = this.get({ plain: true });
    return values;
  };

  return Admin;
}
