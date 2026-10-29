import { act, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCurrentAdmin, login, logout } from '../src/api/auth.api.js';
import { ApiError, apiClient } from '../src/api/client.js';
import { ADMIN, deferred, renderApp } from './helpers/renderApp.jsx';

vi.mock('../src/api/auth.api.js', () => ({
  fetchCurrentAdmin: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('../src/api/inquiries.api.js', () => ({
  submitInquiry: vi.fn(),
  listInquiries: vi.fn(async () => ({
    inquiries: [],
    meta: {
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  })),
  updateInquiryStatus: vi.fn(),
  getInquiryStats: vi.fn(async () => ({
    total: 0,
    byStatus: { New: 0, 'In Progress': 0, Resolved: 0 },
    byCategory: { Scholarship: 0, Concert: 0, Admission: 0, 'General Query': 0 },
  })),
  exportInquiriesCsv: vi.fn(),
}));

const noSession = () =>
  new ApiError('Please sign in to continue.', { status: 401, code: 'AUTH_REQUIRED' });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(fetchCurrentAdmin).mockRejectedValue(noSession());
});

async function signIn(user, { email = ADMIN.email, password = 'a long test password' } = {}) {
  await user.type(await screen.findByLabelText(/^Email/), email);
  await user.type(screen.getByLabelText(/^Password/), password);
  await user.click(screen.getByRole('button', { name: /sign in/i }));
}

describe('protected admin routes', () => {
  it('shows a loading state while the session is checked', async () => {
    vi.mocked(fetchCurrentAdmin).mockReturnValue(deferred().promise);
    renderApp('/admin/dashboard');
    expect(
      await screen.findByRole('heading', { name: 'Checking your session…' }),
    ).toBeInTheDocument();
  });

  it('redirects to /login when there is no session', async () => {
    const { router } = renderApp('/admin/dashboard');
    expect(await screen.findByRole('heading', { name: 'Admin sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByText('Please sign in to continue.')).toBeInTheDocument();
  });

  it('restores an existing session through GET /api/auth/me', async () => {
    vi.mocked(fetchCurrentAdmin).mockResolvedValue(ADMIN);
    renderApp('/admin/dashboard');
    expect(await screen.findByRole('heading', { name: 'Inquiries', level: 1 })).toBeInTheDocument();
    expect(screen.getAllByText(ADMIN.email).length).toBeGreaterThan(0);
  });

  it('redirects /admin to the dashboard', async () => {
    vi.mocked(fetchCurrentAdmin).mockResolvedValue(ADMIN);
    const { router } = renderApp('/admin');
    await screen.findByRole('heading', { name: 'Inquiries', level: 1 });
    expect(router.state.location.pathname).toBe('/admin/dashboard');
  });

  it('offers a retry when the API cannot be reached', async () => {
    vi.mocked(fetchCurrentAdmin)
      .mockRejectedValueOnce(
        new ApiError('We could not reach the server.', { code: 'NETWORK_ERROR' }),
      )
      .mockResolvedValueOnce(ADMIN);
    const { user } = renderApp('/admin/dashboard');

    expect(
      await screen.findByRole('heading', { name: 'We can’t reach the server' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Inquiries', level: 1 })).toBeInTheDocument();
  });

  it('returns to the login page when an admin request comes back 401', async () => {
    vi.mocked(fetchCurrentAdmin).mockResolvedValue(ADMIN);
    const { router } = renderApp('/admin/dashboard');
    await screen.findByRole('heading', { name: 'Inquiries', level: 1 });

    const expired = async (config) => {
      const response = {
        status: 401,
        data: { error: { code: 'TOKEN_EXPIRED' } },
        headers: {},
        config,
      };
      throw new AxiosError('401', 'ERR_BAD_REQUEST', config, {}, response);
    };
    await apiClient.get('/inquiries', { adapter: expired }).catch(() => {});

    expect(
      await screen.findByText('Your session has ended. Please sign in again.'),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });
});

describe('admin login page', () => {
  it('validates the fields before calling the API', async () => {
    const { user } = renderApp('/login');
    await user.click(await screen.findByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/^Email/), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('signs in, shows progress, and redirects to /admin/dashboard', async () => {
    const request = deferred();
    vi.mocked(login).mockReturnValue(request.promise);
    const { user, router } = renderApp('/login');
    await signIn(user, { email: ' ops@school.org ' });

    const button = await screen.findByRole('button', { name: 'Signing in…' });
    expect(button).toBeDisabled();
    expect(login).toHaveBeenCalledWith({
      email: 'ops@school.org',
      password: 'a long test password',
    });

    request.resolve(ADMIN);
    expect(await screen.findByRole('heading', { name: 'Inquiries', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/dashboard');
  });

  it('never stores the session in localStorage or sessionStorage', async () => {
    vi.mocked(login).mockResolvedValue(ADMIN);
    const { user } = renderApp('/login');
    await signIn(user);
    await screen.findByRole('heading', { name: 'Inquiries', level: 1 });
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('shows a generic error and clears the password for wrong credentials', async () => {
    vi.mocked(login).mockRejectedValue(
      new ApiError('Invalid email or password.', { status: 401, code: 'INVALID_CREDENTIALS' }),
    );
    const { user, router } = renderApp('/login');
    await signIn(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    const password = screen.getByLabelText(/^Password/);
    expect(password).toHaveValue('');
    await waitFor(() => expect(password).toHaveFocus());
    expect(screen.getByLabelText(/^Email/)).toHaveValue(ADMIN.email);
    expect(router.state.location.pathname).toBe('/login');
  });

  it.each([
    [
      new ApiError('x', { status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 300 }),
      /Too many sign-in attempts. Please try again in about 5 minutes/,
    ],
    [new ApiError('x', { code: 'NETWORK_ERROR', message: 'x' }), /x/],
    [
      new ApiError('x', { status: 503, code: 'DATABASE_UNAVAILABLE' }),
      /could not complete the request/,
    ],
  ])('explains failure %o', async (error, expected) => {
    vi.mocked(login).mockRejectedValue(error);
    const { user } = renderApp('/login');
    await signIn(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(expected);
  });

  it('lets the user reveal the password with an accessible toggle', async () => {
    const { user } = renderApp('/login');
    const password = await screen.findByLabelText(/^Password/);
    expect(password).toHaveAttribute('type', 'password');
    const toggle = screen.getByRole('button', { name: 'Show password' });
    await user.click(toggle);
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('returns to the originally requested admin page after sign-in', async () => {
    vi.mocked(login).mockResolvedValue(ADMIN);
    const { user, router } = renderApp({
      pathname: '/login',
      state: { from: { pathname: '/admin/dashboard', search: '?tab=new' } },
    });
    await signIn(user);
    await screen.findByRole('heading', { name: 'Inquiries', level: 1 });
    expect(router.state.location.search).toBe('?tab=new');
  });

  it('ignores redirect targets outside the admin area', async () => {
    vi.mocked(login).mockResolvedValue(ADMIN);
    const { user, router } = renderApp({
      pathname: '/login',
      state: { from: { pathname: '//evil.example/admin' } },
    });
    await signIn(user);
    await screen.findByRole('heading', { name: 'Inquiries', level: 1 });
    expect(router.state.location.pathname).toBe('/admin/dashboard');
  });

  it('sends a signed-in admin straight to the dashboard', async () => {
    vi.mocked(fetchCurrentAdmin).mockResolvedValue(ADMIN);
    const { router } = renderApp('/login');
    await screen.findByRole('heading', { name: 'Inquiries', level: 1 });
    expect(router.state.location.pathname).toBe('/admin/dashboard');
  });
});

describe('logout', () => {
  it('signs out through the API and clears the frontend session', async () => {
    vi.mocked(fetchCurrentAdmin).mockResolvedValue(ADMIN);
    vi.mocked(logout).mockResolvedValue();
    const { user, router } = renderApp('/admin/dashboard');
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(await screen.findByText('You have signed out.')).toBeInTheDocument();
    expect(logout).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe('/login');

    // The admin area stays closed without asking the API again.
    await act(() => router.navigate('/admin/dashboard'));
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByRole('heading', { name: 'Admin sign in' })).toBeInTheDocument();
    expect(fetchCurrentAdmin).toHaveBeenCalledTimes(1);
  });

  it('stays signed in and says so if the API cannot be reached', async () => {
    vi.mocked(fetchCurrentAdmin).mockResolvedValue(ADMIN);
    vi.mocked(logout).mockRejectedValue(new ApiError('x', { code: 'NETWORK_ERROR' }));
    const { user, router } = renderApp('/admin/dashboard');
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You are still signed in');
    expect(router.state.location.pathname).toBe('/admin/dashboard');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });
});

describe('other pages', () => {
  it('shows a helpful 404', async () => {
    renderApp('/nope');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the inquiry form' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('offers a skip link to the main content', async () => {
    renderApp('/');
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main',
    );
    expect(document.getElementById('main')).toBeInTheDocument();
  });
});
