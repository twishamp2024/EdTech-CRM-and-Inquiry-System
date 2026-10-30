import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { collectStartupWarnings } from '../../src/config/startupWarnings.js';
import { TEST_ENV } from '../helpers/testApp.js';

const PROD = { NODE_ENV: 'production', DATABASE_SSL_MODE: 'verify-full', DATABASE_SSL_CA: 'PEM' };
const warningsFor = (env) => collectStartupWarnings(loadConfig({ ...TEST_ENV, ...env }));

describe('collectStartupWarnings', () => {
  it('is quiet for a safe production configuration', () => {
    expect(warningsFor({ ...PROD, TRUST_PROXY: '1' })).toEqual([]);
  });

  it('warns when production runs without TRUST_PROXY', () => {
    expect(warningsFor(PROD).join()).toMatch(/TRUST_PROXY=0 in production/);
  });

  it('does not warn about TRUST_PROXY outside production', () => {
    expect(warningsFor({ DATABASE_SSL_MODE: 'disable' })).toEqual([]);
  });

  it('warns about unverified or CA-less TLS', () => {
    expect(warningsFor({ ...PROD, TRUST_PROXY: '1', DATABASE_SSL_MODE: 'require' }).join()).toMatch(
      /NOT verified/,
    );
    expect(warningsFor({ ...PROD, TRUST_PROXY: '1', DATABASE_SSL_CA: undefined }).join()).toMatch(
      /No DATABASE_SSL_CA/,
    );
  });
});
