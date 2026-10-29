# Database CA certificate

Supabase signs its database certificates with its own root CA ("Supabase Root
2021 CA"), which is not in Node's default trust store. To use
`DATABASE_SSL_MODE=verify-full` (the default):

1. Supabase dashboard → **Project Settings → Database → SSL Configuration →
   Download certificate**.
2. Save it here as `supabase-ca.crt`.
3. Keep `DATABASE_SSL_CA_PATH=./certs/supabase-ca.crt` in `backend/.env`.

The CA certificate is public (it contains no secret), so it is safe to commit
for deployment. Alternatively set `DATABASE_SSL_CA` to the PEM contents.
