/**
 * ─────────────────────────────────────────────────────────────
 * Goblin Nexus — Gateway CLI Command Handler
 * ─────────────────────────────────────────────────────────────
 */

import {
	ANSI_BOLD,
	ANSI_CYAN,
	ANSI_GRAY,
	ANSI_GREEN,
	ANSI_RED,
	ANSI_RESET,
	ANSI_YELLOW,
	formatBoxTable,
	printGnHeader,
} from "../utils/formatter";
import {
	createGatewayServer,
	PromptCacheManager,
	AccessLogManager,
	renderAccessLogsTable,
	formatLiveLogLine,
	type AccessLogFilter,
} from "../gateway";
import {
	buildUpstreamUrl,
	loadUpstreamsFromConfig,
} from "../gateway/upstream-router";
import { getUnifiedConfigPath } from "../gateway/rules";
import { readFileSync } from "node:fs";

/** Bentuk respons /gn/health dari gateway server. */
interface GatewayHealthResponse {
	version?: string;
	port?: number;
	target?: string;
	upstreams?: { name: string; url: string }[];
	uptime?: number;
	mode?: string;
	cacheEnabled?: boolean;
	shieldEnabled?: boolean;
}

/** Bentuk respons /gn/stats dari gateway server. */
interface GatewayStatsResponse {
	totalRequests?: number;
	cacheHits?: number;
	cacheMisses?: number;
	fallbacksTriggered?: number;
	activeStreams?: number;
	errorsCount?: number;
	uptimeSeconds?: number;
}

/**
 * Muat daftar upstream dari config unified (user ~/.config/gn/config.json
 * atau vault config). Fallback ke default bawaan (OMP + VansRouter).
 */
function loadDisplayUpstreams(): { name: string; url: string }[] {
	try {
		const cfgPath = getUnifiedConfigPath();
		const rawConfig = cfgPath ? JSON.parse(readFileSync(cfgPath, "utf-8")) : {};
		const upstreams = loadUpstreamsFromConfig(rawConfig);
		return upstreams.map((u) => ({
			name: u.name,
			url: `http://${u.host}:${u.port}${u.basePath}`,
		}));
	} catch {
		return [
			{ name: "omp", url: "http://127.0.0.1:4000/v1" },
			{ name: "vansrouter", url: "http://127.0.0.1:20128/api/v1" },
		];
	}
}

function showGatewayHelp(): void {
	printGnHeader("GATEWAY INTERCEPTOR MANUAL");
	console.log("USAGE");
	console.log("  $ gn gateway <subcommand> [flags]");
	console.log("  $ gn gw <subcommand> [flags]");
	console.log("");
	console.log("SUBCOMMANDS");
	console.log(
		"  start         \x1b[1;36m󰐌\x1b[0m Jalankan hybrid gateway (4010 -> OMP 4000 + VansRouter 20128)",
	);
	console.log(
		"  status        \x1b[1;36m󰋼\x1b[0m Cek status gateway instance aktif & latency",
	);
	console.log(
		"  stats         \x1b[1;36m󰓅\x1b[0m Statistik performa, hit-rate cache, dan error count",
	);
	console.log(
		"  record <name> \x1b[1;36m󰑈\x1b[0m Jalankan gateway dalam mode record JSONL fixture",
	);
	console.log(
		"  mock <name>   \x1b[1;36m󰘦\x1b[0m Jalankan gateway dalam mode mock replay tanpa upstream",
	);
	console.log(
		"  cache <action>\x1b[1;36m󰃨\x1b[0m Manajemen cache (prune: hapus expired, clear: kosongkan)",
	);
	console.log(
		"  log, logs     \x1b[1;36m󰌱\x1b[0m Audit traffic real-time, status cache, & riwayat fallback",
	);
	console.log("");
	console.log("FLAGS");
	console.log("  -p, --port <port>          Port interceptor (default: 4010)");
	console.log(
		"  -t, --target-port <port>   Port upstream provider (default: 4000)",
	);
	console.log(
		"  -s, --stream               Live streaming log tail (tail -f style)",
	);
	console.log(
		"  -l, --limit <N>            Jumlah riwayat entri log (default: 30, max: 1000)",
	);
	console.log(
		"  -e, --errors               Filter hanya request yang gagal / error (>= 400)",
	);
	console.log("  -m, --model <id>           Filter log berdasarkan model ID");
	console.log(
		"  --no-cache                 Nonaktifkan deterministic prompt caching",
	);
	console.log(
		"  --no-shield                Nonaktifkan privacy sanitization & mask",
	);
	console.log("  -j, --json                 Output mentah format JSON");
	console.log("");
	console.log("EXAMPLES");
	console.log(
		"  $ gn gw start              # Start interceptor default (4010 -> 4000)",
	);
	console.log("  $ gn gw status             # Cek status kesehatan gateway");
	console.log("  $ gn gw stats --json       # Export telemetry & cache stats");
	console.log(
		"  $ gn gw log                # Tampilkan tabel riwayat request & fallback",
	);
	console.log(
		"  $ gn gw log -s             # Stream live traffic interceptor real-time",
	);
	console.log(
		"  $ gn gw log -e             # Tampilkan hanya request yang kena error",
	);
	console.log(
		"  $ gn gw log -l 50 --json   # Export 50 log terakhir ke format JSON",
	);
	console.log(
		"  $ gn gw record test-fix    # Record interaksi ke ~/.config/gn/fixtures/test-fix.jsonl",
	);
	console.log(
		"  $ gn gw mock test-fix      # Replay fixture test-fix.jsonl secara deterministik",
	);
	console.log(
		"  $ gn gw cache prune        # Bersihkan cache prompt yang kadaluarsa",
	);
	console.log("");
}

export async function handleGatewayCommand(argv: string[]): Promise<number> {
	const sub = argv[0];
	const hasJsonFlag = argv.includes("--json");

	if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
		showGatewayHelp();
		return 0;
	}

	// Helper flags parsing
	const getFlagVal = (flag: string, def: string): string => {
		const idx = argv.indexOf(flag);
		if (idx !== -1 && idx + 1 < argv.length) return argv[idx + 1];
		return def;
	};

	// Default 4010 agar tidak bentrok dengan OMP ecosystem (4000-4001)
	const port = parseInt(getFlagVal("-p", getFlagVal("--port", "4010")), 10);
	const targetPort = parseInt(
		getFlagVal("-t", getFlagVal("--target-port", "4000")),
		10,
	);
	const cacheEnabled = !argv.includes("--no-cache");
	const shieldEnabled = !argv.includes("--no-shield");

	switch (sub) {
		case "start": {
			printGnHeader(`GN GATEWAY HYBRID ROUTER v2.1.4`);
			console.log(`  ${ANSI_BOLD}Configuration:${ANSI_RESET}`);
			console.log(
				`  • Listen Port    : ${ANSI_CYAN}http://127.0.0.1:${port}${ANSI_RESET}`,
			);
			const disp = loadDisplayUpstreams();
			for (const d of disp) {
				console.log(
					`  • Upstream [${d.name}]: ${ANSI_CYAN}${d.url}${ANSI_RESET}`,
				);
			}
			console.log(
				`  • Prompt Caching : ${cacheEnabled ? ANSI_GREEN + "ENABLED (SHA-256 / 2h TTL)" : ANSI_GRAY + "DISABLED"}${ANSI_RESET}`,
			);
			console.log(
				`  • Privacy Shield : ${shieldEnabled ? ANSI_GREEN + "ENABLED" : ANSI_GRAY + "DISABLED"}${ANSI_RESET}`,
			);
			console.log(
				`  • Mode           : ${ANSI_YELLOW}HYBRID MULTI-UPSTREAM ROUTER${ANSI_RESET}`,
			);
			console.log("");
			console.log(
				`  ${ANSI_GRAY}Press Ctrl+C to terminate gateway instance.${ANSI_RESET}\n`,
			);

			const server = createGatewayServer({
				port,
				targetPort,
				cacheEnabled,
				shieldEnabled,
				mode: "live",
			});

			server.start();

			// Graceful shutdown
			process.on("SIGINT", () => {
				console.log(`\n  ${ANSI_YELLOW}Stopping GN Gateway...${ANSI_RESET}`);
				server.stop();
				process.exit(0);
			});

			// Keep running
			await new Promise(() => {});
			return 0;
		}

		case "record": {
			const fixtureName = argv[1] || "default-session";
			printGnHeader(`GN GATEWAY RECORDER`);
			console.log(
				`  • Recording To   : ${ANSI_CYAN}~/.config/gn/fixtures/${fixtureName}.jsonl${ANSI_RESET}`,
			);
			console.log(
				`  • Listen Port    : ${ANSI_CYAN}http://127.0.0.1:${port}${ANSI_RESET}`,
			);
			for (const d of loadDisplayUpstreams()) {
				console.log(
					`  • Upstream [${d.name}]: ${ANSI_CYAN}${d.url}${ANSI_RESET}`,
				);
			}
			console.log(`  • Mode           : ${ANSI_YELLOW}RECORD${ANSI_RESET}\n`);

			const server = createGatewayServer({
				port,
				targetPort,
				cacheEnabled: false,
				shieldEnabled,
				mode: "record",
				mockFixtureFile: fixtureName,
			});

			server.start();

			process.on("SIGINT", () => {
				console.log(`\n  ${ANSI_GREEN}Recording saved!${ANSI_RESET}`);
				server.stop();
				process.exit(0);
			});

			await new Promise(() => {});
			return 0;
		}

		case "mock": {
			const fixtureName = argv[1] || "default-session";
			printGnHeader(`GN GATEWAY MOCK SERVER`);
			console.log(
				`  • Replaying From : ${ANSI_CYAN}~/.config/gn/fixtures/${fixtureName}.jsonl${ANSI_RESET}`,
			);
			console.log(
				`  • Listen Port    : ${ANSI_CYAN}http://127.0.0.1:${port}${ANSI_RESET}`,
			);
			console.log(
				`  • Mode           : ${ANSI_YELLOW}MOCK REPLAY (Offline / No Upstream)${ANSI_RESET}\n`,
			);

			const server = createGatewayServer({
				port,
				cacheEnabled: false,
				shieldEnabled: false,
				mode: "mock",
				mockFixtureFile: fixtureName,
			});

			server.start();

			process.on("SIGINT", () => {
				console.log(`\n  ${ANSI_YELLOW}Stopping Mock Server...${ANSI_RESET}`);
				server.stop();
				process.exit(0);
			});

			await new Promise(() => {});
			return 0;
		}

		case "status": {
			try {
				const res = await fetch(`http://127.0.0.1:${port}/gn/health`, {
					signal: AbortSignal.timeout(2000),
				});

				if (!res.ok) {
					throw new Error(`HTTP ${res.status}`);
				}

				const data = (await res.json()) as GatewayHealthResponse;
				if (hasJsonFlag) {
					console.log(JSON.stringify(data, null, 2));
					return 0;
				}

				printGnHeader("GATEWAY INSTANCE STATUS");
				const rows = [
					["Service Status", `${ANSI_GREEN}󰄬 ONLINE (200 OK)${ANSI_RESET}`],
					["Version", data.version || "-"],
					["Port", String(data.port || port)],
					[
						"Upstreams",
						(data.upstreams && data.upstreams.length > 0
							? data.upstreams
							: [
									{
										name: "omp",
										url: data.target || `http://127.0.0.1:${targetPort}`,
									},
								]
						)
							.map(
								(u) =>
									`${ANSI_CYAN}${u.name}${ANSI_RESET} ${ANSI_GRAY}${u.url}${ANSI_RESET}`,
							)
							.join("\n                    "),
					],
					["Uptime", `${data.uptime}s`],
					["Mode", data.mode || "live"],
					[
						"Prompt Cache",
						data.cacheEnabled
							? `${ANSI_GREEN}Active${ANSI_RESET}`
							: `${ANSI_GRAY}Disabled${ANSI_RESET}`,
					],
					[
						"Privacy Shield",
						data.shieldEnabled
							? `${ANSI_GREEN}Active${ANSI_RESET}`
							: `${ANSI_GRAY}Disabled${ANSI_RESET}`,
					],
				];

				console.log(
					formatBoxTable("GATEWAY HEALTH METRICS", ["Property", "Value"], rows),
				);
				console.log("");
				return 0;
			} catch (err: any) {
				if (hasJsonFlag) {
					console.log(
						JSON.stringify({ status: "offline", error: err.message }, null, 2),
					);
					return 1;
				}
				printGnHeader("GATEWAY INSTANCE STATUS");
				console.log(
					`  ${ANSI_RED}❌ Gateway Interceptor is not running on port ${port}.${ANSI_RESET}`,
				);
				console.log(`  ${ANSI_GRAY}Reason: ${err.message}${ANSI_RESET}`);
				console.log(
					`\n  ${ANSI_YELLOW}Hint:${ANSI_RESET} Jalankan ${ANSI_CYAN}gn gateway start${ANSI_RESET} untuk mengaktifkan interceptor.\n`,
				);
				return 1;
			}
		}

		case "stats": {
			try {
				const res = await fetch(`http://127.0.0.1:${port}/gn/stats`, {
					signal: AbortSignal.timeout(2000),
				});

				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const data = (await res.json()) as GatewayStatsResponse;

				if (hasJsonFlag) {
					console.log(JSON.stringify(data, null, 2));
					return 0;
				}

				printGnHeader("GATEWAY TELEMETRY STATS");
				const rows = [
					["Total Requests", String(data.totalRequests || 0)],
					["Cache Hits", `${ANSI_GREEN}${data.cacheHits || 0}${ANSI_RESET}`],
					["Cache Misses", String(data.cacheMisses || 0)],
					[
						"Fallbacks Triggered",
						(data.fallbacksTriggered ?? 0) > 0
							? `${ANSI_YELLOW}${data.fallbacksTriggered ?? 0}${ANSI_RESET}`
							: "0",
					],
					["Active Streams", String(data.activeStreams || 0)],
					[
						"Errors Encountered",
						(data.errorsCount ?? 0) > 0
							? `${ANSI_RED}${data.errorsCount ?? 0}${ANSI_RESET}`
							: "0",
					],
					["Uptime", `${data.uptimeSeconds || 0}s`],
				];

				console.log(
					formatBoxTable(
						"INTERCEPTOR REALTIME METRICS",
						["Metric", "Value"],
						rows,
					),
				);
				console.log("");
				return 0;
			} catch (err: any) {
				if (hasJsonFlag) {
					console.log(
						JSON.stringify({ status: "offline", error: err.message }, null, 2),
					);
					return 1;
				}
				console.error(
					`  ${ANSI_RED}❌ Failed to fetch stats from port ${port}: ${err.message}${ANSI_RESET}`,
				);
				return 1;
			}
		}

		case "cache": {
			const action = argv[1] || "prune";
			const cache = new PromptCacheManager();

			if (action === "prune") {
				printGnHeader("GATEWAY PROMPT CACHE");
				const pruned = cache.prune();
				console.log(`  ${ANSI_GREEN}󰄬 Cache pruned successfully.${ANSI_RESET}`);
				console.log(
					`  • Removed Expired Entries: ${ANSI_CYAN}${pruned}${ANSI_RESET}\n`,
				);
				return 0;
			}

			console.log(
				`  ${ANSI_YELLOW}Unknown cache action '${action}'. Available: prune${ANSI_RESET}\n`,
			);
			return 1;
		}

		case "log":
		case "logs": {
			const logManager = new AccessLogManager();
			const isStream = argv.includes("-s") || argv.includes("--stream");
			const isJson = hasJsonFlag || argv.includes("-j");
			const isErrorsOnly = argv.includes("-e") || argv.includes("--errors");
			const limitStr = getFlagVal("-l", getFlagVal("--limit", "30"));
			const limit = parseInt(limitStr, 10) || 30;
			const modelFilter = getFlagVal("-m", getFlagVal("--model", ""));

			const filter: AccessLogFilter = {
				limit,
				errorsOnly: isErrorsOnly,
				model: modelFilter || undefined,
			};

			if (isStream) {
				if (!isJson) {
					printGnHeader("GATEWAY REAL-TIME TRAFFIC STREAM");
					console.log(
						`  ${ANSI_GRAY}Streaming live gateway requests... Tekan Ctrl+C untuk berhenti.${ANSI_RESET}\n`,
					);
				}

				const ac = new AbortController();
				process.on("SIGINT", () => {
					ac.abort();
					if (!isJson) {
						console.log(
							`\n  ${ANSI_YELLOW}Streaming log dihentikan.${ANSI_RESET}\n`,
						);
					}
					process.exit(0);
				});

				await logManager.streamLogs(
					filter,
					(entry) => {
						if (isJson) {
							console.log(JSON.stringify(entry));
						} else {
							console.log(formatLiveLogLine(entry));
						}
					},
					ac.signal,
				);
				return 0;
			}

			// Snapshot mode (default)
			const entries = logManager.readLogs(filter);

			if (isJson) {
				console.log(JSON.stringify(entries, null, 2));
				return 0;
			}

			printGnHeader("GATEWAY ACCESS & FALLBACK LOG");
			console.log(renderAccessLogsTable(entries));
			return 0;
		}

		default: {
			console.log(
				`  ${ANSI_RED}Unknown gateway subcommand: '${sub}'${ANSI_RESET}`,
			);
			console.log(
				`  ${ANSI_GRAY}Type 'gn gateway --help' for available subcommands.${ANSI_RESET}\n`,
			);
			return 1;
		}
	}
}
