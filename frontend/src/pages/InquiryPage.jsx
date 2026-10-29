import { zodResolver } from '@hookform/resolvers/zod';
import { Award, CircleCheck, MessageCircleQuestion, Music, School, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { submitInquiry } from '../api/inquiries.api.js';
import { SelectField, TextAreaField, TextField } from '../components/form/fields.jsx';
import { Alert } from '../components/ui/Alert.jsx';
import { Button } from '../components/ui/Button.jsx';
import { CATEGORIES, FIELD_LIMITS, USER_TYPES } from '../constants/inquiry.js';
import { applyServerFieldErrors, describeApiError } from '../lib/apiErrors.js';
import { emptyInquiry, INQUIRY_FIELDS, inquiryFormSchema } from '../validation/inquiry.schema.js';

const TOPICS = [
  { icon: Award, title: 'Scholarships', text: 'Eligibility, applications and deadlines.' },
  { icon: Music, title: 'Concerts', text: 'Performances, tickets and participation.' },
  { icon: School, title: 'Admissions', text: 'Joining, transfers and required documents.' },
  {
    icon: MessageCircleQuestion,
    title: 'General queries',
    text: 'Anything else you would like to ask.',
  },
];

function SubmissionReceived({ result, onReset }) {
  const headingRef = useRef(null);
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <div className="card success-panel" role="status">
      <CircleCheck className="success-panel__icon" aria-hidden="true" />
      <h2 ref={headingRef} tabIndex={-1} className="success-panel__title">
        {result.duplicate
          ? 'We already have this inquiry'
          : 'Thank you — your inquiry has been received'}
      </h2>
      <p className="success-panel__text">
        {result.duplicate
          ? 'An identical inquiry was submitted a few minutes ago, so we did not store a second copy.'
          : 'It has been saved and our team will get back to you using the contact details you provided.'}
      </p>
      <p className="success-panel__reference">
        Reference: <code>{result.id.slice(0, 8).toUpperCase()}</code>
      </p>
      <Button variant="secondary" onClick={onReset}>
        Send another inquiry
      </Button>
    </div>
  );
}

export function InquiryPage() {
  const [result, setResult] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  // Blocks a second request even if submit fires again before React re-renders.
  const inFlight = useRef(false);
  // Field to focus once submission ends (inputs are disabled while it runs).
  const focusAfterSubmit = useRef(null);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    setFocus,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(inquiryFormSchema),
    defaultValues: emptyInquiry,
    mode: 'onTouched',
  });

  async function onSubmit(values) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitError(null);
    try {
      setResult(await submitInquiry(values));
    } catch (error) {
      focusAfterSubmit.current = applyServerFieldErrors(error, setError, INQUIRY_FIELDS);
      setSubmitError(describeApiError(error, 'inquiry'));
    } finally {
      inFlight.current = false;
    }
  }

  useEffect(() => {
    if (!isSubmitting && focusAfterSubmit.current) {
      setFocus(focusAfterSubmit.current);
      focusAfterSubmit.current = null;
    }
  }, [isSubmitting, setFocus]);

  function startOver() {
    reset(emptyInquiry);
    setResult(null);
    setSubmitError(null);
    // Focus after the form is back in the DOM.
    requestAnimationFrame(() => setFocus('userType'));
  }

  const messageLength = useWatch({ control, name: 'message' })?.length ?? 0;

  return (
    <div className="container inquiry-layout">
      <section className="inquiry-intro" aria-labelledby="inquiry-heading">
        <h1 id="inquiry-heading">How can we help?</h1>
        <p className="lead">
          Send us your question and our team will reply using the contact details you provide.
        </p>
        <ul className="topic-list">
          {TOPICS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="topic-list__item">
              <Icon className="topic-list__icon" aria-hidden="true" />
              <div>
                <p className="topic-list__title">{title}</p>
                <p className="topic-list__text">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {result ? (
        <SubmissionReceived result={result} onReset={startOver} />
      ) : (
        <form
          className="card form-card"
          onSubmit={(event) => handleSubmit(onSubmit)(event)}
          noValidate
          aria-labelledby="form-heading"
          aria-busy={isSubmitting || undefined}
        >
          <h2 id="form-heading" className="form-card__title">
            Inquiry form
          </h2>
          <p className="form-card__note">
            Fields marked <span aria-hidden="true">*</span>
            <span className="visually-hidden">with an asterisk</span> are required.
          </p>

          <fieldset className="form-grid" disabled={isSubmitting}>
            <legend className="visually-hidden">Your inquiry</legend>
            <SelectField
              name="userType"
              label="I am a"
              placeholder="Select user type"
              options={USER_TYPES}
              required
              registration={register('userType')}
              error={errors.userType?.message}
            />
            <SelectField
              name="category"
              label="Category"
              placeholder="Select category"
              options={CATEGORIES}
              required
              registration={register('category')}
              error={errors.category?.message}
            />
            <div className="form-grid__full">
              <TextField
                name="name"
                label="Full name"
                autoComplete="name"
                maxLength={FIELD_LIMITS.name.max}
                required
                registration={register('name')}
                error={errors.name?.message}
              />
            </div>
            <TextField
              name="email"
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={FIELD_LIMITS.email.max}
              required
              registration={register('email')}
              error={errors.email?.message}
            />
            <TextField
              name="phone"
              label="Phone number"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={FIELD_LIMITS.phone.maxLength}
              hint="Any country. Include the country code, e.g. +44 20 7946 0958."
              required
              registration={register('phone')}
              error={errors.phone?.message}
            />
            <div className="form-grid__full">
              <TextAreaField
                name="message"
                label="Message / query"
                rows={6}
                count={messageLength}
                maxLength={FIELD_LIMITS.message.max}
                hint={`At least ${FIELD_LIMITS.message.min} characters.`}
                required
                registration={register('message')}
                error={errors.message?.message}
              />
            </div>
          </fieldset>

          {submitError && (
            <Alert variant="error" title="Your inquiry was not sent" className="form-card__alert">
              {submitError}
            </Alert>
          )}

          <div className="form-card__actions">
            <Button type="submit" icon={Send} loading={isSubmitting} loadingText="Sending…">
              Send inquiry
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
