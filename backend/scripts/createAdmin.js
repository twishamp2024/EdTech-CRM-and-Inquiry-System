#!/usr/bin/env node
// Creates an admin account in DATABASE_URL. There is no sign-up endpoint and
// no default account; this script is the only way to create an admin.
//
// Usage (from backend/):
//   npm run admin:create                         # prompts for email and password (hidden)
//   npm run admin:create -- --email you@school.org
//   ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run admin:create   # non-interactive (CI, Render shell)
//   printf '%s\n' "$PASSWORD" | npm run admin:create -- --email you@school.org
//
// The password is never accepted as a command-line argument (it would be
// visible in shell history and `ps`), and neither the password nor its hash
// is ever printed.

import { stdin, stdout, stderr } from 'node:process';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { loadPasswordHashingConfig } from '../src/config/env.js';
import { createAdminAccount } from '../src/services/admin.service.js';
import { AppError } from '../src/utils/AppError.js';
import { withDatabase } from './lib/withDatabase.js';

function fail(message) {
  stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArguments() {
  try {
    const { values } = parseArgs({
      options: { email: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
      strict: true,
    });
    return values;
  } catch (err) {
    if (/--password/.test(err.message)) {
      fail(
        'Refusing --password: arguments are visible in shell history. Use the prompt or ADMIN_PASSWORD.',
      );
    }
    fail(`${err.message}\nUsage: npm run admin:create -- [--email <address>]`);
  }
}

/** Reads one line from a non-interactive stdin (pipe). */
function readLineFromPipe() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, terminal: false });
    let answered = false;
    rl.once('line', (line) => {
      answered = true;
      rl.close();
      resolve(line);
    });
    rl.once('close', () => {
      if (!answered) resolve('');
    });
  });
}

function prompt(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Prompts without echoing what is typed. */
function promptHidden(question) {
  return new Promise((resolve, reject) => {
    stdout.write(question);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          stdin.setRawMode(false);
          stdout.write('\n');
          reject(new Error('Cancelled'));
          return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on('data', onData);
  });
}

async function collectCredentials(args) {
  let email = args.email ?? process.env.ADMIN_EMAIL;
  let password = process.env.ADMIN_PASSWORD;

  if (password !== undefined) {
    stderr.write('Using ADMIN_PASSWORD from the environment. Unset it when you are done.\n');
  }

  if (!stdin.isTTY) {
    if (!email)
      fail('Provide the email with --email or ADMIN_EMAIL when not running interactively.');
    if (password === undefined) password = await readLineFromPipe();
    return { email, password };
  }

  if (!email) email = await prompt('Admin email: ');
  if (password === undefined) {
    password = await promptHidden('Password (min 12 characters, hidden): ');
    const confirmation = await promptHidden('Confirm password: ');
    if (password !== confirmation) fail('Passwords do not match. No admin was created.');
  }
  return { email, password };
}

const args = parseArguments();
if (args.help) {
  stdout.write('Usage: npm run admin:create -- [--email <address>]\n');
  process.exit(0);
}

const credentials = await collectCredentials(args);
const { saltRounds } = loadPasswordHashingConfig();

await withDatabase(async ({ db, logger }) => {
  try {
    const admin = await createAdminAccount({
      Admin: db.models.Admin,
      email: credentials.email,
      password: credentials.password,
      saltRounds,
    });
    logger.info(`Admin created: ${admin.email}`, { id: admin.id, bcryptCost: saltRounds });
  } catch (err) {
    if (err instanceof AppError) {
      const reasons = (err.details ?? []).map((d) => `  - ${d.message}`).join('\n');
      throw Object.assign(new Error(`${err.message}${reasons ? `:\n${reasons}` : ''}`), {
        expected: true,
      });
    }
    throw err;
  }
});
