/**
 * The attributes shared by setting and clearing the session cookie. Browsers
 * only delete a cookie when name, Path, Domain, Secure and SameSite match the
 * ones it was set with, so both operations use this one function.
 */
function baseOptions(cookie) {
  return {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
  };
}

export function setAuthCookie(res, cookie, token, expiresAt) {
  res.cookie(cookie.name, token, {
    ...baseOptions(cookie),
    maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
  });
}

export function clearAuthCookie(res, cookie) {
  res.clearCookie(cookie.name, baseOptions(cookie));
}

export function readAuthCookie(req, cookie) {
  const value = req.cookies?.[cookie.name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
