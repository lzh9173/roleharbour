import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: ['.output/**', '.wxt/**', 'output/**', 'release/**', 'node_modules/**', '*.config.*'],
  },
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // Type-aware rules for application code; tests and data stay syntax-only.
    files: ['src/**/*.{ts,tsx}', 'entrypoints/**/*.{ts,tsx}', 'data/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Dropped promises hide failed storage, download and message work.
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
);
