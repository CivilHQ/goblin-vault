/**
 * ─────────────────────────────────────────────────────────────
 * Goblin Nexus — Gateway Interceptor Comprehensive Test Suite
 * ─────────────────────────────────────────────────────────────
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
	computePromptHash,
	formatCachedStreamChunks,
	PromptCacheManager,
} from "./cache";
import {
	buildFallbackBody,
	extractModelFromBody,
	isModelHealthy,
	recordModelFailure,
	recordModelSuccess,
	resolveFallbackCandidates,
	shouldTriggerFallback,
} from "./circuit-breaker";
import { DEFAULT_FALLBACK, DEFAULT_RULES, loadGatewayRules } from "./rules";
import { sanitizeText } from "./sanitizer";
import { FixtureManager } from "./replay";
import {
	AccessLogManager,
	formatModelChain,
	renderAccessLogsTable,
	type AccessLogEntry,
} from "./access-log";
import { createGatewayServer } from "./server";

const TEST_DIR = join(process.cwd(), ".tmp-test-gateway");

describe("1. Rules & Configuration", () => {
	test("loads default rules fallback safely", () => {
		const rules = loadGatewayRules();
		expect(rules.enabled).toBe(true);
		expect(rules.patterns.length).toBeGreaterThan(0);
		expect(rules.fallback).toBeDefined();
		expect(rules.fallback?.trigger_statuses).toContain(429);
	});
});

describe("2. Privacy Shield & Sanitizer Engine", () => {
	test("redacts sensitive IP and bearer tokens without mutating original string", () => {
		const raw = "Bearer mock-token-auth-sample-value and IP is 192.168.1.10";
		const { sanitized, maskedCount } = sanitizeText(raw, DEFAULT_RULES);

		expect(maskedCount).toBe(2);
		expect(sanitized).toContain("[REDACTED_BY_GOBLIN_SHIELD]");
		expect(sanitized).not.toContain("192.168.1.10");
		// Verify original string unmodified
		expect(raw).toContain("192.168.1.10");
	});

	test("handles empty or clean text gracefully", () => {
		const clean = "Hello, what is the capital of France?";
		const { sanitized, maskedCount } = sanitizeText(clean, DEFAULT_RULES);
		expect(maskedCount).toBe(0);
		expect(sanitized).toBe(clean);
	});
});

describe("3. Circuit Breaker & Fallback Router", () => {
	test("detects fallback status triggers correctly", () => {
		expect(shouldTriggerFallback(429, DEFAULT_FALLBACK)).toBe(true);
		expect(shouldTriggerFallback(410, DEFAULT_FALLBACK)).toBe(true);
		expect(shouldTriggerFallback(500, DEFAULT_FALLBACK)).toBe(true);
		expect(shouldTriggerFallback(503, DEFAULT_FALLBACK)).toBe(true);
		expect(shouldTriggerFallback(200, DEFAULT_FALLBACK)).toBe(false);
		expect(shouldTriggerFallback(400, DEFAULT_FALLBACK)).toBe(false);
	});

	test("resolves fallback candidates in order", () => {
		const candidates = resolveFallbackCandidates(
			"google-antigravity/claude-sonnet-4-6",
			DEFAULT_FALLBACK,
		);
		expect(candidates).toContain("google-antigravity/gemini-3.1-pro");
	});

	test("circuit breaker cooldown trips after 3 consecutive failures", () => {
		const testModel = "test-provider/fail-model";
		expect(isModelHealthy(testModel)).toBe(true);

		recordModelFailure(testModel);
		recordModelFailure(testModel);
		expect(isModelHealthy(testModel)).toBe(true);

		recordModelFailure(testModel);
		expect(isModelHealthy(testModel)).toBe(false); // Cooldown tripped

		recordModelSuccess(testModel);
		expect(isModelHealthy(testModel)).toBe(true); // Reset on success
	});

	test("extracts and replaces model immutably", () => {
		const bodyStr = JSON.stringify({
			model: "model-a",
			messages: [{ role: "user", content: "hi" }],
		});
		const extracted = extractModelFromBody(bodyStr);
		expect(extracted?.model).toBe("model-a");

		const fallbackBody = buildFallbackBody(extracted?.parsed, "model-b");
		const parsedFallback = JSON.parse(fallbackBody!);
		expect(parsedFallback.model).toBe("model-b");
		expect(extracted?.parsed.model).toBe("model-a"); // Original unmodified
	});
});

describe("4. Deterministic SHA-256 Prompt Caching Engine", () => {
	const cacheDir = join(TEST_DIR, "cache");
	let cacheManager: PromptCacheManager;

	beforeAll(() => {
		if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
		cacheManager = new PromptCacheManager(cacheDir, 5000);
	});

	afterAll(() => {
		if (existsSync(TEST_DIR))
			rmSync(TEST_DIR, { recursive: true, force: true });
	});

	test("computes identical hash for identical payloads regardless of key ordering", () => {
		const body1 = {
			model: "m1",
			messages: [{ role: "user", content: "ping" }],
			temperature: 0.7,
		};
		const body2 = {
			temperature: 0.7,
			model: "m1",
			messages: [{ role: "user", content: "ping" }],
		};

		const hash1 = computePromptHash(body1);
		const hash2 = computePromptHash(body2);
		expect(hash1).toBe(hash2);
		expect(hash1).toHaveLength(64);
	});

	test("saves and retrieves non-streaming cache entry", () => {
		const hash = computePromptHash({ model: "test", messages: ["msg1"] });
		cacheManager.set(
			hash,
			{
				model: "test",
				status: 200,
				headers: { "content-type": "application/json" },
				isStream: false,
			},
			'{"reply": "pong"}',
		);

		const cached = cacheManager.get(hash);
		expect(cached).not.toBeNull();
		expect(cached?.isStream).toBe(false);
		expect(cached?.body).toBe('{"reply": "pong"}');
	});

	test("saves and retrieves streaming cache chunks", () => {
		const hash = computePromptHash({
			model: "test-stream",
			messages: ["msg2"],
		});
		const sampleChunks = [
			'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
			'data: {"choices":[{"delta":{"content":" World"}}]}\n\n',
			"data: [DONE]\n\n",
		];

		cacheManager.set(
			hash,
			{
				model: "test-stream",
				status: 200,
				headers: { "content-type": "text/event-stream" },
				isStream: true,
				totalChunks: sampleChunks.length,
			},
			sampleChunks,
		);

		const cached = cacheManager.get(hash);
		expect(cached).not.toBeNull();
		expect(cached?.isStream).toBe(true);
		expect(cached?.chunks.length).toBe(3);
	});
});

describe("5. Replay & Fixture Engine", () => {
	const fixturesDir = join(TEST_DIR, "fixtures");
	let fixtureManager: FixtureManager;

	beforeAll(() => {
		fixtureManager = new FixtureManager(fixturesDir);
	});

	test("records and mocks back interaction correctly", async () => {
		const reqBody = {
			model: "m-record",
			messages: [{ role: "user", content: "record me" }],
		};
		fixtureManager.record(
			"test-session",
			{
				url: "/v1/chat/completions",
				method: "POST",
				model: "m-record",
				body: reqBody,
			},
			{
				status: 200,
				headers: { "content-type": "application/json" },
				isStream: false,
				body: JSON.stringify({
					id: "rec-1",
					choices: [{ message: { content: "recorded response" } }],
				}),
			},
		);

		const mockResp = fixtureManager.mock("test-session", reqBody);
		expect(mockResp).not.toBeNull();
		expect(mockResp?.status).toBe(200);
		const mockData: any = await mockResp?.json();
		expect(mockData.choices[0].message.content).toBe("recorded response");
	});
});

describe("6. Master Gateway Server End-to-End Integration", () => {
	let mockUpstreamServer: any;
	let gatewayServer: any;
	const mockPort = 4502;
	const gwPort = 4500;

	beforeAll(async () => {
		// 1. Mock Upstream Provider on 4502
		mockUpstreamServer = Bun.serve({
			port: mockPort,
			hostname: "127.0.0.1",
			async fetch(req) {
				const url = new URL(req.url);

				if (url.pathname === "/v1/models") {
					return new Response(
						JSON.stringify({ data: [{ id: "test-model" }] }),
						{
							headers: { "content-type": "application/json" },
						},
					);
				}

				if (url.pathname === "/v1/chat/completions") {
					const body: any = await req.json();

					// Trigger simulated 429 for model "trigger-429"
					if (body.model === "trigger-429") {
						return new Response(
							JSON.stringify({ error: "rate limit exceeded" }),
							{
								status: 429,
								headers: { "content-type": "application/json" },
							},
						);
					}

					// Streaming mock
					if (body.stream) {
						const chunks = [
							'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
							'data: {"choices":[{"delta":{"content":" from upstream"}}]}\n\n',
							"data: [DONE]\n\n",
						];
						const encoder = new TextEncoder();
						const stream = new ReadableStream({
							start(controller) {
								for (const chunk of chunks) {
									controller.enqueue(encoder.encode(chunk));
								}
								controller.close();
							},
						});
						return new Response(stream, {
							headers: { "content-type": "text/event-stream; charset=utf-8" },
						});
					}

					return new Response(
						JSON.stringify({
							id: "chatcmpl-test",
							model: body.model,
							choices: [
								{
									message: {
										role: "assistant",
										content: `Echo: ${body.messages[0]?.content}`,
									},
								},
							],
							usage: {
								prompt_tokens: 10,
								completion_tokens: 5,
								total_tokens: 15,
							},
						}),
						{
							headers: { "content-type": "application/json" },
						},
					);
				}

				return new Response("Not found", { status: 404 });
			},
		});

		// 2. Gateway Server on 4500
		gatewayServer = createGatewayServer({
			port: gwPort,
			targetHost: "127.0.0.1",
			targetPort: mockPort,
			cacheEnabled: true,
			cacheDir: join(TEST_DIR, "gw-cache"),
			shieldEnabled: true,
			mode: "live",
		});

		gatewayServer.start();
	});

	afterAll(() => {
		if (gatewayServer) gatewayServer.stop();
		if (mockUpstreamServer) mockUpstreamServer.stop();
	});

	test("serves health and status check on /gn/health", async () => {
		const res = await fetch(`http://127.0.0.1:${gwPort}/gn/health`);
		expect(res.status).toBe(200);
		const data: any = await res.json();
		expect(data.status).toBe("ok");
		expect(data.port).toBe(gwPort);
	});

	test("proxies non-streaming completions and establishes cache on second hit", async () => {
		const payload = {
			model: "google-antigravity/gemini-3.1-pro",
			messages: [{ role: "user", content: "Hello world" }],
		};

		// First request: Cache MISS
		const res1 = await fetch(`http://127.0.0.1:${gwPort}/v1/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		expect(res1.status).toBe(200);
		expect(res1.headers.get("X-GN-Cache")).toBe("MISS");
		const data1: any = await res1.json();
		expect(data1.choices[0].message.content).toContain("Hello world");

		// Second request: Cache HIT
		const res2 = await fetch(`http://127.0.0.1:${gwPort}/v1/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		expect(res2.status).toBe(200);
		expect(res2.headers.get("X-GN-Cache")).toBe("HIT");
		const data2: any = await res2.json();
		expect(data2.choices[0].message.content).toContain("Hello world");
	});

	test("proxies SSE streaming completions correctly", async () => {
		const streamPayload = {
			model: "google-antigravity/gemini-3.6-flash",
			stream: true,
			messages: [{ role: "user", content: "Stream me please" }],
		};

		const res = await fetch(`http://127.0.0.1:${gwPort}/v1/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(streamPayload),
		});

		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		const text = await res.text();
		expect(text).toContain("Hi");
		expect(text).toContain("[DONE]");
	});
});

describe("8. Hybrid Multi-Upstream Router (Issue #38)", () => {
	let upstreamA: any;
	let upstreamB: any;
	let hybridGateway: any;
	const portA = 4512;
	const portB = 4513;
	const gwPort = 4510;

	beforeAll(async () => {
		// Upstream A = OMP-like (gemini)
		upstreamA = Bun.serve({
			port: portA,
			hostname: "127.0.0.1",
			async fetch(req) {
				const url = new URL(req.url);
				if (url.pathname === "/v1/models") {
					return new Response(
						JSON.stringify({
							object: "list",
							data: [{ id: "google-antigravity/gemini-3.8-flash" }],
						}),
					);
				}
				if (url.pathname === "/v1/chat/completions") {
					const body: any = await req.json();
					return new Response(
						JSON.stringify({
							id: "a",
							model: body.model,
							choices: [{ message: { content: `A:${body.model}` } }],
						}),
					);
				}
				return new Response("nf", { status: 404 });
			},
		});

		// Upstream B = VansRouter-like (deepseek / xiamoi)
		upstreamB = Bun.serve({
			port: portB,
			hostname: "127.0.0.1",
			async fetch(req) {
				const url = new URL(req.url);
				if (url.pathname === "/api/v1/models") {
					return new Response(
						JSON.stringify({
							object: "list",
							data: [
								{ id: "deepseek/deepseek-v4-flash" },
								{ id: "xiamoi/mimo-pro" },
							],
						}),
					);
				}
				if (url.pathname === "/api/v1/chat/completions") {
					const body: any = await req.json();
					return new Response(
						JSON.stringify({
							id: "b",
							model: body.model,
							choices: [{ message: { content: `B:${body.model}` } }],
						}),
					);
				}
				return new Response("nf", { status: 404 });
			},
		});

		hybridGateway = createGatewayServer({
			port: gwPort,
			targetHost: "127.0.0.1",
			targetPort: portA, // legacy default = upstream A
			cacheEnabled: false,
			shieldEnabled: false,
			mode: "live",
			upstreams: [
				{ name: "omp", host: "127.0.0.1", port: portA, basePath: "/v1" },
				{
					name: "vansrouter",
					host: "127.0.0.1",
					port: portB,
					basePath: "/api/v1",
				},
			],
		});
		hybridGateway.start();
	});

	afterAll(() => {
		hybridGateway?.stop();
		upstreamA?.stop();
		upstreamB?.stop();
	});

	test("GET /v1/models merges catalogs from both upstreams", async () => {
		const res = await fetch(`http://127.0.0.1:${gwPort}/v1/models`);
		expect(res.status).toBe(200);
		const data: any = await res.json();
		const ids = data.data.map((m: any) => m.id);
		expect(ids).toContain("google-antigravity/gemini-3.8-flash");
		expect(ids).toContain("deepseek/deepseek-v4-flash");
		expect(ids).toContain("xiamoi/mimo-pro");
		expect(res.headers.get("X-GN-Upstreams")).toBe("2");
	});

	test("POST routes gemini model to upstream A (OMP)", async () => {
		const res = await fetch(`http://127.0.0.1:${gwPort}/v1/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: "google-antigravity/gemini-3.8-flash",
				messages: [{ role: "user", content: "hi" }],
			}),
		});
		const data: any = await res.json();
		expect(data.model).toBe("google-antigravity/gemini-3.8-flash");
		expect(data.choices[0].message.content).toBe(
			"A:google-antigravity/gemini-3.8-flash",
		);
	});

	test("POST routes deepseek model to upstream B (VansRouter)", async () => {
		const res = await fetch(`http://127.0.0.1:${gwPort}/v1/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: "deepseek/deepseek-v4-flash",
				messages: [{ role: "user", content: "hi" }],
			}),
		});
		const data: any = await res.json();
		expect(data.model).toBe("deepseek/deepseek-v4-flash");
		expect(data.choices[0].message.content).toBe(
			"B:deepseek/deepseek-v4-flash",
		);
	});

	test("unknown model defaults to upstream A (OMP)", async () => {
		const res = await fetch(`http://127.0.0.1:${gwPort}/v1/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: "mystery/model-xyz",
				messages: [{ role: "user", content: "hi" }],
			}),
		});
		const data: any = await res.json();
		expect(data.choices[0].message.content).toBe("A:mystery/model-xyz");
	});
});

describe("7. Access Log & Fallback Chain Analytics", () => {
	const logFile = join(TEST_DIR, "test-access.jsonl");
	let logManager: AccessLogManager;

	beforeAll(() => {
		if (!existsSync(TEST_DIR)) {
			mkdirSync(TEST_DIR, { recursive: true });
		}
		logManager = new AccessLogManager(logFile);
	});

	afterAll(() => {
		if (existsSync(logFile)) rmSync(logFile, { force: true });
	});

	test("records and filters access log entries", () => {
		const entry1: AccessLogEntry = {
			ts: Date.now(),
			method: "POST",
			path: "/v1/chat/completions",
			initialModel: "kilo-auto/free",
			servedModel: "minimax-m3",
			status: 200,
			latencyMs: 1500,
			cache: "MISS",
			stream: true,
			fallback: {
				chain: [
					{ model: "kilo-auto/free", status: 503, ok: false },
					{ model: "minimax-m3", status: 200, ok: true },
				],
				hopCount: 2,
			},
			shieldRedacted: 2,
		};

		const entry2: AccessLogEntry = {
			ts: Date.now(),
			method: "POST",
			path: "/v1/chat/completions",
			initialModel: "minimax-m3",
			servedModel: "minimax-m3",
			status: 200,
			latencyMs: 12,
			cache: "HIT",
			stream: false,
			shieldRedacted: 0,
		};

		logManager.write(entry1);
		logManager.write(entry2);

		const all = logManager.readLogs({ limit: 10 });
		expect(all.length).toBe(2);
		expect(all[0].servedModel).toBe("minimax-m3");
		expect(all[0].fallback?.hopCount).toBe(2);

		// Filter by model
		const filtered = logManager.readLogs({ model: "kilo" });
		expect(filtered.length).toBe(1);
		expect(filtered[0].initialModel).toBe("kilo-auto/free");
	});

	test("formats cascading fallback chains with symbols", () => {
		const fallbackEntry: AccessLogEntry = {
			ts: Date.now(),
			method: "POST",
			path: "/v1/chat/completions",
			initialModel: "kilo-auto/free",
			servedModel: "gemini-flash",
			status: 200,
			latencyMs: 2200,
			cache: "MISS",
			stream: true,
			fallback: {
				chain: [
					{ model: "kilo-auto/free", status: 503, ok: false },
					{ model: "minimax-m3", status: 503, ok: false },
					{ model: "gemini-flash", status: 200, ok: true },
				],
				hopCount: 3,
			},
			shieldRedacted: 0,
		};

		const chainStr = formatModelChain(fallbackEntry);
		expect(chainStr).toContain("✖ free");
		expect(chainStr).toContain("503");
		expect(chainStr).toContain("✖ minimax-m3");
		expect(chainStr).toContain("✓ gemini-flash");
	});

	test("renders visual box table with summary metrics", () => {
		const entries = logManager.readLogs({ limit: 10 });
		const table = renderAccessLogsTable(entries);
		expect(table).toContain("GATEWAY TRAFFIC & FALLBACK LOGS");
		expect(table).toContain("Traffic Summary");
		expect(table).toContain("Hit Rate");
	});
});
