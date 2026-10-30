/**
 * Configuration that is valid but risky, reported at startup so operators
 * notice it in the logs. Returns plain strings; nothing here contains secrets.
 */
export function collectStartupWarnings(config) {
  const warnings = [];

  if (config.database.sslMode === 'require') {
    warnings.push(
      'DATABASE_SSL_MODE=require: traffic is encrypted but the server certificate is NOT verified',
    );
  } else if (config.database.sslMode === 'verify-full' && !config.database.sslCa) {
    warnings.push(
      "No DATABASE_SSL_CA[_PATH] set; verification uses system CAs, which do not include Supabase's root CA",
    );
  }

  // Behind Render (and a Vercel rewrite) every request arrives from the proxy.
  // Without TRUST_PROXY all visitors share one IP, so the login and inquiry
  // rate limits would be shared too: one abuser could lock everyone out.
  if (config.isProduction && config.trustProxy === 0) {
    warnings.push(
      'TRUST_PROXY=0 in production: if the API runs behind a proxy (Render, a Vercel rewrite), rate limits will treat all visitors as one client. Set TRUST_PROXY to the number of proxies (1 on Render, 2 with a Vercel rewrite).',
    );
  }

  return warnings;
}
