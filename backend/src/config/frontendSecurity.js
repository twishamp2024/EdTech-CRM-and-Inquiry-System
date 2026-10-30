/**
 * Content-Security-Policy for the React app. Must equal the policy in
 * frontend/vercel.json (tests/api/frontend.test.js compares them), so the
 * app gets the same protection whether Express or Vercel serves it.
 */
export const FRONTEND_CSP_DIRECTIVES = Object.freeze({
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  // Chart bar widths are set with style attributes; no inline <style>/<script>.
  'style-src-attr': ["'unsafe-inline'"],
  'img-src': ["'self'", 'data:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
});

export const FRONTEND_PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=()';
