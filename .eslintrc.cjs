/* eslint-env node */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: {
    node: true,
    es2022: true,
    browser: true,
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '.tmp-assets/',
    'scripts/',
    '*.cjs',
    'src/plugin/dashboard/public/app.js',
    'src/plugin/dashboard/public/sw.js',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    'no-console': 'off',
  },
  overrides: [
    {
      files: ['tests/**/*.ts'],
      env: { node: true },
    },
    {
      files: ['src/plugin/dashboard/spa/**/*.tsx', 'src/plugin/dashboard/spa/**/*.ts'],
      env: { browser: true },
    },
  ],
};
