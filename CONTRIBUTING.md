# Contributing

Report bugs in the [issue tracker](https://github.com/vincentlaucsb/obsidian-vault-shortcuts/issues).
Include plugin, Obsidian and OS versions, the action used, the error message,
and whether creation or launching failed. Redact private vault names and paths.

Read [AGENTS.md](AGENTS.md) and the [product plan](docs/PLAN.md) before changing
behavior. Keep fixes scoped to demonstrated problems and preserve existing files.
Use TypeScript with strict checking for implementation and tests.

See [development and release checks](docs/DEVELOPMENT.md) for setup and validation,
[isolated UI testing](docs/UI-TESTING.md) for Windows host checks, and the
[review remediation procedure](docs/obsidian-warning-remediation.md) for directory
feedback. Test with fictional vaults; never automate a personal vault.

Submit a pull request explaining the problem, behavior changed and checks run.
Do not commit generated main.js, local profiles or private data. Publication and
release tags are maintainer actions separate from a source change.
