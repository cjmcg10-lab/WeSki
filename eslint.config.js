import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'public/data/', 'design/', 'node_modules/', 'worker/static/', 'tools/dev/', 'tools/preview/.build/'] },
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-control-regex': 'off',
    },
  },
  { files: ['src/**/*.js', 'public/**/*.js', 'ios-beta/native.js'], languageOptions: { globals: globals.browser } },
  { files: ['public/sw.js'], languageOptions: { globals: globals.serviceworker } },
  { files: ['worker/**/*.js', 'tools/preview/worker.js'], languageOptions: { globals: { ...globals.serviceworker, ...globals.node, WebSocketPair: 'readonly' } } },
  {
    files: ['tools/**/*.mjs', 'tests/**/*.{js,mjs}', 'vite.config.js', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  { files: ['tests/acceptance/*.mjs', 'tests/smoke/start.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
];
