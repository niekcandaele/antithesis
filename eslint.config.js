import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': ['error', { allow: ['debug'] }],
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
  {
    ignores: [
      'dist/',
      'node_modules/',
      'eslint.config.js',
      'tailwind.config.js',
      'postcss.config.js',
      'tests/**/*',
      'playwright.config.ts',
      'playwright-report/**/*',
      'test-results/**/*',
    ],
  },
);
