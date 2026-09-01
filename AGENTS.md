# Repository Guidelines

## Project Structure & Module Organization

Herd Editor is a WordPress plugin for editing ACF block content. The plugin entry point is `herd-editor.php`; server-side behavior lives in `includes/`. Browser code lives in `src/`: `src/ui/` contains editor UI modules, `src/acf/` bridges ACF behavior, and `src/css/` contains Sass partials imported by `src/editor.scss`. Webpack writes distributable JavaScript and asset manifests to `build/`; keep those outputs in sync when changing source. Tests are Node test-runner files in `tests/`, with shared samples in `tests/fixtures/`. Developer utilities belong in `tools/`; design notes and mockups belong in `docs/`.

## Build, Test, and Development Commands

Install JavaScript dependencies with `npm install` and PHP development tools with `composer install`.

- `npm run start` watches and rebuilds editor bundles during local WordPress development.
- `npm run build` creates production bundles in `build/`.
- `npm test` runs all `tests/**/*.test.js` files using Node's built-in test runner and JSDOM.
- `composer lint` runs PHPCS with the repository's WordPress and VIP rules.
- `composer analyse` runs PHPStan; use it before changes to PHP behavior are merged.
- `composer format` runs PHPCBF where automatic fixes are appropriate; review its diff carefully.

## Coding Style & Naming Conventions

Match the nearby code. JavaScript uses ES modules, tabs for indentation, single quotes, semicolons, and descriptive camelCase functions. Name UI modules by feature (for example, `src/ui/acf/repeater.js`) and keep behavior narrowly focused. PHP uses WordPress conventions, tab indentation, `snake_case` functions, and the `herd_editor_` / `HERD_EDITOR_` prefixes for globals and constants. Escape output, validate request data, and use the `herd-editor` text domain. Do not hand-edit generated `build/` files.

## Testing Guidelines

Add or update a focused `*.test.js` file for changed JavaScript behavior. Use `node:test` and `node:assert/strict`; name tests as observable sentences, such as `test( 'clearing an anchor removes the attribute', ... )`. Include JSDOM fixtures for DOM and ACF interactions. There is no stated coverage threshold, but every behavior change should have a regression test where practical.

## Commit & Pull Request Guidelines

Use concise, imperative, behavior-led commit subjects, often beginning with `Herd Editor:` (for example, `Herd Editor: preserve loaded ACF forms`). Keep unrelated refactors separate. Pull requests should explain the user-visible change, list validation commands run, link the relevant issue when available, and include screenshots or recordings for editor UI changes. Note any WordPress or ACF version assumptions.
