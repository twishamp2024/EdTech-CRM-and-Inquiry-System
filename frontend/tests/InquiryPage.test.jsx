import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api/client.js';
import { submitInquiry } from '../src/api/inquiries.api.js';
import { fetchCurrentAdmin } from '../src/api/auth.api.js';
import { deferred, renderApp } from './helpers/renderApp.jsx';

vi.mock('../src/api/inquiries.api.js', () => ({ submitInquiry: vi.fn() }));
vi.mock('../src/api/auth.api.js', () => ({
  fetchCurrentAdmin: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

const ID = '6f1c3c1e-3f5b-4c8e-9a51-2b0b7f0e9d11';

beforeEach(() => {
  vi.mocked(fetchCurrentAdmin).mockRejectedValue(new ApiError('no session', { status: 401 }));
});

async function fillValidForm(user, overrides = {}) {
  const values = {
    userType: 'Parent',
    category: 'Admission',
    name: 'Asha Verma',
    email: 'asha@example.com',
    phone: '+91 98765 43210',
    message: 'When does admission open for grade 6?',
    ...overrides,
  };
  await user.selectOptions(screen.getByLabelText(/I am a/), values.userType);
  await user.selectOptions(screen.getByLabelText(/Category/), values.category);
  await user.type(screen.getByLabelText(/Full name/), values.name);
  await user.type(screen.getByLabelText(/^Email/), values.email);
  await user.type(screen.getByLabelText(/Phone number/), values.phone);
  await user.type(screen.getByLabelText(/Message \/ query/), values.message);
  return values;
}

const submitButton = () => screen.getByRole('button', { name: /send inquiry|sending/i });

describe('public inquiry form', () => {
  it('does not check the admin session on the public page', () => {
    renderApp('/');
    expect(fetchCurrentAdmin).not.toHaveBeenCalled();
  });

  it('has labelled controls with exactly the allowed options', () => {
    renderApp('/');
    expect(screen.getByRole('heading', { level: 1, name: 'How can we help?' })).toBeInTheDocument();

    const userType = screen.getByLabelText(/I am a/);
    expect(
      within(userType)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Select user type', 'Parent', 'Student', 'School']);
    const category = screen.getByLabelText(/Category/);
    expect(
      within(category)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Select category', 'Scholarship', 'Concert', 'Admission', 'General Query']);
    for (const label of [/Full name/, /^Email/, /Phone number/, /Message \/ query/]) {
      expect(screen.getByLabelText(label)).toBeRequired();
    }
  });

  it('shows field errors, focuses the first one, and sends nothing when invalid', async () => {
    const { user } = renderApp('/');
    await user.click(submitButton());

    expect(await screen.findByText('Select a user type')).toBeInTheDocument();
    expect(screen.getByText('Select a category')).toBeInTheDocument();
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Phone number is required')).toBeInTheDocument();
    expect(screen.getByText('Message is required')).toBeInTheDocument();

    const userType = screen.getByLabelText(/I am a/);
    expect(userType).toHaveFocus();
    expect(userType).toHaveAttribute('aria-invalid', 'true');
    expect(userType).toHaveAccessibleDescription('Select a user type');
    expect(submitInquiry).not.toHaveBeenCalled();
  });

  it('validates email and phone format', async () => {
    const { user } = renderApp('/');
    await fillValidForm(user, { email: 'asha@example', phone: '12345' });
    await user.click(submitButton());

    expect(
      await screen.findByText('Enter a valid email address, for example name@example.com'),
    ).toBeInTheDocument();
    expect(screen.getByText('Phone number must contain 7–15 digits')).toBeInTheDocument();
    expect(submitInquiry).not.toHaveBeenCalled();
  });

  it('submits, shows a loading state, and confirms only after the backend does', async () => {
    const request = deferred();
    vi.mocked(submitInquiry).mockReturnValue(request.promise);
    const { user } = renderApp('/');
    await fillValidForm(user, { name: '  Asha   Verma ' });
    await user.click(submitButton());

    const button = await screen.findByRole('button', { name: 'Sending…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText(/Full name/)).toBeDisabled();
    expect(screen.queryByText(/has been received/)).not.toBeInTheDocument();

    expect(submitInquiry).toHaveBeenCalledWith({
      userType: 'Parent',
      category: 'Admission',
      name: 'Asha   Verma',
      email: 'asha@example.com',
      phone: '+91 98765 43210',
      message: 'When does admission open for grade 6?',
    });

    request.resolve({ id: ID, duplicate: false, message: 'ok' });
    const heading = await screen.findByRole('heading', {
      name: 'Thank you — your inquiry has been received',
    });
    expect(heading).toHaveFocus();
    expect(screen.getByText('6F1C3C1E')).toBeInTheDocument();
  });

  it('sends only one request when submit is triggered repeatedly', async () => {
    const request = deferred();
    vi.mocked(submitInquiry).mockReturnValue(request.promise);
    const { user } = renderApp('/');
    await fillValidForm(user);

    await user.click(submitButton());
    await user.click(submitButton());
    await user.keyboard('{Enter}');
    expect(submitInquiry).toHaveBeenCalledTimes(1);

    request.resolve({ id: ID, duplicate: false, message: 'ok' });
    await screen.findByText(/has been received/);
    expect(submitInquiry).toHaveBeenCalledTimes(1);
  });

  it('keeps the values and explains when saving fails', async () => {
    vi.mocked(submitInquiry).mockRejectedValue(
      new ApiError('down', { status: 503, code: 'DATABASE_UNAVAILABLE' }),
    );
    const { user } = renderApp('/');
    await fillValidForm(user);
    await user.click(submitButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your inquiry was not sent');
    expect(alert).toHaveTextContent('nothing was submitted');
    expect(screen.queryByText(/has been received/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Full name/)).toHaveValue('Asha Verma');
    expect(submitButton()).toBeEnabled();
  });

  it.each([
    [
      new ApiError('We could not reach the server. Check your connection and try again.', {
        code: 'NETWORK_ERROR',
      }),
      /could not reach the server/,
    ],
    [
      new ApiError('x', { status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 600 }),
      /about 10 minutes/,
    ],
    [
      new ApiError('The server did not confirm that your inquiry was saved. Please try again.', {
        code: 'UNCONFIRMED',
      }),
      /did not confirm/,
    ],
  ])('shows a specific message for %o', async (error, expected) => {
    vi.mocked(submitInquiry).mockRejectedValue(error);
    const { user } = renderApp('/');
    await fillValidForm(user);
    await user.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(expected);
  });

  it('shows server-side field errors next to the fields', async () => {
    vi.mocked(submitInquiry).mockRejectedValue(
      new ApiError('invalid', {
        status: 400,
        code: 'VALIDATION_ERROR',
        details: [{ field: 'email', message: 'Email domain is not accepted' }],
      }),
    );
    const { user } = renderApp('/');
    await fillValidForm(user);
    await user.click(submitButton());

    expect(await screen.findByText('Email domain is not accepted')).toBeInTheDocument();
    const email = screen.getByLabelText(/^Email/);
    expect(email).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(email).toHaveFocus());
    expect(screen.getByRole('alert')).toHaveTextContent('Some fields need attention');
  });

  it('tells the user when the same inquiry was already received', async () => {
    vi.mocked(submitInquiry).mockResolvedValue({ id: ID, duplicate: true, message: 'dup' });
    const { user } = renderApp('/');
    await fillValidForm(user);
    await user.click(submitButton());
    expect(
      await screen.findByRole('heading', { name: 'We already have this inquiry' }),
    ).toBeInTheDocument();
  });

  it('starts a fresh, empty form after a successful submission', async () => {
    vi.mocked(submitInquiry).mockResolvedValue({ id: ID, duplicate: false, message: 'ok' });
    const { user } = renderApp('/');
    await fillValidForm(user);
    await user.click(submitButton());
    await user.click(await screen.findByRole('button', { name: 'Send another inquiry' }));

    await waitFor(() => expect(screen.getByLabelText(/I am a/)).toHaveFocus());
    expect(screen.getByLabelText(/Full name/)).toHaveValue('');
    expect(screen.getByLabelText(/Message \/ query/)).toHaveValue('');
  });

  it('shows a live character count for the message', async () => {
    const { user } = renderApp('/');
    await user.type(screen.getByLabelText(/Message \/ query/), 'Hello');
    expect(screen.getByText('5 / 2000')).toBeInTheDocument();
  });
});
