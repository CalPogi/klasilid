// The settings the app reads at build time. Missing in demo builds; the app checks before it uses them (modeFromEnv).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}
