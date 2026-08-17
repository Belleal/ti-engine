# License

This repository is a monorepo and its packages are **not** all under the same license. Each package carries its
own `LICENSE` file, which is the authoritative license for that package's published code. Individual source files
also carry a header identifying the license that applies to them.

| Package | License | SPDX identifier |
|---|---|---|
| [`@ti-engine/core`](packages/core) | Apache License 2.0 | `Apache-2.0` |
| [`@ti-engine/web-framework`](packages/web-framework) | Apache License 2.0 | `Apache-2.0` |
| [`@ti-engine/web-content`](packages/web-content) | Apache License 2.0 | `Apache-2.0` |
| [`@ti-engine/tester`](packages/tester) | Apache License 2.0 | `Apache-2.0` |
| [`@ti-engine/competence`](packages/competence) | GNU Affero General Public License v3.0 (or later) | `AGPL-3.0-or-later` |

In short:

- **`core`, `web-framework`, `web-content`, and `tester`** are permissively licensed under **Apache-2.0** so they
  can be freely embedded in other projects, open or closed source, with attribution and without an obligation to
  release the combined work's source.
- **`competence`** is licensed under **AGPL-3.0-or-later**. You're free to use, self-host, and modify it, but if
  you run a modified version as a network service for others, you must make the corresponding source available to
  those users. A separate commercial license, without the AGPL's network-copyleft obligation, is available on
  request from the copyright holder — contact `kostadinov.boris@gmail.com`.

Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for how contributions are licensed.
