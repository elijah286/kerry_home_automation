/**
 * Header build label — confirms the browser loaded a given frontend bundle.
 *
 * Default: A.B.C from `app-version.json` (A = manual, B = git push hook, C = Cursor agent `stop` hook).
 * Optional override: NEXT_PUBLIC_APP_VERSION (e.g. CI)
 */
import appVersion from './app-version.json';

const fromFile = `v${appVersion.major}.${appVersion.minor}.${appVersion.patch}`;
const env = process.env.NEXT_PUBLIC_APP_VERSION?.trim();

export const APP_VERSION_LABEL = env
  ? env.startsWith('v')
    ? env
    : `v${env}`
  : fromFile;
