# gitignored

[![npm version](https://img.shields.io/npm/v/gitignored-cli.svg)](https://www.npmjs.com/package/gitignored-cli)
[![license](https://img.shields.io/npm/l/gitignored-cli.svg)](https://github.com/altacomm/gitignored-cli/blob/main/LICENSE)

Zero-knowledge `.env` sharing for developer teams. Encrypt, sync, and manage environment variables without ever exposing secrets in plaintext on the server.

## Install

```bash
npm install -g gitignored-cli
```

Or run directly without installing:

```bash
npx gitignored-cli
```

## Quick start

```bash
# Authenticate via the browser
gitignored login

# Create a new project in the current directory
gitignored new --name my-app

# Push your .env.shared to the server (encrypted)
gitignored push -m "initial env"

# Pull the latest .env.shared from the server
gitignored pull

# Invite a teammate
gitignored invite teammate@example.com
```

## Command reference

| Command | Description |
| --- | --- |
| `gitignored login` | Authenticate via browser-based device flow |
| `gitignored logout` | Sign out and clear local credentials |
| `gitignored whoami` | Show the current authenticated user |
| `gitignored new` | Create a new project and generate encryption keys |
| `gitignored push [-m <msg>]` | Encrypt and push `.env.shared` to the server |
| `gitignored pull` | Pull and decrypt the latest `.env.shared` |
| `gitignored invite <email>` | Invite a team member to the project |
| `gitignored members` | List project members and pending invitations |
| `gitignored list` | List all projects you belong to |
| `gitignored switch <slug>` | Switch the active project in the current directory |
| `gitignored log` | Show the push history for the project |
| `gitignored diff` | Compare local `.env.shared` with the remote version |
| `gitignored rollback <version>` | Roll back to a previous version |
| `gitignored start` | Watch mode -- sync `.env` changes in real-time |
| `gitignored keys sync` | Sync encryption keys with the server |

## How encryption works

gitignored uses NaCl (TweetNaCl) for all cryptographic operations. No secrets ever leave your machine in plaintext.

1. **Project key** -- A random 256-bit symmetric key is generated locally when you create a project. This key encrypts and decrypts `.env` content using NaCl `secretbox` (XSalsa20-Poly1305).
2. **Identity keypair** -- Each user has a Curve25519 keypair stored locally. The public key is registered with the server.
3. **Key exchange** -- When you invite a teammate, the project key is encrypted for them using NaCl `box` (X25519-XSalsa20-Poly1305) with your secret key and their public key.
4. **Zero knowledge** -- The server only stores encrypted blobs. It never has access to the project key or the plaintext environment variables.

## CI/CD usage

For automated pipelines, use an API token instead of browser-based login:

```bash
# Set the token as an environment variable
export GITIGNORED_TOKEN=your-api-token

# Pull secrets in CI
gitignored pull --project my-app
```

You can also pass the token directly:

```bash
gitignored pull --token $GITIGNORED_TOKEN --project my-app
```

## Documentation

Full documentation is available at [gitignored.com/docs](https://gitignored.com/docs).

## License

[MIT](./LICENSE)
