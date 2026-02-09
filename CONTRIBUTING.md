# Contributing to gitignored

Thanks for your interest in contributing to gitignored! This guide will help you get started.

## Development setup

1. **Clone the repo**

   ```bash
   git clone https://github.com/cyruskelly/gitignored-cli.git
   cd gitignored-cli
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Build the project**

   ```bash
   npm run build
   ```

4. **Run locally**

   ```bash
   node dist/index.js --help
   ```

   Or link it globally during development:

   ```bash
   npm link
   gitignored --help
   ```

## Running tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npx vitest

# Type-check without emitting
npm run type-check
```

## Submitting a pull request

1. Fork the repository and create a new branch from `main`.
2. Make your changes. Add or update tests if applicable.
3. Make sure `npm run build`, `npm test`, and `npm run type-check` all pass.
4. Write a clear commit message describing what you changed and why.
5. Open a pull request against `main`.

## Code style

- TypeScript with strict mode enabled.
- ESM modules (no CommonJS `require`).
- Keep functions small and focused.
- Use descriptive variable and function names.
- Avoid adding new dependencies unless absolutely necessary.
- All crypto operations use TweetNaCl (NaCl) -- do not introduce alternative crypto libraries.

## Reporting issues

If you find a bug or have a feature request, please open an issue on GitHub. Include steps to reproduce the problem and any relevant error messages.
