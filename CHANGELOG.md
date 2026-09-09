# Changelog

> **Master Macro Changelog** — navigasi & ringkasan tingkat tinggi seluruh Goblin Vault.
> Detail riwayat per-tool tersedia di changelog modular masing-masing:
>
> | Tool                                    | Changelog                                        |
> | --------------------------------------- | ------------------------------------------------ |
> | `pm` — Universal Package & Registry Mgr | [`docs/CHANGELOG/pm.md`](docs/CHANGELOG/pm.md)   |
> | `sup` — Smart Universal Package Updater | [`docs/CHANGELOG/sup.md`](docs/CHANGELOG/sup.md) |
> | `fex` — File Explorer (Go)              | [`docs/CHANGELOG/fex.md`](docs/CHANGELOG/fex.md) |
> | `gn` — Goblin Nexus CLI                 | [`docs/CHANGELOG/gn.md`](docs/CHANGELOG/gn.md)   |
> | `zf` — ZF Navigation Engine             | [`docs/CHANGELOG/zf.md`](docs/CHANGELOG/zf.md)   |
> | `gb` — GitHub Assistant TUI             | [`docs/CHANGELOG/gb.md`](docs/CHANGELOG/gb.md)   |

---

## [v0.6.0] - 2026-09-08

### ⚡ gn v2.2.0 Hybrid Multi-Upstream Router (Issue #38)

- **Single Entry Hybrid Gateway (`gateway/server.ts`, `gateway/upstream-router.ts`)**:
  - `gn gw` (`:4010`) kini me-route request ke **OMP Gateway (`:4000`)** dan **VansRouter (`:20128`)** sekaligus, jadi source of truth tunggal bagi OpenCode/Hermes/agent lokal.
  - Routing **catalog-driven**: model di-resolve ke upstream yang mempublikasikannya; yang tidak dikenal jatuh ke upstream default.
  - Modul baru `upstream-router.ts`: URL mapping vendor basePath, parser catalog multi-format, dedupe merger, TTL catalog cache (30s).
- **Unified `/v1/models` Aggregator**: intercept `GET /v1/models` dan menggabungkan catalog kedua upstream (header `X-GN-Upstreams`).
- **Auto API Key dari DB VansRouter**: zero-config baca `~/.9router/db/data.sqlite`; override via `apiKeyEnv`/`apiKey` pada `gateway.upstreams`.
- Detail: [`docs/CHANGELOG/gn.md`](docs/CHANGELOG/gn.md)

---

## [v0.5.2] - 2026-08-31

### ⚡ ZF v2.0.0 Architecture Evolution & Tmux Controller

- **ZF Next-Gen Go Rewrite (`tools-cli/src/zf/`)**:
  - Full rewrite dari shell script lama menjadi compiled native binary Go + Bubble Tea + Lipgloss yang ultra-responsif (<40ms startup).
  - **Pixel-Perfect 3-Pane Layout**: Workspace, Live Git Status, dan File Tree dengan inverted full-pill highlight style.
  - **Tmux Controller & Interactive Picker (Fixes #33)**: Restorasi flag contracts `-i`, `-n`, `-d`, dan peluncuran sesi baru via `-t` / `--tmux` workspace picker dengan FZF selector dan prompt nama bersih.
  - **Runtime Glyph Calibration**: Deteksi lebar glyph DSR 6n dengan fail-fast 25ms agar border lurus sempurna di Termius & SSH mobile.
  - **Security & Hardening**: Strict action whitelisting di shell wrapper `zf init` dan safe stringify pada SSE usage telemetry.

---

## [v0.5.1] - 2026-08-28

### ⚡ Gateway Tool Normalization & Synthetic Telemetry (`gn v2.1.2`)

- **`gn gateway` Upstream Tool Translation (`sanitizer.ts`)**:
  - Auto-normalisasi OpenAI tools schema (`function.parameters`) menjadi Anthropic tools schema (`input_schema`) untuk upstream `commandcode.ai`, mencegah error 400 validation di 61+ model CommandCode.
- **`gn gateway` Synthetic Stream Usage Injector (`server.ts`)**:
  - Menginjeksi chunk `usage` standar OpenAI di akhir stream SSE ketika upstream tidak mengirimkan metrik token, memungkinkan kalkulasi biaya dan token tracking real-time di client OpenCode.

---

## [v0.5.0] - 2026-08-25

### 🚀 Major Ecosystem Evolution: `gn gateway` & `pm` Rust Manager

- **`gn gateway` Interceptor Core Engine (`tools-cli/src/gn/src/gateway/`)**:
  - **Transparent Port Takeover**: Proxy cerdas berbasis Bun di Port 4000 yang meneruskan request ke OMP Native Gateway (Port 4002) tanpa rekonfigurasi client.
  - **Zero-Copy SSE Pass-Through**: Penyaluran event-stream tanpa de-framing dengan cancellation propagation ke upstream via `req.signal`.
  - **Deterministic SHA-256 Prompt Caching**: Deduplikasi prompt identik ke cache disk (`0600`) dengan regenerasi timestamp & ID token unik, single-flight inflight guard, dan TTL 2 jam.
  - **Cascading Fallback & Circuit Breaker**: Auto-fallback saat terjadi 404/410/429 rate limit atau 5xx server error serta TTFB 15s timeout sebelum headers terkirim, dengan jeda cooldown 60s setelah 3 kegagalan beruntun.
  - **Fixture Recording & Offline Mock Replay**: Perekaman interaksi chat ke JSONL dan offline streaming replay tanpa upstream.
  - **Master Unified Config & Hardcoded Privacy**: Konfigurasi terpadu di `configs/gn/config.json` (`providerAlias` & `gateway.fallback`), hardcoded zero-retention headers, dan systemd daemon `tools-cli/src/gn/gn-gateway.service`.
  - **Unified Subcommands**: `gn gateway start|status|stats|record|mock|cache` dan alias `gn gw`, `gn g`, `gn shield`.

- **`pm` Universal Package & Registry Manager (`tools-cli/src/pm/`)**:
  - **Rust + Ratatui Refactor**: Menggantikan script TypeScript `sup` dan installer bash `ins.sh` menjadi binary native Rust berkinerja tinggi.
  - **3-Tab Split-Pane TUI**: Tab 1 (Outdated Updates dengan background scanner), Tab 2 (Live Multi-Registry Search & Install: Crates.io, NPM, PyPI, APT, Brew), Tab 3 (Installed Packages Browser).
  - **10 Ekosistem Terpadu**: Dukungan `apt`, `snap`, `flatpak`, `bun`, `omp`, `rustup`, `brew`, `pip`, `npm`, `cargo`.
  - **Safe Sudo Engine**: In-memory `Zeroizing<String>` buffer protection dengan injeksi aman stdin `sudo -S -p ""` (anti bentrok TTY).
  - **Non-Blocking Async Event Loop**: UI render instan (<1ms) dengan streaming update via Tokio unbounded channel.
  - **Compatibility Shims**: `tools-cli/bin/sup` & `scripts/shell/ins.sh` otomatis mendelegasikan ke `pm`.

- **`fex` v0.3.16 Keybinding Patch**:
  - Mengubah default keybinding `paste` dari `Ctrl-v` menjadi `Alt-v` (dengan multi-fallback `Alt-p` dan `Ctrl-v`) untuk mencegah pembajakan input oleh terminal emulator modern.

---

## [v0.4.0] - 2026-08-24

- **Automated All-in-One Installer & 1-Line Remote cURL Bootstrap (`scripts/install.sh`)**:
  - **Single-Entry Remote Bootstrap**: Dukungan eksekusi instan via `curl -fsSL https://raw.githubusercontent.com/amadshobi/goblin-vault/main/scripts/install.sh | bash` dengan auto-clone ke `~/civil/goblin-vault` dan delegasi instalasi otomatis.
  - **Dynamic Braille Spinner UX**: Tampilan langkah instalasi 1-baris halus (`⠋ ⠙ ⠹...`) dengan pelacakan durasi per-task dan box error log merah saat terjadi kegagalan.
  - **Universal Symlinking**: Distribusi seragam seluruh 5 binary CLI (`fex`, `gn`, `gb`, `sup`, `zf`) ke `~/.local/bin/` dengan canonical symlink resolver.
  - **Modular Targets**: Dukungan argumen target modular (`./scripts/install.sh fex|gn|gb|sup|zf|config|lego`) dan non-interactive mode (`--yes` / `-y`).
- **Lego Ecosystem Matrix & Diagnostic Engine (`scripts/doctor.js`)**:
  - **Tier 1 (Core Drivers)**: Verifikasi `node`, `bun`, `go`, `fzf`, `tmux`, `zoxide`.
  - **Tier 2 (Lego Power-Ups)**: Deteksi otomatis fitur `[UNLOCKED]` atau `[FALLBACK]` untuk `lazygit`, `ripgrep`, `bat`, `eza`, `fd`, `gh`, dan `clipboard` (`xclip`/`wl-copy`).
  - **Interactive Lego Installer**: Prompt interaktif `[y/N]` terproteksi dengan visual Lego Card sebelum mengeksekusi instalasi paket sistem.
- **`fex` v0.3.16 Major Upgrade (`tools-cli/src/fex/`)**:
  - **Full Customizable Dynamic Keybindings**: Mapping seluruh aksi (navigasi, mode switch, clipboard CRUD, git, search, help) dapat di-override bebas via `~/.config/fex/config.yaml`.
  - **Master Vault Config & Auto-Migration**: Standardisasi config path ke `~/.config/fex/config.yaml` (bookmarks: `~/.cache/fex-bookmarks`) dengan fallback auto-migrasi dari legacy `~/.config/fe/` dan template master di `configs/fex/config.yaml`.
  - **Subcommand `fex backup` & `fex restore`**: Dukungan sinkronisasi config `fex backup fex|micro|nvim|all` dan `fex restore fex|micro|nvim|all`.
  - **Instant Mode Switcher (`Tab`)**: Beralih instan antara **Tree Mode (`🌳`)** dan **Flat Find (`🔍`)** tanpa keluar dari sesi.
  - **Interactive File Clipboard Engine**: Tandai salin (`Alt-c`), pindah (`Alt-m`), dan tempel (`Alt-v` / `Ctrl-v`) dengan penanganan tabrakan nama otomatis, rekursif, dan retensi posisi kursor (`load:pos`).
  - **Context-Aware Git Action (`Ctrl-G`)**: Membuka Git History & Diff Viewer Split saat kursor di FILE, atau meluncurkan `lazygit` TUI saat kursor di FOLDER.
  - **Large Directory Warning Guard**: Popup peringatan fzf saat memindai direktori besar (`$HOME` / `/`) pada Flat Find untuk mencegah lag/freeze.
- **Master Neovim Configuration by amadshobi (`configs/nvim/`)**:
  - Integrasi master LazyVim distribution dengan ergonomi navigasi hybrid Micro/VS Code (`Ctrl-S` save, `Ctrl-Z` undo, `Ctrl-X` quit, `whichwrap`), kecepatan autocompletion **Blink.cmp**, floating terminal **Snacks.nvim** (`<F4>` / `<Alt-t>`), OpenCode JSON schema validator, dan custom frontmatter dictionary.
  - Dokumentasi lengkap di `configs/nvim/README.md`.
- **Automated VHS Showcase Suite (`docs/vhs/`)**:
  - 6 template tape Charmbracelet VHS (`fex.tape`, `gn.tape`, `gn-bench.tape`, `gn-usage.tape`, `gn-doctor.tape`, `sup.tape`, `gb.tape`, `zf.tape`, `installer.tape`) dan re-render seluruh GIF aset resolusi tinggi di `docs/assets/gif/`.
- **Governance & Policy Consolidation**:
  - Menggabungkan seluruh standar rekayasa ke `AGENTS.md` (Severity, Naming, Standar ASCII Banner, Pre-Change Checklist) dan menghapus folder usang `docs/rules/` serta media mentah yang kadaluarsa.
  - Pembaruan GitHub Actions CI workflow dengan FEX Go unit tests, automated installer tests, dan 5-tool smoke test suite.

---

### Added

- **`pm` v0.1.0 (Universal Package & Registry Manager — Rust + Ratatui + Tokio)**:
  - **Refactor Sup & Peleburan `ins.sh`**: Menggantikan script updater TypeScript (`sup`) dan pencarian bash glue (`ins.sh`) menjadi satu binary Rust native yang komprehensif.
  - **Unified 3-Tab Split-Pane TUI**: Tab 1 (Outdated Updates dengan background scanner & batch updater), Tab 2 (Live Multi-Registry Search & Install: Crates.io, NPM, PyPI, APT, Brew), Tab 3 (Installed Packages Browser).
  - **10 Ekosistem Terpadu**: Dukungan `apt`, `snap`, `flatpak`, `bun`, `omp`, `rustup`, `brew`, `pip`, `npm`, `cargo`.
  - **Safe Sudo Engine**: In-memory `Zeroizing<String>` buffer protection dengan injeksi aman stdin `sudo -S -p ""` (anti bentrok TTY).
  - **Non-Blocking Async Event Loop**: UI render instan (<1ms) dengan streaming update via Tokio unbounded channel.
  - **Backward-Compatible Shims**: `tools-cli/bin/sup` & `scripts/shell/ins.sh` otomatis mendelegasikan perintah ke `pm`. → [detail](docs/CHANGELOG/pm.md)

- **`gn` v2.0.2 (Leaderboard Benchmark, Native OMP Usage Forwarding, & Tree Auth Matrix)**:
  - **Speed Leaderboard & Visual Benchmark Matrix (`gn bench`)**: Rombak total benchmark menjadi leaderboard terurut berdasarkan throughput (`tok/s`), visual throughput gauge bar (`████████░░░░`), **Smart Ping Cache Synergy** (otomatis hanya menguji model `200 OK` dari ping cache), Champion summary card, dan opsi `--top <N>` serta `--all`.
  - **Native `omp usage` Forwarding (`gn usage`)**: Integrasi langsung dengan binary `omp usage` untuk visual progress bar block (`████░░░░`), multi-account breakdown, dan kalkulasi kapasitas total kuota.
  - **Token Window & File Diffs (`gn u -t` & `gn u -f`)**: Dukungan fleksibel rentang hari (`--day <N>`, `-d <N>`, `--all`) dan pelacakan file modifications diff (`+lines -lines`) pada Main Agent.
  - **Tree-Structured Doctor & Zero-Secret Auth Matrix (`gn doctor`)**: Layout berjenjang (`├──`, `└──`) dalam 4 kategori dan audit kredensial aman dari `agent.db` tanpa ekspos token/secret.
  - **Smart Reasoning Auto-Fallback (`gn ping`, `gn bench`)**: Auto-retry otomatis dengan `reasoning_effort: "low"` saat mendeteksi error thinking MINIMAL, membuka akses model reasoning `gemini-3.7-flash-tiered` dan `gemini-3.1-pro`.
  - **Reliability & Port Timeout Fix**: Timeout proteksi 1000ms via `net.Socket` pada `gn ping local` dan penyelarasan cache path ke `~/.config/gn/cache`. → [detail](docs/CHANGELOG/gn.md)

---

## [v0.3.35] - 2026-08-14

### Added

- **`gb` v2.2.0 (GitHub App Bot Persona Actions & Native RS256 JWT Auth)**:
  - Peluncuran subcommand `gb bot` untuk automasi menggunakan identitas GitHub App resmi (App ID, Installation ID, dan Private Key .pem).
  - Subcommands: `gb bot status` (visual audit koneksi, scopes, dan repositori via Clack), `gb bot token` (raw token minting khusus shell piping `export GITHUB_TOKEN=$(gb bot token)`), `gb bot comment <issue/PR> [pesan]` (+ `--repo` & `--body-file`), dan `gb bot config` (wizard interaktif konfigurasi).
  - **Hybrid Credential & File-Ref Resolution**: Prioritas Env Vars (`GB_BOT_*`) > `~/.config/gb/settings.json` (mode `0600`) > `{file:...}` expansion untuk integrasi secret manager.
  - **Native RS256 JWT & Zero-Dependency Client**: Pembuatan token JWT langsung menggunakan `node:crypto.createSign("RSA-SHA256")` dan HTTP transport native `node:https`. → [detail](docs/CHANGELOG/gb.md)

---

## [v0.3.34] - 2026-08-12

- **`gn` v2.0.0 Refactor**: Storage cache terpusat di `~/.config/gn/cache/` dengan auto-migration, dual-mode execution (`gn ping` & `gn bench` cache instant ~5ms vs `--force` live hit), upgrade total icons CLI ke Nerd Font (`󰄬`, `󰅚`, `󰀦`, `󰓅`, `󰒓`, `󱈸`, `󱎫`, `󰋼`, `󰑐`, `󰈙`, `󰓹`, `󰋽`, `󰚌`, `󰘚`), layout `gn usage` 1-line padat dengan thin-line progress bar (`━━━━────────`), Daily Tokens & Subagent Activity Tree (`gn u -t`), File Modification Audit Mode (`gn u -f`), Compact Table mode (`gn u -t -m`), Session Explorer (`gn s list`), Dual-Level Help Standard, dan fuzzy Levenshtein error matcher (`utils/error.ts`). → [detail](docs/CHANGELOG/gn.md)
- **`gn ping` Live Probe Reliability**: Perbaikan mode `gn p <provider> --force` dengan Clack spinner per-model tanpa label berisik, payload probe valid (`Reply with only: ok`, `max_tokens: 50`), timeout default 10 detik, dan preservasi tampilan cache boxed table. → [detail](docs/CHANGELOG/gn.md)
- **`check_syntax.js` & `doctor.js` JS Engine Migration**: Migrasi total script validator repositori dari Bash kuno (`check_syntax.sh` & `doctor.sh`) ke Node.js / Bun Engine yang jauh lebih cepat, paralel, dan kaya fitur.
- **Multi-Language & Executable Permission Check**: Penambahan audit ijin eksekusi (`+x`) pada semua binary & scripts, rincian per-file `.go`, `.js`, `.ts`, dan `.sh`, serta parser error presisi (`file:line:col`) dengan format Arrow Identifier (`↳`) dan Goblin Roast Summary (`🤨 NIH BOSS FILE YANG ERROR:`).
- **Flexible CLI Flags**: Dukungan flag `--staged` (`-s`), `--working` (`-w`, mengecek modified & untracked files), dan `--full` (`-f`).

### Removed

- **Legacy Bash Wrappers**: Penghapusan total file wrapper `scripts/check_syntax.sh` dan `scripts/doctor.sh`.

---

## [v0.3.32] - 2026-08-06

### Added

- **`gb` v2.1.3 (FinOps Cost Logger, Hybrid Prompt Engine, PAGER Hardening, & Ultra-Clean TUI Streamer)**: Integrasi FinOps Token & Cost Analytics Logger (`~/.config/gb/logs/` & `price.json`), Modular Hybrid Prompt System (`src/prompts/*.md` + `~/.config/gb/prompts/`), Clean Model/Variant Manager (`models.json`), Deep Issue Technical Analysis (`gb issue analyze <num>`), PAGER RCE hardening via `spawnSync` & allowlist, temporary file system prompt isolation, READ-ONLY PR review tools (`read,glob,grep`), serta TUI streamer layout & Dual-Level Help update. → [detail](docs/CHANGELOG/gb.md)

## [v0.3.31] - 2026-08-06

### Changed

- **`gb` v2.1.2 (Pure OMP Single-Engine Architecture)**: Simplifikasi LLM engine 100% berbasis OMP CLI (`omp --mode=json --no-session`), menghapus fallback `opencode` & `curl`, dan menjamin zero-session-trash di disk. → [detail](docs/CHANGELOG/gb.md)

## [v0.3.30] - 2026-08-06

### Changed

- **`gb` v2.1.1 (NDJSON LLM Streaming Engine & OMP Auto-Selection)**: Mengubah `streamLLM` di `gb` agar otomatis menggunakan backend `omp` dengan flag `--mode=json` & `--print-thoughts`, menghadirkan streaming token-by-token dan visualisasi thinking real-time serealistis `sub`. → [detail](docs/CHANGELOG/gb.md)

## [v0.3.29] - 2026-08-06

### Changed

- **`gb` v2.1.0 (Full TypeScript Migration, Sub Engine Adoption, & Issue Suite)**: Porting 100% codebase `gb` ke TypeScript modular, adopsi Live Streaming LLM Engine dari `sub`, penambahan `gb issue summarize` & `gb issue analyze`, serta pembersihan total (purge) file JS legacy. → [detail](docs/CHANGELOG/gb.md)

## [v0.3.28] - 2026-08-06

### Added

- **`gb` v2.0.0 (Refactoring Rename `gh-blin` → `gb`)**: Rename menyeluruh tool `gh-blin` menjadi `gb` — binary, source code, changelog, dokumentasi, scripts, CI/CD, dan issue templates. → [detail](docs/CHANGELOG/gb.md)
- **`gb` v0.1.0 (GitHub Profile Management Subcommand `gb profile`)**: Menambahkan subcommand `profile` untuk melihat profil GitHub dalam format ANSI Box Card serta mengedit Bio, Name, Company, Location, & Blog secara interaktif maupun via CLI Flags (`--bio`, `--name`, dll). Terintegrasi dengan Dual-Level Help system. (Issue #12) → [detail](docs/CHANGELOG/gb.md)

## [v0.3.27] - 2026-08-06

### Fixed

- **`ocm` v0.3.16 (Immutability Refactor & Splice Elimination)**: Menghapus semua mutasi in-place `Array.prototype.splice` di `tools-cli/src/ocm/src/utils/utils.ts` dan `commands/reference.ts`. Logika insert dan delete model kini 100% immutable (Issue #3). → [detail](docs/CHANGELOG/ocm.md)

## [v0.3.26] - 2026-08-05

### Added

- **`gn` Standalone v1.0.0 TypeScript Engine Port**: Port total core `gn` dari Shell Script ke TypeScript modular (`tools-cli/src/gn/src/`) dengan pure terminal formatter (`utils/formatter.ts`) dan tabel TUI ANSI-aware alignment fix (`visibleWidth`). → [detail](docs/CHANGELOG/gn.md)

### Removed

- **`gn` Legacy Script & Dead-code Purge**: Pembersihan sisa script legacy (`quarantine.sh`, `bench.ts`, `doctor.sh`, `price.ts`, dll) dan penyelarasan router `gn.sh` & `help-formatter.sh`. → [detail](docs/CHANGELOG/gn.md)

## [v0.3.25] - 2026-08-03

### Removed

- **`gn` Pembersihan Bom Waktu & Redundansi**: Penghapusan 6 file bermasalah dari `tools-cli/src/gn/`:
  - `quarantine.sh` (575 LoC) & inline `gn export` SQL block di `gn.sh` — manipulasi langsung `auth_credentials` SQLite + dump API key plaintext.
  - `config.ts` (~270 LoC) — JSONC parser manual berbasis regex yang rapuh.
  - `bench.ts` (487 LoC), `pool-manager.ts` (385 LoC), `agent.sh` (128 LoC), `picker.sh` (75 LoC) — redundan dengan REST API OMP.
  - Helper dead-code `_run_bench_action` di `gn.sh`, serta section "Credential Health" SQL query di `doctor.sh`.
- **Deprecation Guard** di `gn.sh` untuk handler `ping|p`, `bench|b`, `quarantine|q`, `export|e` — sekarang hanya tampilkan warning + hint REST API OMP / CLI `omp` / `ocm`. Level 1 help & Level 2 help untuk keempat command dihapus/di-update. → [detail](docs/CHANGELOG/gn.md)

## [v0.3.24] - 2026-08-02

### Added

- **`gb` v1.1.1 (Magic `omp` Runner, `@file` Stdin Pipe, & 5 Reasoning Effort Variants)**: Integrasi backend `omp` (`--no-session`) via 3 huruf sakti `omp` di CLI, dukungan 5 reasoning effort variants (`high`, `medium`, `low`, `auto`, `none`), handling prompt `@file` untuk menghapus `E2BIG` limit, serta nested backend model mapping (`utils/models.json`). → [detail](docs/CHANGELOG/gb.md)
- **`gn` Custom Provider Sync & Network Fallback**: `gn export` mendukung ekspor provider custom dari `models.yml` (seperti `peezy`), dan `gn ping`/`gn bench` mendukung auto-discovery provider custom + IPv4 connection fallback. → [detail](docs/CHANGELOG/gn.md)
- **Changelog Guardrail Per-Tool (`scripts/check_syntax.sh`)**: Sistem pre-commit checker otomatis yang memperingatkan jika ada perubahan source code tool di `tools-cli/src/` tetapi belum ng-stage changelog per-tool (`docs/CHANGELOG/<tool>.md`) atau master `CHANGELOG.md`. → [detail](docs/CHANGELOG/gb.md)

### Fixed

- **`gb` Flag Collision & Quality Patches**: Pemisahan flag `--auto` (batch) dari variant `auto` (`--eff-auto`), preservasi error context `callOmp`, caching `hasCmd` subprocess, warning precedence `--model` vs `--variant`, penanganan prompt besar via stdin pipe, dan visual box truncation footer terminal. → [detail](docs/CHANGELOG/gb.md)
- **Automated Release Engine (`scripts/release.sh`)**: Perbaikan skrip rilis otomatis agar men-substitusi header `## [v0.3.25] - 2026-08-05` paling atas di `CHANGELOG.md`, memicu `--full` syntax check saat rilis vault, dan menggunakan guarded syntax `[[ "${TARGET:-}" == ... ]]`. → [detail](docs/CHANGELOG/gb.md)

## [v0.3.22] - 2026-08-02

- **`gb` Automated AI PR Review Subsystem & Security Hardening**: Patch rilis awal untuk integrasi sub-system review, `spawnSync` array argv injection proofing, dan atomic review logging. → [detail](docs/CHANGELOG/gb.md)

## [v0.3.21] - 2026-08-01

- **`gb` Automated AI PR Review Subsystem (v1.1.0)**: Peluncuran subcommand `gb pr review <number>` & batch scheduled `--auto` / `--all`, penayangan review terminal box, dan dukungan `--publish` komentar resmi GitHub PR. → [detail](docs/CHANGELOG/gb.md)
- **Model Variant Presets (`high`, `medium`, `low`)**: Dukungan preset AI review (Default active variant: **`high`** — `claude-3-5-sonnet`), variant `medium` (`gemini-3.5-flash`), variant `low` (`gemini-2.5-flash`), serta short flags CLI (`--high`, `--medium`, `--low`, `--variant <name>`, dan `--model <name>`). → [detail](docs/CHANGELOG/gb.md)
- **Config Subsystem (`gb config`)**: Subcommand configurator permanen `gb config set/get/list` untuk mengatur active variant & custom model per variant. → [detail](docs/CHANGELOG/gb.md)
- **Token Usage Logging**: Pencatatan metadata model, variant, backend, dan perincian token (`prompt`, `completion`, `total`) secara atomik di `~/.config/goblin-vault/gb-reviews.json` & footer ANSI-aware terminal. → [detail](docs/CHANGELOG/gb.md)
- **Shell-Injection Security Hardening**: Refactor total `ghExec`, `ghRaw`, dan `ghApi` dari `execSync` string concatenation ke `spawnSync` array argv verbatim di seluruh 44+ call-site. → [detail](docs/CHANGELOG/gb.md)
- **Dual-Level Help System & Practical Examples**: Penambahan section `Examples:` praktis pada `gb --help` dan `gb config --help`. → [detail](docs/CHANGELOG/gb.md)

## [v0.3.20] - 2026-08-01

- **UI & Documentation Polish**: Responsive SVG Neon Cyberpunk Banner (`docs/assets/banner.svg`), Vibrant Cyberpunk Neon Badges (`for-the-badge` style dengan `labelColor=0D1117`) di root README & 6 sub-README, folder media assets (`docs/assets/gif/` & `docs/assets/screenshoot/`), dan standalone per-tool READMEs dengan ASCII block headers. → [detail](docs/CHANGELOG/sup.md) · [detail](docs/CHANGELOG/fex.md) · [detail](docs/CHANGELOG/gn.md) · [detail](docs/CHANGELOG/ocm.md) · [detail](docs/CHANGELOG/zf.md) · [detail](docs/CHANGELOG/gb.md)
- **Open-Source Hygiene Suite**: Penambahan panduan kontribusi (`CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` v2.1, `SECURITY.md`, `CODEOWNERS`), form Issue GitHub Interaktif (bug report, feature request, config), Pull Request template terstandarisasi, dan konfigurasi Branch Protection Rules untuk `main`.
- **Housekeeping & Maintenance**: Konsolidasi riwayat historis `fex` ke `docs/CHANGELOG/fex.md` (membersihkan duplicate file lama di source tree) dan perbaikan Git tracking untuk meng-untrack file config local `opencode.jsonc`. → [detail](docs/CHANGELOG/fex.md)

## [v0.3.19] - 2026-07-30

### Added

- **`sup` v1.1.0 Feature Release**: granular package picker UI (default ALL selected), verbose streaming mode (`-v`), dynamic version auto-detect, precision scanner filters. → [detail](docs/CHANGELOG/sup.md)
- **`sup` TypeScript Migration**: `sup` diporting dari bash (`scripts/shell/sup.sh`) ke TypeScript modern (`tools-cli/src/sup/`) dengan Clack TUI + Dual-Level Help. → [detail](docs/CHANGELOG/sup.md)
- **`gn usage` engine**: modul unified quota live + token burn real (menggantikan `status-formatter.ts` & `burn.ts`). → [detail](docs/CHANGELOG/gn.md)
- **Goblin Shield telemetry logger** + **systemd user service** (`gn-shield.service`) + subcommand `gn shield service`. → [detail](docs/CHANGELOG/gn.md)

### Fixed

- **`sup` v1.0.1**: sudo loop fix pada `sup all`, `omp` update flag fix, UI/UX polish. → [detail](docs/CHANGELOG/sup.md)

### Changed

- `gn usage / u` routing delegasi ke `usage.ts`; `gn bench` tanpa role specialization. → [detail](docs/CHANGELOG/gn.md)

### Removed

- `burn.ts` & `status-formatter.ts` (digantikan `usage.ts`); matematika `assumedTotal 100k`; `scripts/shell/sup.sh` (diarsipkan ke `docs/history/sup-migration/`). → [detail](docs/CHANGELOG/gn.md) · [detail](docs/CHANGELOG/sup.md)

## [v0.3.15] - 2026-07-28

- Global Ultra-Clean ASCII Art Banners untuk suite CLI (GN, ZF, FEX, OCM) — banner seragam, nama tool + versi di bawah banner, pure white, margin atas lega. → [detail](docs/CHANGELOG/gn.md) · [detail](docs/CHANGELOG/zf.md) · [detail](docs/CHANGELOG/fex.md) · [detail](docs/CHANGELOG/ocm.md)

## [v0.3.14] - 2026-07-28

- `ocm` full TypeScript migration + workspace auto-discovery engine; dashboard integrator TUI; fix registry subcommand `ocm manage`. → [detail](docs/CHANGELOG/ocm.md)

## [v0.3.13] - 2026-07-27

- `gn`: Ollama Cloud real-time scraper & metadata fetcher + refactor immutability & identity-based lookup. → [detail](docs/CHANGELOG/gn.md)

## [v0.3.11] - 2026-07-27

- `gn` Dual-Level Help System untuk seluruh subcommand. → [detail](docs/CHANGELOG/gn.md)

## [v0.3.10] - 2026-07-27

- `scripts/check_syntax.sh`: TypeScript/AST support + fast staged mode (`--staged`) untuk pre-commit.

## [v0.3.9] - 2026-07-27

- `gn bench` dynamic multi-role benchmark engine + `gn ping` visual UX upgrade. → [detail](docs/CHANGELOG/gn.md)

## [v0.3.8] - 2026-07-27

- `gn burn` (token & cost burn tracker) + `gn status` upgrade (visual status dot, capacity summary). → [detail](docs/CHANGELOG/gn.md)

## [v0.3.5] - 2026-07-26

- `shield-interceptor.ts` smart fallback array chain + header debug `X-Goblin-Shield-Fallback`; fast staged linter; dokumentasi prosedur release. → [detail](docs/CHANGELOG/gn.md)

## [v0.3.0] - 2026-07-26

- `scripts/release.sh` — Modular SemVer release engine (vault & per-tool).
- Port `gn`, `zf`, `shield` dari `~/.shell/` ke `tools-cli/`; `gn pool`, visual engine. → [detail](docs/CHANGELOG/gn.md) · [detail](docs/CHANGELOG/zf.md)
- `fex` refactor: pecah `cmd/root.go` & `tree.go`, rename binary `fe` → `fex`, entrypoint `cmd/fex`, fix rename/tmux/keybinding. → [detail](docs/CHANGELOG/fex.md)
- `scripts/shell/ins.sh` & `scripts/shell/sup.sh`; OSS foundation (LICENSE, hooks, CI, coding-style, AGENTS, README overhaul). → [detail](docs/CHANGELOG/sup.md)

## [0.1.0] - 2026-07-08

- `fex` rewrite dari shell `fe` ke Go CLI `fex` (v4.0) + berbagai fix tree mode. → [detail](docs/CHANGELOG/fex.md)

## [0.0.2] - 2026-07-07

- `worktree.sh` (Git Worktree Manager), `notes` tool, scaffolding `tools-cli/` + check_syntax/doctor/install scripts; `fe` refactor modular (v3.0). → [detail](docs/CHANGELOG/fex.md)

## [0.0.1] - 2026-07-06

- Foundation: konfigurasi OpenCode, agents/commands/plugins, skills, `fe` v1.0, `gb`, `gh_tui`, `goblin-control`, `ocm`, utility scripts. → [detail](docs/CHANGELOG/fex.md) · [detail](docs/CHANGELOG/gb.md) · [detail](docs/CHANGELOG/ocm.md)

---

## Format

This changelog follows [Keep a Changelog](https://keepachangelog.com/) conventions:

- **Added** for new features
- **Changed** for changes in existing functionality
- **Deprecated** for soon-to-be removed features
- **Removed** for now removed features
- **Fixed** for bug fixes
- **Security** for vulnerability fixes

Riwayat detail per-tool dipecah ke `docs/CHANGELOG/<tool>.md`; file ini hanya
memuat poin makro tingkat tinggi dan navigasi.
