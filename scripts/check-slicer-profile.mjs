import { loadProfileBundle } from '../api/profile-bundle.mjs';
try {
  const bundle = await loadProfileBundle();
  console.log(JSON.stringify({ ok: true, scope: 'profile-integrity-only-not-a-real-slice', ...bundle.summary }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message, diagnostics: error.diagnostics }));
  process.exitCode = 1;
}
