import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig(
  globalIgnores([
    'node_modules/**', 'main.js', 'esbuild.config.mjs', 'package.json',
    'package-lock.json', 'tsconfig.json',
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
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
);
