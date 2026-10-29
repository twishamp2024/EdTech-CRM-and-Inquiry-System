import { LoaderCircle } from 'lucide-react';

/**
 * Button with an optional leading (`icon`) or trailing (`iconEnd`) icon and a
 * loading state. While loading it
 * is disabled, marked aria-busy, and shows a spinner plus `loadingText`.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconEnd: IconEnd,
  loading = false,
  loadingText,
  disabled,
  children,
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`btn btn--${variant} btn--${size} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <LoaderCircle className="btn__icon spin" aria-hidden="true" />
      ) : (
        Icon && <Icon className="btn__icon" aria-hidden="true" />
      )}
      <span>{loading && loadingText ? loadingText : children}</span>
      {!loading && IconEnd && <IconEnd className="btn__icon" aria-hidden="true" />}
    </button>
  );
}
