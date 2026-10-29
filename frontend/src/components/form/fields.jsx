import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

const join = (...ids) => ids.filter(Boolean).join(' ') || undefined;

/**
 * Label, control, hint and error wired together: the control is described by
 * the hint and the error, and marked aria-invalid while the error is shown.
 */
function FieldShell({ id, label, required, hint, error, aside, children }) {
  return (
    <div className={`field${error ? ' field--invalid' : ''}`}>
      <div className="field__label-row">
        <label htmlFor={id} className="field__label">
          {label}
          {required && (
            <span className="field__required" aria-hidden="true">
              {' '}
              *
            </span>
          )}
        </label>
        {aside}
      </div>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}

function controlProps({ id, hint, error, required }) {
  return {
    id,
    'aria-invalid': error ? 'true' : 'false',
    'aria-describedby': join(hint && `${id}-hint`, error && `${id}-error`),
    required,
  };
}

export function TextField({ name, label, registration, error, hint, required, ...inputProps }) {
  const id = `field-${name}`;
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error}>
      <input
        className="input"
        type="text"
        {...controlProps({ id, hint, error, required })}
        {...registration}
        {...inputProps}
      />
    </FieldShell>
  );
}

export function SelectField({
  name,
  label,
  registration,
  error,
  hint,
  required,
  options,
  placeholder,
}) {
  const id = `field-${name}`;
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error}>
      <select
        className="input select"
        {...controlProps({ id, hint, error, required })}
        {...registration}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function TextAreaField({
  name,
  label,
  registration,
  error,
  hint,
  required,
  count,
  maxLength,
  ...textareaProps
}) {
  const id = `field-${name}`;
  const over = maxLength !== undefined && count > maxLength;
  const aside =
    maxLength !== undefined ? (
      <span className={`field__counter${over ? ' field__counter--over' : ''}`}>
        {count} / {maxLength}
      </span>
    ) : null;
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error} aside={aside}>
      <textarea
        className="input textarea"
        {...controlProps({ id, hint, error, required })}
        {...registration}
        {...textareaProps}
      />
    </FieldShell>
  );
}

export function PasswordField({ name, label, registration, error, hint, required, ...inputProps }) {
  const id = `field-${name}`;
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error}>
      <div className="input-group">
        <input
          className="input input-group__input"
          type={visible ? 'text' : 'password'}
          {...controlProps({ id, hint, error, required })}
          {...registration}
          {...inputProps}
        />
        <button
          type="button"
          className="input-group__button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          aria-controls={id}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
    </FieldShell>
  );
}
