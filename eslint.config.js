import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * The app's layers, each allowed to import only the ones below it:
 *
 *   ui      React views              → state, domain, i18n
 *   state   what the UI shows/does   → data, domain, i18n
 *   data    Google, demo, storage    → domain, i18n
 *   domain  pure logic               → (i18n types only)
 *   i18n    translations             → nothing
 *
 * `src/main.tsx` (startup) and the tests may import anything.
 */
const WHY = {
  domain: 'domain/ is pure logic: it must not depend on how data is stored or shown.',
  i18n: 'i18n/ is used by every layer, so it must not import any of them.',
  data: 'data/ talks to Google and storage: it must not depend on the app state or the UI.',
  state: 'state/ must not depend on the UI.',
  ui: 'ui/ reaches data only through state/ (the planner), so storage and Google stay swappable.',
};
const forbid = (layer, names, { typesOk = [] } = {}) => ({
  files: [`src/${layer}/**/*.{ts,tsx}`],
  rules: {
    '@typescript-eslint/no-restricted-imports': [
      'error',
      {
        patterns: names.map((name) => ({
          regex: `(^|/)${name}(/|$)`,
          message: `${WHY[layer]} (imports ${name}/)`,
          ...(typesOk.includes(name) ? { allowTypeImports: true } : {}),
        })),
      },
    ],
  },
});

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // The UI layer must go through the data store, never the network directly.
      'no-restricted-globals': ['error', { name: 'fetch', message: 'Use the data layer (src/data) instead of fetch.' }],
    },
  },
  {
    files: ['src/data/**/*.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
  forbid('domain', ['data', 'state', 'ui', 'i18n'], { typesOk: ['i18n'] }),
  forbid('i18n', ['domain', 'data', 'state', 'ui']),
  forbid('data', ['state', 'ui']),
  forbid('state', ['ui']),
  forbid('ui', ['data']),
  {
    files: ['netlify/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: { 'no-restricted-globals': 'off' },
  },
);
