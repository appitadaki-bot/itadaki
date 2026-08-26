import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '**/dist/**',
      '.angular/**',
      'coverage/**',
      '*.config.js',
    ],
  },
  {
    // Los scripts de mantenimiento corren en Node, no en el navegador.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    // La landing es HTML plano con un script suelto: corre en el navegador,
    // no en Node ni dentro de Angular, así que sus globales se declaran acá.
    files: ['apps/landing/**/*.js'],
    languageOptions: {
      globals: {
        document: 'readonly',
        matchMedia: 'readonly',
        globalThis: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        IntersectionObserver: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
      },
    },
  },
  {
    // The service worker runs in its own global scope, not the window's.
    files: ['**/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      // Unused parameters prefixed with `_` satisfy an interface contract by design.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['libs/**/*.ts'],
    plugins: { boundaries },
    settings: {
      // Without a resolver the plugin reads `@itadaki/*` as an external package
      // and every internal boundary check silently passes.
      'import/resolver': {
        typescript: { project: './tsconfig.base.json' },
      },
      'boundaries/elements': [
        { type: 'domain', pattern: 'libs/*/domain/**' },
        { type: 'application', pattern: 'libs/*/application/**' },
        { type: 'infra', pattern: 'libs/*/infra/**' },
        { type: 'ui', pattern: 'libs/*/ui/**' },
        { type: 'tokens', pattern: 'libs/shared/ui-tokens/**' },
      ],
    },
    rules: {
      // domain stays pure: no application, no infra, no framework.
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'domain', allow: ['domain'] },
            { from: 'application', allow: ['domain', 'application'] },
            { from: 'infra', allow: ['domain', 'application', 'infra'] },
            { from: 'ui', allow: ['domain', 'application', 'ui', 'tokens'] },
            // Presentation tokens are leaf values: they import nothing.
            { from: 'tokens', allow: [] },
          ],
        },
      ],
      // `policies` y los selectores de entidad son lo que pide la v7. La regla
      // sigue siendo `external` y no `dependencies`: la nueva quiere otra forma
      // para nombrar paquetes externos que la documentación publicada no
      // explica, y probar a ciegas una regla que protege la arquitectura es
      // peor que convivir con su aviso de deprecación. Cuando la migremos, que
      // sea leyendo la guía y verificando que siga fallando lo que tiene que
      // fallar.
      'boundaries/external': [
        'error',
        {
          default: 'allow',
          policies: [
            {
              from: [{ element: { type: 'domain' } }],
              disallow: ['@angular/*', '@nestjs/*', 'rxjs', 'pg', 'typeorm', 'sharp'],
              message: 'domain must not depend on frameworks or infrastructure libraries',
            },
            {
              from: [{ element: { type: 'application' } }],
              disallow: ['@angular/*', '@nestjs/*', 'pg', 'typeorm', 'sharp'],
              message: 'application depends on ports, not concrete infrastructure',
            },
          ],
        },
      ],
    },
  },
);
