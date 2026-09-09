# Changelog — `gn`

> Riwayat lengkap perubahan untuk tool **`gn`** (Goblin Nexus CLI).
> Master changelog: [CHANGELOG.md](../../CHANGELOG.md)

Format mengikuti [Keep a Changelog](https://keepachangelog.com/).

## [v2.2.0] - 2026-09-08

### Added

- **Hybrid Multi-Upstream Router (`gateway/server.ts`, `gateway/upstream-router.ts`)**:
  - GN Gateway (`:4010`) kini menjadi single entry yang me-route request ke beberapa upstream sekaligus: **OMP Gateway (`:4000`)** dan **VansRouter (`:20128`)**.
  - Routing bersifat catalog-driven: model di-resolve ke upstream yang mempublikasikan model tsb di `/v1/models`; model yang tidak dikenal jatuh ke default upstream (kompatibilitas ke belakang).
  - Modul baru `gateway/upstream-router.ts`: `buildUpstreamUrl`, `parseModelIds` (OpenAI list / object map / array), `resolveUpstreamForModel`, `mergeModelResponses` (dedupe lintas-upstream), `collectCatalogs` (fetch paralel + TTL cache 30s).
- **Unified `/v1/models` Aggregator (`gateway/server.ts`)**:
  - Intercept `GET /v1/models` menggantikan proxy passthrough, menggabungkan catalog kedua upstream menjadi satu daftar OpenAI-style dengan header `X-GN-Upstreams` (jumlah upstream yang berhasil di-fetch).
- **Upstream API Key Auto-Resolution (`gateway/upstream-router.ts`)**:
  - Zero-config: key VansRouter dibaca langsung dari DB `~/.9router/db/data.sqlite` (tabel `apiKeys`, `isActive=1`).
  - Override opsional via env var (`apiKeyEnv`) atau manual (`apiKey`) pada definisi `gateway.upstreams`; key hanya dikirim sebagai `Authorization: Bearer` ke upstream yang memilikinya.
- **Multi-Upstream CLI Presentation (`commands/gateway.ts`)**:
  - Banner `start` & `record` menampilkan daftar seluruh upstream beserta base URL; `status`/`/gn/health` merender daftar upstream lengkap.

### Changed

- `configs/gn/config.json` kini memuat seksi `gateway.upstreams` sebagai template (user config `~/.config/gn/config.json` menimpa/melebarkan daftar default).

## [v2.1.4] - 2026-09-01

### Fixed

- **Anthropic Messages Endpoint Streaming Guard (`gateway/server.ts`)**:
  - Menambahkan deteksi endpoint `isMessagesReq` (`/messages`) pada streaming response handler.
  - Mematikan injeksi synthetic OpenAI completion usage chunk (`chat.completion.chunk`) pada endpoint Anthropic Messages agar tidak merusak format streaming SSE pada client Anthropic.

## [v2.1.3] - 2026-08-29

### Fixed

- **`gn-gateway.service` Systemd NAMESPACE Failure (`gn-gateway.service`)**:
  - Mengganti `ReadWritePaths` untuk direktori cache (`~/.cache/gn`, `~/.cache/goblin-nexus`) dengan directive `CacheDirectory=gn goblin-nexus` — systemd otomatis membuat direktori sebelum service start, sehingga survive cache cleanup tanpa `status=226/NAMESPACE`.
  - Menambahkan `ReadWritePaths=%h/.config/goblin-nexus` yang sebelumnya terlewat (dipakai oleh `pricing.ts` untuk `prices.json`).
- **OMP Runner Script Restore to Canonical Architecture (`omp-daemon-runner.sh`)**:
  - Mengembalikan `omp-daemon-runner.sh` ke arsitektur asli OMP: auth-gateway langsung bind di port `4000` (bukan `4002`), menghapus step 3 orphan yang menjalankan `gateway-proxy.ts` yang sudah tidak ada.
  - Menghapus env vars usang (`OMP_INTERNAL_GATEWAY_URL`, `OMP_GATEWAY_PORT`).
  - Chain sekarang: `opencode → gn-gateway:4010 → omp auth-gateway:4000` (2 layer, bukan 3).
- **Port Range Comment Alignment (`gateway.ts`, `gn-gateway.service`)**:
  - Menyelaraskan komentar referensi port OMP ecosystem dari `4000-4002` ke `4000-4001` di `gateway.ts` dan `gn-gateway.service`.

## [v2.1.2] - 2026-08-28

### Added

- **CommandCode Tool Normalizer (`gateway/sanitizer.ts`)**:
  - Auto-normalisasi format tools OpenAI standard (`type: "function", function: { name, description, parameters }`) menjadi format schema Anthropic (`name`, `description`, `input_schema`) khusus untuk request yang ditujukan ke endpoint upstream `commandcode.ai`.
  - Mencegah error `400 BAD_REQUEST (Invalid input: expected string at "params.tools[0].name")` pada seluruh 61+ model CommandCode.
- **Synthetic SSE Usage Injector (`gateway/server.ts`)**:
  - Menginjeksi chunk `usage` standar OpenAI (`prompt_tokens`, `completion_tokens`, `total_tokens`, `choices: []`) di akhir stream SSE sebelum `data: [DONE]` saat upstream tidak mengirimkan metrik token (seperti CommandCode & Ollama).
  - Mengaktifkan pelacakan token riil dan kalkulasi estimasi biaya (`cost`) otomatis di client (OpenCode TUI / telemetry).

## [v2.1.1] - 2026-08-26

### Added

- **Structured Access Logger & Live Analytics (`gateway/access-log.ts`, `gn gw log`)**:
  - **Append-Only JSONL Access Logger**: Mencatat seluruh traffic request gateway ke `~/.cache/gn/gateway/access.jsonl` (timestamp, method, path, latency, cache status, model chain, shield redacted, error) dengan rotasi otomatis (10 MB -> `.old`).
  - **Cascading Fallback Hop Visualization**: Melacak dan merender seluruh rantai hop fallback secara visual (misal `✖ kilo-auto (503) → ✓ minimax-m3` dengan status badge `⚠ FB×N`).
  - **CLI `gn gw log` Subcommand**:
    - Mode Boxed Table Default: Tabel bordered ANSI rapi dengan metrics agregasi di footer (`Total`, `Hits`, `Misses`, `Hit Rate %`, `Fallbacks`, `Errors`).
    - Flag `--stream` (`-s`): Live tail real-time request stream dengan graceful exit (Ctrl+C).
    - Flag `--json` (`-j`): Output pure JSONL machine-readable tanpa ANSI codes.
    - Filter `--errors` (`-e`) & `--model <id>` (`-m`): Filter instan untuk troubleshooting & audit kegagalan model.
    - Flag `--limit <N>` (`-l`): Kontrol jumlah riwayat log (default: 30, max: 1000).

### Fixed

- **Typecheck Pipeline Rusak Total**: `tsconfig.json` yang hilang dibuat ulang (strict mode + `@types/bun`) sehingga `bun run typecheck` kembali berfungsi — sebelumnya hanya mencetak help tsc lalu exit 1 tanpa memvalidasi apa pun. Seluruh 46 error type yang tersembunyi kini terselesaikan (union type rusak pada fallback `new Map()` di `fetchAllSessionData`, parameter implicit any, `SQLQueryBindings` pada `safeQuery`, respons `/gn/health` & `/gn/stats` kini ter-type eksplisit).
- **Latent Crash `reportDeprecated()`**: Fungsi dipanggil di `src/index.ts` tanpa pernah didefinisikan — kini diimplementasikan sebagai fungsi murni dengan pesan deprecation + saran pengganti.
- **Cache Key Tidak Lengkap (`gateway/cache.ts`)**: `computePromptHash` dinaikkan ke **v2** dan kini menyertakan `max_tokens`, `stop`, `response_format`, presence/frequency penalty, dan `n`. Sebelumnya dua request yang hanya berbeda di parameter output tersebut salah dilayani respons cache yang sama. Cache lama otomatis invalid via version bump.
- **Version Drift**: `GN_VERSION` diekstrak ke `src/version.ts` sebagai single source of truth; health endpoint server tidak lagi hardcode string versi.

### Changed

- **CI**: Step baru "Typecheck & Test gn" di `.github/workflows/ci.yml` agar regresi typecheck gn terdeteksi otomatis (sebelumnya hanya `sup` yang divalidasi).
- **Dead Code Cleanup**: Menghapus field `compiled` yang tak terpakai di rules engine; sanitizer kini resilient terhadap regex user yang malformed (skip, bukan crash per-request).
- **Topologi Port Non-Intrusif**: Default port interceptor dipindah dari 4000 (tabrakan dengan OMP ecosystem) ke **4010**, dengan upstream baru **gateway-proxy aggregator :4000** (`gn gw start` = 4010 -> 4000 -> 4002). Semua custom provider models.yml kini ter-cover oleh cache, fallback, dan privacy shield. Berlaku konsisten di `commands/gateway.ts`, `server.ts`, `README.md`, dan `gn-gateway.service`.
- **Systemd Service Fix (`gn-gateway.service`)**: Menambahkan `ReadWritePaths=%h/.cache/gn` untuk prompt cache (sebelumnya EPERM diam-diam di bawah `ProtectSystem=strict`) dan menghapus path usang `%h/.config/goblin-nexus`. ExecStart kini memakai path absolut `bun` karena systemd user service tidak mewarisi PATH shell (crash loop status 127).

---

## [v2.1.0] - 2026-08-24

### Added

- **`gn gateway` Interceptor Core Engine (Issue #29)**:
  - **High-Performance Bun HTTP/SSE Proxy (`gateway/server.ts`)**: Bertindak sebagai master interceptor di Port 4000 yang meneruskan request LLM ke Upstream OMP Native Gateway (Port 4002) dengan passthrough streaming SSE tanpa de-framing di hot path.
  - **Cancellation Propagation**: Mengintegrasikan `req.signal` ke `AbortController` upstream agar saat user/agent membatalkan prompt, upstream request langsung di-abort (mencegah pemborosan kuota/token).
  - **Deterministic SHA-256 Prompt Caching (`gateway/cache.ts`)**:
    - Hash tuple: `sha256(v1 + model + messages + temperature + top_p + system_prompt + seed + tools)`.
    - Chunk disimpan post-framing (`data: {...}\n\n`) dengan atomic write (`.tmp -> .json`) dan permission `0600`.
    - Replay stream instan (<5ms) dengan regenerasi ID (`chatcmpl-<uuid>`) dan timestamp `created` agar parser OpenCode tidak mendrop response.
    - Single-flight inflight map untuk mencegah duplicated concurrent upstream requests pada prompt yang identik.
    - TTL default 2 jam dengan auto-pruning dan opsi bypass `X-GN-No-Cache: true` atau flag `--no-cache`.
  - **Absorpsi Privacy Shield & Rules Engine (`gateway/sanitizer.ts`, `gateway/rules.ts`)**:
    - Sanitasi regex token rahasia (API keys, IP internal, Bearer tokens) dengan ReDoS protection.
    - Menghapus header internal `X-GN-*` sebelum request dikirim ke upstream.
  - **Cascading Fallback & Circuit Breaker (`gateway/circuit-breaker.ts`)**:
    - Deteksi pre-stream error (429 Rate Limit, 5xx Server Error, 410, TTFB timeout 15s) dengan fallback otomatis ke candidate model alternatif dari `rules.json`.
    - State machine Circuit Breaker: 3 kegagalan beruntun -> 60s cooldown per model.
    - Context limit window error diteruskan transparan ke client agar OpenCode memicu mekanisme auto-compaction.
  - **Fixture Recording & Offline Replay Engine (`gateway/replay.ts`)**:
    - Dukungan recording interaksi prompt-response ke format JSONL (`gn gateway record <name>`).
    - Offline replay stream dari fixture tanpa koneksi upstream (`gn gateway mock <name>`).
  - **Unified Subcommands & Dual-Level Help (`commands/gateway.ts`)**:
    - Subcommands: `gn gateway start`, `gn gateway status`, `gn gateway stats`, `gn gateway record <name>`, `gn gateway mock <name>`, `gn gateway cache <prune|clear>`.
    - Aliases: `gn gw`, `gn g`, `gn shield`.
  - **Automated Gateway Test Suite (`gateway/gateway.test.ts`)**: 14 unit & integration test komprehensif mencakup rules loading, sanitization, circuit breaker, caching deterministik, fixture replay, dan proxying.

### Fixed

- **Shield Configuration Syntax Bug (`configs/gn/rules.json`)**: Memperbaiki syntax error malformed JSON (trailing comma dan missing commas pada model definition) agar rules engine dapat di-parse dengan sempurna.
- **Peleburan Arsitektur Shield ke Master Configs & GN**: Menghapus direktori terpisah `tools-cli/src/shield/` dan memigrasikan `rules.json` & `privacy-headers.json` ke `configs/gn/` sebagai Single Source of Truth, serta menyediakan `tools-cli/src/gn/gn-gateway.service` untuk systemd user daemon.

---

## [v2.0.2] - 2026-08-18

### Added

- **`gn bench` Leaderboard & Visual Speed Matrix Refactor (`commands/bench.ts`)**:
  - Rombak total tampilan `gn bench` menjadi Speed Leaderboard terurut (`#1`, `#2`, dst.) berdasarkan throughput (`tok/s`) dan latensi model.
  - Visual Throughput Gauge Bar dinamis (`████████░░░░`) dengan color-coding adaptif terhadap model tercepat dalam batch.
  - **Smart Ping Cache Synergy**: Otomatis mendeteksi hasil cache `gn ping` dan hanya menguji model yang berstatus `200 OK` guna menghemat waktu dan konsumsi token, dengan opsi flag `--all` (`-a`) untuk menguji seluruh model dari gateway.
  - Dukungan filter `--top <N>` untuk membatasi peringkat leaderboard model tercepat.
  - **Champion Summary Card**: Menampilkan rangkuman model jawara tercepat di bagian bawah output.
  - Clack live spinner per-model saat eksekusi live (`--force`) agar interaksi terminal tidak freeze.
  - **Dual-Level Help Standard**: Dukungan Level-2 Help lengkap (`gn b --help` / `gn b -h`).
- **Native `omp usage` Forwarding Engine (`commands/usage.ts`)**: Default mode `gn u` kini langsung meneruskan eksekusi ke binary resmi `omp usage` di sistem, menghasilkan visual progress bar block (`████░░░░`), rincian akun multi-email, kalkulasi kapasitas total (`1.45x quota left`), dan filter provider instan dengan graceful fallback ke SQLite lokal jika `omp` tidak terpasang.
- **Tree-Structured Diagnostic & Auth Matrix Refactor for `gn doctor` (`commands/doctor.ts`)**:
  - Tampilan visual baru berbasis Tree Structure (`├──`, `└──`) yang bersih dan tahan terhadap line wrap di semua ukuran terminal, terbagi dalam 4 kategori: `󰘚 DAEMONS & RUNTIMES`, `󰆼 DATABASES & TELEMETRY`, `󰌆 AUTH & PROVIDER MATRIX`, dan `󰉋 STORAGE & CONFIGURATION`.
  - **Zero-Secret Auth Matrix**: Mendeteksi akun aktif dari `agent.db` (`WHERE disabled_cause IS NULL`) dan menguji konektivitas (`200 OK` / `ACTIVE`) tanpa mengekspos token, API key, atau kredensial rahasia.
  - Menghapus pemeriksaan usang `~/.shell/secret` dan standalone syntax check guard.

### Fixed

- **`gn ping` Environment Variable Resolver for `models.yml` (`utils/ping-config.ts`)**:
  - Menambahkan auto-resolution untuk nilai `apiKey` yang berupa nama environment variable (misal `OPENCODE_API_KEY`, `KILO_API_KEY`) di `~/.omp/agent/models.yml`.
  - Mencegah pengiriman nama literal variabel sebagai token otentikasi saat mengeksekusi probe live (`gn p <provider> -f`), memastikan model kustom terotentikasi dengan benar.
- **`gn u -t` & `gn u -f` Multi-Day Window & `--all` Historical Support (`commands/usage.ts`, `utils/opencode-cli.ts`)**:
  - Menambahkan dukungan parsing fleksibel untuk flag window hari: `--day <N>`, `--days <N>`, `-d <N>`, `--day=<N>`, `--days=<N>`, dan direct positional number (e.g. `gn u -t 7`).
  - Menambahkan dukungan `--all`, `-a`, `--all-time` untuk menarik seluruh rekaman sesi dan token historis sejak hari pertama di OpenCode DB.
  - Menyelaraskan query `fetchAllSessionData` agar kombinasi filter kata kunci judul/sesi (`-s <query>`) tetap menghormati batas waktu (`--day N` / `--all`).
  - Menampilkan riwayat file modified (`+lines -lines`) untuk Sesi Utama (Main Agent) di Tree Mode (`-t`) dan Compact Table (`-m`).
- **`gn ping local` TCP Socket Timeout Fix (`commands/ping.ts`)**: Mengganti `Bun.connect` tanpa timeout dengan `net.Socket` bertimeout 1000ms untuk mencegah blocking/hang saat memeriksa port lokal yang tidak aktif (e.g. Ollama 11434).
- **`gn doctor` Cache Path Alignment (`commands/doctor.ts`)**: Menyelaraskan pemeriksaan direktori cache ke `~/.config/gn/cache` (menggantikan path legacy `~/.cache/goblin-nexus`) untuk menghilangkan false warning.
- **Smart Reasoning Auto-Fallback for Probe & Benchmark (`commands/ping.ts`, `commands/bench.ts`)**: Menambahkan auto-retry otomatis dengan `reasoning_effort: "low"` dan `max_tokens: 150` saat probe mendeteksi error `Thinking level MINIMAL is not supported`, membuka akses 200 OK untuk model reasoning `gemini-3.7-flash-tiered`, `gemini-3.7-flash`, dan `gemini-3.1-pro`.

---

## [v2.0.0] - 2026-08-09

### Added

- **`gn ping` & `gn bench` Dual-Mode & Centralized Storage Engine (`~/.config/gn/cache/`)**:
  - Migrasi storage cache ping & bench dari `~/.shell/cache/` ke `~/.config/gn/cache/` (sejajar dengan `~/.config/gb`).
  - Auto-migration otomatis membaca & memindahkan cache lama dari `~/.shell/cache/` ke `~/.config/gn/cache/` tanpa membuang riwayat lama.
  - **Dual-Mode Execution Architecture**:
    - **Default Mode**: Membaca snapshot cache dari `~/.config/gn/cache/ping/<provider>.json` atau `~/.config/gn/cache/bench/<provider>.json` secara instan (**~5ms execution time**).
    - **Live Force Mode (`--force` / `-f`)**: Bypass cache, mengeksekusi request live HTTP ke OMP Gateway (`http://127.0.0.1:4000`), menghitung metrics latensi & throughput (`tok/s`), dan memperbarui JSON cache secara otomatis.
- **`gn ping` Live Probe Layout & Reliability Patch**:
  - Mode live `gn p <provider> --force` memakai Clack spinner per-model dengan label minimal hanya nama model, tanpa teks tambahan seperti `Testing`.
  - Payload probe diselaraskan dengan request chat valid (`Reply with only: ok`) dan `max_tokens` dinaikkan ke `50` untuk menghindari false negative pada model yang tersedia seperti `google-antigravity/gemini-3.6-flash`.
  - Timeout request live ping distandarkan ke `10s` via `AbortSignal.timeout`, sehingga spinner otomatis berhenti sebagai `TIMEOUT` jika provider/gateway terlalu lama merespons.
  - Cache mode `gn p <provider>` tetap mempertahankan boxed table existing; perubahan layout hanya menyasar live/local ping output.
- **Daily Tokens & Subagent Tree Activity Engine (`gn u -t`)**:
  - Dukungan visual pohon silsilah aktivitas harian per sesi (`Root Title [model]` -> `subagent (title) [model]`).
  - Breakdown metrics presisi: Tokens Input, Output, Cache Read, Cache Write, Reasoning, Cost USD, dan Tool Calls summary.
  - Integration `opencode db` native C++ via `bun:sqlite` untuk performa eksekusi super kilat (**<70ms total runtime**).
- **File Modification Audit Mode (`gn u -f`)**:
  - Audit instan khusus file yang pernah di-edit/ditulis (`edit` & `write`) dengan git diff metrics (`+lines -lines`).
  - Auto-filtering otomatis memangkas sesi non-edit (0 files modified).
- **Compact Minimalist Table Mode (`gn u -t -m`)**:
  - Tampilan tabel ringkas 1-baris per session/subagent.
- **Session & Subagent Filter Support**:
  - Filter presisi berdasarkan Session ID / Judul (`gn u -t -s <query>`) dan nama subagent (`gn u -t --agent <name>`).
- **Session Explorer & Search CLI Tool (`gn s list` / `gn s <query>`)**:
  - CLI dedicated untuk mendaftar dan mencari riwayat sesi OpenCode.
- **Fuzzy Levenshtein Error Matcher & Migration Hints (`utils/error.ts`)**:
  - Modul error handling dedicated dengan fuzzy suggestion untuk subcommand typo (`gn usag` -> `usage`) dan migration hints untuk command legacy (`gn stats`, `gn ollama`, `gn ocm`).

### Fixed

- **`gn ping` Model Limitation**: Menghapus batasan slice 15 model pada `gn ping <provider>` sehingga secara default menge-ping seluruh model yang dimiliki oleh provider tersebut (e.g. 503 model untuk `kilo`). Ini memperbaiki kelakuan di mana `gn p kilo` nampak kosong di cache mode karena 15 model pertama yang di-slice semuanya mengembalikan status non-200.

### Refactored

- **Dual-Level Help Standard**:
  - Level-1 (`gn --help`): Tampilan makro ringkas daftar subcommand utama.
  - Level-2 (`gn u -h` / `gn u --help`): Panduan mendalam terpisah per-command.
- **Nerd Font Icons Upgrade Across CLI**: Mengganti emoji warna-warni di seluruh output CLI (`gn --help`, `gn usage`, `gn ping`, `gn bench`, `gn config`, `gn doctor`, `shield.sh`, `gn.sh`) dengan simbol JetBrains Mono / Nerd Font icons (`󰄬`, `󰅚`, `󰀦`, `󰓅`, `󰒓`, `󱈸`, `󱎫`, `󰋼`, `󰑐`, `󰈙`, `󰓹`, `󰋽`, `󰚌`, `󰘚`) untuk tampilan terminal yang lebih bersih dan profesional.
- **3-Tier Hierarchical Usage Layout & Dynamic Progress Bars** (`usage.ts`, `formatter.ts`):
  - Rombak total layout `gn usage` menjadi hirarki 3-tingkat yang super terstruktur: `Provider Pool -> Email Account -> Quota Limits`.
  - Pembersihan total status badges (`󰄬 OK`) dan kata kunci redundant `"Daily · Usage (...)`" -> murni `"Google"`, `"Anthropic"`, `"OpenAI"`.
  - Progress bar tipis `━━━━────────` tanpa siku `[]` dan tanpa clutter.
  - Peningkatan dynamic color thresholds (<70% hijau, 70-99% kuning, >=100% merah).
- **Unified Subcommands & Codebase Consolidation**:
  - Peleburan subcommand `stats` dan `sessions` ke dalam `gn usage` (`--tokens` dan `--sessions`).
  - Penambahan `gn config` (`c`), `gn ping` (`p`), `gn bench` (`b`), dan `gn doctor --check` (`-c`).
- **Legacy Cleanup**: Pembersihan total tool legacy (`ocm`, `goblin-control`, `notes`).

### Added

- **TypeScript Native CLI Engine Architecture (Standalone v1.0.0 Release)**: Port total core `gn` dari Shell Script raksasa menjadi aplikasi TypeScript modular berbasis Bun/Node runtime di `tools-cli/src/gn/src/`.
- **Pure Terminal Formatter Utilities** (`utils/formatter.ts`):
  - Rendering fungsi murni tanpa side-effects untuk banner ASCII ANSI, visual quota bar, status badge (`🟢 OK`/`🟡 WARN`/`🔴 ERROR`), date formatter, dan dynamic align table.
  - Perbaikan `visibleWidth` vs `visibleLength` untuk menghitung visual character padding tabel TUI secara akurat meskipun mengandung warna ANSI dan emoji.
  - Presisi 4 desimal token cost USD pada `formatCost()`.
- **Multi-Runtime Launcher** (`tools-cli/bin/gn`): Peningkatan launcher wrapper dengan auto-fallback runtime (Bun → Node.js/tsx → Deno) dan fail-fast hint.

### Changed

- **CLI Subcommand Router Refactor** (`src/index.ts`):
  - Penataan ulang entry point CLI dengan dual-level help system (`<tool> --help` & `<tool> <command> --help`).
  - Penyelarasan versi global `GN_VERSION` menjadi `v0.3.26`.

### Removed

- **Legacy Shell & Bench Scripts Cleanup**:
  - Dihapus: `quarantine.sh`, `config.ts`, `bench.ts`, `bench-roles.ts`, `bench-storage.ts`, `pool-manager.ts`, `agent.sh`, `picker.sh`, `price.ts`, dan `doctor.sh`.
  - Pembersihan total sisa rujukan dead code `price` dan `doctor.sh` dari `help-formatter.sh` & `gn.sh`.

## [v2.0.1] - 2026-08-12

### Added

- **`gn ping / p` Custom Provider Live Probe (`ping-config.ts`)**:
  - Modul baru `utils/ping-config.ts` menggantikan `config-alias.ts` — berisi parser `models.yml` (`~/.omp/agent/models.yml`) untuk auto-discovery custom model beserta `baseUrl`, `apiKey`, dan protokol `api` masing-masing.
  - Ping live custom model otomatis me-route ke `baseUrl` provider dengan suffix protokol yang tepat (`openai-responses` → `/responses`, selainnya → `/chat/completions`), plus `Authorization: Bearer` dari `apiKey` custom.
  - Payload model ID custom memakai `localId` asli dari `models.yml` alih-alih ID prefixed.

### Changed

- **`gn ping` Live Model Unification**: Model dari API response (gateway) kini digabung dengan model custom dari `models.yml` (`[...data.data, ...parseModelsYml()]`) sehingga semua model custom ikut ter-probe — tanpa lagi pembatasan slice 15 model pertama.

## [Unreleased]

### Added

- **`gn export / e` Multi-Source Credential Sync**: Ekspor credential `gn e` ditingkatkan — selain membaca SQLite database `agent.db`, ia kini otomatis menscan dan meng-export custom providers dari `~/.omp/agent/models.yml` (misal provider `peezy`) langsung ke `~/.shell/secret/<provider>/models_yml.json`.
- **`gn ping / p` & `gn bench / b` Custom Provider Support & Network Fallback**:
  - **Auto-Discovery Custom Models**: Mengenali model dari `~/.config/opencode/opencode.jsonc` dan `~/.omp/agent/models.yml` (misal `peezy/deepseek-v4-flash-0731`).
  - **Protokol `openai-responses` Support**: Otomatis me-route payload ping/bench sesuai tipe API (`openai-responses` `/v1/responses` vs standard `openai-completions` `/v1/chat/completions`).
  - **IPv4 Connection Fallback**: Node/Bun `family: 4` socket fallback untuk melewati kendala IPv6 `ENETUNREACH` / `ETIMEDOUT` pada gateway eksternal (seperti Peezy Gateway `api.p0.systems`).
- **Auto Telemetry Logger di Goblin Shield** (`shield-interceptor.ts`): Setiap request LLM yang melewati interceptor (port 4002 → 4000) otomatis dicatat ke `telemetry.db`.
  - Extract `usage` dari response JSON (`prompt_tokens`, `completion_tokens`, `cache_tokens`) — support OpenAI `/v1/chat/completions` dan Anthropic `/v1/messages`.
  - Hitung `cost_usd` real-time via pricing engine (`calculateCost` dari `pricing.ts`).
  - **Fire-and-forget**: Response di-clone dan dikonsumsi di background — **zero latency impact** ke response client.
  - **Resilient**: Semua error telemetry di-swallow — interceptor TIDAK PERNAH crash karena logging gagal.
- **Systemd User Service** (`gn-shield.service`): Daemon interceptor berjalan otomatis di background via `systemctl --user`.
  - Auto-restart (`Restart=always`, `RestartSec=2`).
  - Logging ke journald, bind port 4002, forward ke 4000.
  - Service file di `~/.config/systemd/user/gn-shield.service` + copy di `tools-cli/src/shield/gn-shield.service`.
- **`gn shield service` subcommand** (`shield.sh`): Manage systemd service — `install|remove|start|stop|restart|status`.
  - `start`/`stop`/`restart` otomatis prefer systemd jika service terinstal, fallback ke legacy PID-based daemon.
- **BARU `gn usage` engine** (`usage.ts`): Modul unified yang menggantikan `status-formatter.ts` + `burn.ts` dengan data 100% akurat (tanpa `assumedTotal 100k`).
  - **Quota Mode (`gn usage [provider]`)**: Fetch live usage limits dari broker `/v1/usage`. Menampilkan progress bar real, persentase akurat, status badge (`🟢 OK`/`⚠️ LOW`/`🔴 EXHAUSTED`), exact used/limit count, dan countdown `resetsAt`.
  - **Token Burn Mode (`gn usage --token [provider] [--days N]`)**: Query SQLite `client_usage` dari `~/.omp/agent/agent.db` untuk data real (requests, input/output/cache tokens, cost_usd). **BUKAN estimasi** — data asli dari database.
  - **JSON Mode (`gn usage --json`)**: Output JSON mentah untuk scripting/piping.
  - **Failure Resilience**: Graceful handling saat broker offline, DB locked, atau tabel `client_usage` kosong — pesan jelas tanpa crash.
- **Quick Token Summary**: Di mode quota, `usage.ts` otomatis menampilkan ringkasan token 7d jika `client_usage` punya data.

### Changed

- **`gn usage / u` routing** (`gn.sh`): Delegate langsung ke `usage.ts` — hapus pipe `omp usage --json | status-formatter.ts` dan panggilan `burn.ts`.
- **`help-formatter.sh`**: Level 2 help `usage` di-update — ganti `--history`/sparkline dengan `--token` mode, deskripsi dual-mode, visual indicators baru.
- **`gn bench`** (`bench.ts`): Hapus dependensi `bench-roles.ts` untuk role specialization. Benchmark sekarang menggunakan generic prompt tanpa system prompt complex, tanpa hybrid scoring.
- **`OmpQuotaAdapter` fresh-window filter** (`adapters/omp-quota.ts`): Query `fetchData()` rewrite total — hanya mengembalikan snapshot dari **batch polling terbaru broker** (baris dengan `recorded_at` dalam 1 jam terakhir dari `MAX(recorded_at)`), bukan `MAX(id) GROUP BY` polos yang sebelumnya menyedot snapshot stale dari akun lama (seperti `umumsriatmaja516@gmail.com`) dan weekly window yang broker sudah tidak refresh. Output `gn u` sekarang **identik dengan `omp usage` native**: tidak ada lagi baris 100% "expired" dari akun mati, tidak ada lagi weekly stale, tidak ada lagi github-copilot lama.
  - SQL: CTE `max_ts` meng-anchor batch terbaru, `WHERE recorded_at >= ts - 3600000 AND id IN (SELECT MAX(id) ... GROUP BY provider, account_key, limit_id)`.
  - Post-filter: drop baris dengan `resets_at < now - 3600000` (pengaman untuk baris yang lolos fresh-window tapi `resets_at` sudah lama lewat).
  - Post-dedup: safety-belt per `(provider, email, label)` — cegah duplikat visual saat broker menulis `limit_id` berbeda untuk quota user-facing yang sama.
  - Konstanta `FRESH_WINDOW_MS` (1 jam) di-export & `freshWindowMs` constructor param untuk testability.
- **`ollama-me.ts` Single Source of Truth refactor**: Credential akun Ollama Cloud sekarang dibaca **langsung dari SQLite `~/.omp/agent/agent.db` (tabel `auth_credentials`, `provider = 'ollama-cloud'`)**, BUKAN lagi gabungan file vault `~/.shell/secret/ollama-cloud/*.json` + DB (yang sebelumnya menghasilkan 6 entry duplikat/stale: `id-5.json`, `id-6.json`, `id-7.json` mirror DB + 3 file `*_gmail_com.json` legacy). Hasilnya: `gn u` & `gn om` sekarang murni menampilkan **3 Akun Utama** (satu per row di DB, urut by `id ASC`).
  - **Read-only via helper** `withDb()` / `getOmpAgentDb()` dari `utils/db.ts` (sesuai architect invariant). Tidak ada import langsung `bun:sqlite`.
  - **Exact match** `provider = 'ollama-cloud'` (sebelumnya `LIKE '%ollama%'`) — false-proof untuk provider baru seperti `ollama-cloud-pro`.
  - **Live HTTP fetch tetap aktif**: `POST ollama.com/api/me` (Bearer) untuk email/plan/id, `GET ollama.com/settings` (cookie) untuk session/weekly % jika cookie tersedia. Cache 15-menit tidak berubah.
  - **Type import**: `OllamaAccountMeta` interface duplicate di-import dari `types.ts` (canonical) — bukan lagi deklarasi lokal.
  - **Help text** `gn om --help` di-update: SUMBER DATA section & TROUBLESHOOTING merujuk ke `auth_credentials` (bukan lagi file vault). Empty-state message juga disesuaikan.

### Removed

- **`burn.ts`** & **`status-formatter.ts`**: File dihapus dari direktori. Keduanya sudah digantikan sepenuhnya oleh `usage.ts` — tidak ada routing yang memanggilnya lagi.
- **`assumedTotal 100k` matematika rekaan**: `burn.ts` sebelumnya menggunakan estimasi 100k token untuk menghitung cost — sekarang `usage.ts` hanya menampilkan data real dari SQLite atau jujur mengatakan "0 tokens burned".
- **Pembersihan Bom Waktu & Redundansi**:
  - **`quarantine.sh`** (575 LoC) — Manipulasi langsung SQLite `auth_credentials` (`DELETE FROM ...`) + rename file JSON credential. Penyebab DB state inconsistency & secret vault corrupt. Dihapus.
  - **`config.ts`** (~270 LoC) — Parser JSONC manual berbasis regex yang rapuh; penyebab utama `MALFORMED FUNCTION ERROR` & config corruption. Dihapus.
  - **Inline `gn export` SQL block** (~46 baris di `gn.sh`) — Direct `SELECT * FROM auth_credentials` + dump `apiKey` plaintext ke `~/.shell/secret/`. Dihapus.
  - **`bench.ts`** (487 LoC) — Redundan dengan REST API OMP `POST /v1/chat/completions`. Dihapus.
  - **`pool-manager.ts`** (385 LoC) — Redundan dengan OMP Auth-Broker snapshot API. Dihapus.
  - **`agent.sh`** (128 LoC) — Direct edit `opencode.jsonc` (raw sed) tanpa validasi; risiko malformed config. Dihapus.
  - **`picker.sh`** (75 LoC) — Caller ke `config.ts` yang sudah mati. Dihapus.
  - **Helper dead-code `_run_bench_action`** di `gn.sh` — Tidak ada caller setelah `bench.ts` dihapus. Dihapus.
  - **Direct SQL credential query di `doctor.sh`** (section 6 "Credential Health") — Sudah di luar scope OMP, akses langsung `auth_credentials` SQLite. Dihapus.
- **Deprecation Guard di `gn.sh`** (4 handler): `ping|p`, `bench|b`, `quarantine|q`, `export|e` sekarang hanya menampilkan warning + hint REST API OMP (`GET /healthz`, `POST /v1/chat/completions`, `POST /v1/credential/:id/disable`, `GET /v1/snapshot`) atau CLI `omp`/`ocm` sebagai gantinya. Level 1 help & `help-formatter.sh` Level 2 help untuk keempat command juga dihapus/di-update.
- **`help-formatter.sh`**: Hapus block Level 2 help untuk `ping`, `bench`, `quarantine`, `export`. Update help `doctor` — drop point "Credential health".

## [v0.3.15] - 2026-07-28

### Added

- **Global Ultra-Clean ASCII Art Banners (bagian dari suite CLI GN, ZF, FEX, OCM)**:
  - Penyesuaian banner visual seragam dengan font ASCII Art tebal presisi tinggi.
  - Penempatan nama tool dan versi persis di bawah banner dengan skema warna pure white & margin atas yang lega agar tidak menempel di prompt terminal (`shobixlinuxdev>`).

## [v0.3.13] - 2026-07-27

### Added

- **Ollama Cloud Real-time Scraper & Metadata Fetcher (`ollama-me.ts`)**:
  - Penarikan metadata akun Ollama Cloud resmi via `POST https://ollama.com/api/me` (Email, Plan, ID, Suspended Status) dengan auto-discovery dari SQLite DB `~/.omp/agent/agent.db` dan Secret Vault.
  - HTML Web Scraper untuk dashboard `https://ollama.com/settings` (ekstraksi persentase pemakaian persis 1:1 dari `session_usage_pct` & `weekly_usage_pct`).
  - Cache TTL 15 menit di `~/.cache/goblin-nexus/ollama-me-cache.json` untuk performa kilat.
  - Integration di `gn status`: Render diagram bar visual 28-karakter presisi 1-desimal per-akun Ollama Cloud.
  - Integration di `gn burn`: Menampilkan baris `Weekly Usage` & `Session Usage` lengkap dengan estimasi token (`17.00k tokens`) dan cost ($).

### Refactored

- **Code Review & Maintenance Improvements (`gn`)**:
  - Direct object mutation pada cumulative logic `burn.ts` diganti dengan Strict Immutability Map Update (`merged.set(key, { ... })`).
  - Positional array index matching untuk Ollama Cloud diubah menjadi Identity-based lookup (`metaByEmail` / `metaById`).
  - Komentar prioritas merge `burn.ts` disesuaikan dengan kode (`snapshot > history > broker`).
  - Error context logging ditambahkan pada scraper `ollama-me.ts`.

## [v0.3.11] - 2026-07-27

### Added

- **`gn` Dual-Level Help System**:
  - Subcommand Deep Help Manual (`help-formatter.sh`) untuk `ping`, `bench`, `status`, `burn`, `pool`, `shield`, `agent`.
  - Konsistensi akses help via `gn <command> --help`, `gn <command> -h`, atau `gn help <command>`.
  - Tampilan help estetik dengan visual header, deskripsi target, detail flag, dan contoh penggunaan praktis.

## [v0.3.9] - 2026-07-27

### Added

- **`gn bench` Dynamic Multi-Role Benchmark Engine**:
  - Modular System Prompt Roles (`coder`, `bugfix`, `planning`, `codereview`) tersimpan di `tools-cli/src/gn/prompts/roles/*.txt`.
  - Modular Dataset Test Cases tersimpan di `tools-cli/src/gn/prompts/datasets/*.json`.
  - **Dual-Source of Truth Scoring**: Hybrid Scoring Matcher (Keyword & Structural Rubric) + Self-Cleaning `tools-cli/src/gn/storage/output.md` untuk Agent Deep Analytics.
  - Storage Append-Only di `tools-cli/src/gn/storage/history.json` (auto-ignored oleh Git).
  - Mode Selector: `--provider <id>`, `--vs` / `--vs=m1,m2` (Adu Banteng cross-provider), `--role <role>`, dan `--timeout <sec>` (default 60s untuk bench, 10s untuk ping).
- **`gn ping` Visual UX Upgrade**: Clean status badges (`200 OK`, `429 LIMIT`), dynamic spinner, visual ANSI latency bar (`miniBar`), dan summary lineup.

### Changed

- `gn status` & `gn burn` layout formatting cleanups (penataan visual progress bar 28-char & pembersihan secret/opaque IDs).

## [v0.3.8] - 2026-07-27

### Added

- `gn burn` (`burn.ts` + `bu` alias) — Token & Cost Burn Tracker. Mengakses REST endpoint OMP Broker v17.1.4 (`GET /v1/usage/clients` & `GET /v1/usage/history`) untuk menampilkan token burn per client dengan breakdown input/output/cache tokens, estimated cost (USD), dan sparkline history (▁▂▃▄▅▆▇█). Mendukung flag `--history`, `--json`, `--days <int>`, `--provider <id>`. Degradasi elegan ke `omp usage --json` saat broker belum menyediakan field token burn, dengan pesan Goblin Roast yang ramah.
- `gn status` upgrade (`status-formatter.ts`) — Konsumsi JSON output `omp usage --json` lalu render dengan visual status dot (`●`/`○`/`✗`) berwarna ANSI, normalisasi `usedFraction`/`windowLabel` dari shape OMP v17.1.4, ringkasan `disabledCredentials` (mis. `✗ email — disabled 3d ago: re-login to restore`), dan `capacity` summary per-provider (mis. `capacity: 7d → 2.00/2 accounts used (0.00× quota left)`). Integrasi `gum style` opsional, fallback ANSI untuk TTY/non-TTY.
- `show_help` gn — Tambah subcommand `burn`/`bu` dengan deskripsi flag & contoh penggunaan di section `EXAMPLES`.

## [v0.3.5] - 2026-07-26

### Added

- `shield-interceptor.ts` Smart Fallback Array Chain — Dukungan `fallback_models` berbasis array candidates (`Primary -> Array[Fallback1, Fallback2]`) dengan multi-level sequential retry saat upstream mengembalikan status HTTP `410`, `429`, atau `5xx`.
- Header Debug `X-Goblin-Shield-Fallback` — Menampilkan metadata jejak fallback model pada response headers yang dikirimkan ke client/OpenCode.

## [v0.3.0] - 2026-07-26

### Added

- `gn pool` — Dynamic Account Pool Switching (`pool-manager.ts` & `gn.sh`) untuk isolation proxy & bypass SQLite DB via `OMP_AUTH_BROKER_ACCOUNT_POOL_FILE`.
- `gn` Visual Engine Update — Header ASCII Art `GN PROXY` Unicode Shade Block, `gum style` double border, spinner loading `_gn_spin`, dan Goblin Roast Error handling.
- `tools-cli/src/gn/` & `tools-cli/bin/gn` — Goblin Nexus CLI port dari `~/.shell/` untuk benchmark, model routing, dan agent model switcher.
- `tools-cli/src/shield/` — Goblin Privacy Shield Interceptor (`Bun.serve` proxy) untuk masking regex API keys/secrets.

### Changed

- `gn ping` & `gn bench` table output simplified — Menghapus kolom terduplikasi, hanya menampilkan Full Model ID & Latency/Speed secara ringkas.
