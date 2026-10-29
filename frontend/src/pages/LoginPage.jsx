import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, LogIn } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/useAuth.js';
import { PasswordField, TextField } from '../components/form/fields.jsx';
import { Alert } from '../components/ui/Alert.jsx';
import { Button } from '../components/ui/Button.jsx';
import { applyServerFieldErrors, describeApiError } from '../lib/apiErrors.js';
import { loginFormSchema } from '../validation/login.schema.js';

export const DEFAULT_AFTER_LOGIN = '/admin/dashboard';

/** Only return to in-app admin paths remembered by the router (no open redirects). */
function destinationFrom(state) {
  const from = state?.from;
  const path = from?.pathname;
  if (typeof path !== 'string' || !path.startsWith('/admin') || path.startsWith('//')) {
    return DEFAULT_AFTER_LOGIN;
  }
  return `${path}${from.search ?? ''}`;
}

function SessionNotice({ state, endReason }) {
  if (endReason === 'signed-out') {
    return <Alert variant="success">You have signed out.</Alert>;
  }
  if (endReason === 'expired') {
    return <Alert variant="warning">Your session has ended. Please sign in again.</Alert>;
  }
  if (state?.from) {
    return <Alert variant="info">Please sign in to continue.</Alert>;
  }
  return null;
}

export function LoginPage() {
  const { status, login, endReason } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [authError, setAuthError] = useState(null);
  // Field to focus once submission ends (inputs are disabled while it runs).
  const focusAfterSubmit = useRef(null);

  const {
    register,
    handleSubmit,
    setError,
    resetField,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onTouched',
  });

  useEffect(() => {
    if (!isSubmitting && focusAfterSubmit.current) {
      setFocus(focusAfterSubmit.current);
      focusAfterSubmit.current = null;
    }
  }, [isSubmitting, setFocus]);

  if (status === 'authenticated' && !isSubmitting) {
    return <Navigate to={destinationFrom(location.state)} replace />;
  }

  async function onSubmit(values) {
    setAuthError(null);
    try {
      await login(values);
      navigate(destinationFrom(location.state), { replace: true });
    } catch (error) {
      const invalidField = applyServerFieldErrors(error, setError, ['email', 'password']);
      setAuthError(describeApiError(error, 'login'));
      if (error?.code === 'INVALID_CREDENTIALS') {
        // Generic message only (no hint whether the email exists); retype the password.
        resetField('password');
        focusAfterSubmit.current = 'password';
      } else {
        focusAfterSubmit.current = invalidField;
      }
    }
  }

  return (
    <div className="container auth-layout">
      <section className="card auth-card" aria-labelledby="login-heading">
        <div className="auth-card__header">
          <span className="auth-card__icon">
            <Lock aria-hidden="true" />
          </span>
          <h1 id="login-heading">Admin sign in</h1>
          <p className="muted">For school staff who manage inquiries.</p>
        </div>

        <div className="auth-card__notice">
          <SessionNotice state={location.state} endReason={endReason} />
        </div>

        <form
          onSubmit={(event) => handleSubmit(onSubmit)(event)}
          noValidate
          className="auth-form"
          aria-busy={isSubmitting || undefined}
        >
          <fieldset className="stack" disabled={isSubmitting}>
            <legend className="visually-hidden">Sign-in details</legend>
            <TextField
              name="email"
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="username"
              required
              registration={register('email')}
              error={errors.email?.message}
            />
            <PasswordField
              name="password"
              label="Password"
              autoComplete="current-password"
              required
              registration={register('password')}
              error={errors.password?.message}
            />
          </fieldset>

          {authError && (
            <Alert variant="error" title="Sign-in failed">
              {authError}
            </Alert>
          )}

          <Button
            type="submit"
            icon={LogIn}
            loading={isSubmitting}
            loadingText="Signing in…"
            className="btn--block"
          >
            Sign in
          </Button>
        </form>
      </section>
    </div>
  );
}
