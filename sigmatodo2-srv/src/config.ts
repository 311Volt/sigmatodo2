export const IS_PROD = (process.env.APP_MODE ?? 'dev') === 'prod';

export const config = {
  mode: IS_PROD ? 'prod' : 'dev',
  port: parseInt(process.env.PORT ?? '3001'),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me-in-prod',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://sigma:sigma@localhost:5432/sigmatodo2',

  // dev-only
  uploadsDir: process.env.UPLOADS_DIR ?? './uploads',

  // prod-only
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY ?? '',

  // Google OAuth (prod)
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3001/api/auth/google/callback',
};
