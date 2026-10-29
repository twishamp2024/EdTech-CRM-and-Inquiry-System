import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { routes } from '../../src/routes.jsx';

/** Renders the real route tree (including its auth provider) at `entry` (path or { pathname, state }). */
export function renderApp(entry = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [entry] });
  const user = userEvent.setup();
  const utils = render(<RouterProvider router={router} />);
  return { ...utils, router, user };
}

/** A promise plus its resolve/reject, to hold a request "in flight". */
export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export const ADMIN = {
  id: '0b6f3c1e-8d2a-4c51-9e47-3a1f5c2b7d90',
  email: 'ops@school.org',
  role: 'admin',
};
