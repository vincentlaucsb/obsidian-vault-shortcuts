import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig(
  globalIgnores([
    'node_modules/**', 'main.js', 'esbuild.config.mjs', 'package.json',
    'package-lock.json', 'tsconfig.json', 'versions.json', '.test-build/**',
  ]),
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.mjs', 'manifest.json'] },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.json'],
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-deprecated': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/prefer-promise-reject-errors': 'error',
      'obsidianmd/no-unsupported-api': 'error',
      'obsidianmd/no-tfile-tfolder-cast': 'error',
      'obsidianmd/settings-tab/no-deprecated-display': 'error',
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: 'ImportExpression',
        message: 'Use static runtime imports so the desktop bundle uses host-compatible CommonJS.',
      }],
    },
  },
  {
    files: ['src/ShortcutOptionsModal.ts'],
    rules: {
      // URI is the standard protocol acronym in the approved UI. Preserve its
      // capitalization while continuing to check every label for sentence case.
      'obsidianmd/ui/sentence-case': ['warn', { acronyms: ['URI', 'ID', 'URL', 'CLI', 'PNG', 'JPEG', 'ICO'], enforceCamelCaseLower: true }],
    },
  },
);
