/**
 * Header build label — confirms the browser loaded a given frontend bundle.
 *
 * Default: A.B.C from `app-version.json` (A = user-controlled; B/C bumped on git push per scope — see .cursor/rules).
 * Optional override: NEXT_PUBLIC_APP_VERSION (e.g. CI)
 *
 * Optional `releaseNotes` string in app-version.json is shown on Settings → Software update as the
 * human summary; otherwise the latest commit subject (e.g. squash-merged PR title) is used.
 */
import appVersion from './app-version.json';

const fromFile = `v${appVersion.major}.${appVersion.minor}.${appVersion.patch}`;
const env = process.env.NEXT_PUBLIC_APP_VERSION?.trim();

export const APP_VERSION_LABEL = env
  ? env.startsWith('v')
    ? env
    : `v${env}`
  : fromFile;
