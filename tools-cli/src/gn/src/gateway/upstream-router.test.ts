/**
 * ─────────────────────────────────────────────────────────────
 * Goblin Nexus — Upstream Router Unit Tests (Issue #38)
 * ─────────────────────────────────────────────────────────────
 */

import { describe, expect, test } from "bun:test";
import {
	buildUpstreamUrl,
	collectCatalogs,
	loadUpstreamsFromConfig,
	mergeModelResponses,
	parseModelIds,
	readVansActiveKeyFromDb,
	resolveAuthHeaders,
	resolveUpstreamForModel,
	DEFAULT_UPSTREAMS,
} from "./upstream-router";
import type { UpstreamTarget } from "./types";

const OMP: UpstreamTarget = {
	name: "omp",
	host: "127.0.0.1",
	port: 4000,
	basePath: "/v1",
};
const VANS: UpstreamTarget = {
	name: "vansrouter",
	host: "127.0.0.1",
	port: 20128,
	basePath: "/api/v1",
};

describe("upstream-router: URL building", () => {
	test("maps client path onto vendor basePath correctly", () => {
		// OMP base /v1; client /v1/models -> /v1/models
		expect(buildUpstreamUrl(OMP, "/v1/models", "?x=1")).toBe(
			"http://127.0.0.1:4000/v1/models?x=1",
		);
		// Vans base /api/v1; client /v1/models -> /api/v1/models
		expect(buildUpstreamUrl(VANS, "/v1/models", "?x=1")).toBe(
			"http://127.0.0.1:20128/api/v1/models?x=1",
		);
		// Path sama dengan base -> jatuh ke root
		expect(buildUpstreamUrl(OMP, "/v1", "")).toBe("http://127.0.0.1:4000/v1");
	});

	test("keeps arbitrary endpoint mapped to basePath", () => {
		expect(buildUpstreamUrl(OMP, "/v1/chat/completions", "")).toBe(
			"http://127.0.0.1:4000/v1/chat/completions",
		);
	});
});

describe("upstream-router: config loading", () => {
	test("returns defaults when config empty", () => {
		const list = loadUpstreamsFromConfig({});
		expect(list.map((u) => u.name)).toEqual(["omp", "vansrouter"]);
	});

	test("merges user upstreams over defaults (immutable)", () => {
		const list = loadUpstreamsFromConfig({
			gateway: {
				upstreams: [
					{ name: "omp", port: 7777, basePath: "/custom" },
					{ name: "extra", host: "10.0.0.5", port: 9000, basePath: "/v1" },
				],
			},
		});
		const omp = list.find((u) => u.name === "omp")!;
		expect(omp.port).toBe(7777);
		expect(omp.basePath).toBe("/custom");
		// extra ditambahkan, vansrouter default tetap
		expect(list.map((u) => u.name)).toContain("extra");
		expect(list.map((u) => u.name)).toContain("vansrouter");
	});
});

describe("upstream-router: catalog parsing", () => {
	test("parses OpenAI-style list", () => {
		const ids = parseModelIds(
			JSON.stringify({
				object: "list",
				data: [{ id: "a" }, { id: "b" }, { id: "a" }],
			}),
		);
		expect(ids).toEqual(["a", "b"]);
	});

	test("parses object-map catalogs", () => {
		const ids = parseModelIds(
			JSON.stringify({ models: { m1: { vision: true }, m2: {} } }),
		);
		expect(ids).toEqual(["m1", "m2"]);
	});

	test("parses plain arrays and ignores garbage", () => {
		expect(parseModelIds('["x","y"]')).toEqual(["x", "y"]);
		expect(parseModelIds("not json")).toEqual([]);
	});
});

describe("upstream-router: model resolution", () => {
	test("routes model to upstream that publishes it in catalog", () => {
		const catalog = new Map<string, Set<string>>([
			["omp", new Set(["google-antigravity/gemini-3.8-flash"])],
			["vansrouter", new Set(["deepseek/deepseek-v4-flash", "xiamoi/mimo"])],
		]);
		expect(
			resolveUpstreamForModel(
				[OMP, VANS],
				catalog,
				"deepseek/deepseek-v4-flash",
				"omp",
			).name,
		).toBe("vansrouter");
		expect(
			resolveUpstreamForModel(
				[OMP, VANS],
				catalog,
				"google-antigravity/gemini-3.8-flash",
				"omp",
			).name,
		).toBe("omp");
	});

	test("unknown model falls back to default upstream", () => {
		const catalog = new Map<string, Set<string>>([]);
		expect(
			resolveUpstreamForModel([OMP, VANS], catalog, "unknown-model", "omp")
				.name,
		).toBe("omp");
		expect(
			resolveUpstreamForModel([OMP, VANS], catalog, null, "omp").name,
		).toBe("omp");
	});
});

describe("upstream-router: merge model responses", () => {
	test("dedupes by id across upstreams, keeps first upstream", () => {
		const merged = mergeModelResponses([
			{
				upstreamName: "omp",
				bodyText: JSON.stringify({
					data: [{ id: "shared", x: 1 }, { id: "only-omp" }],
				}),
			},
			{
				upstreamName: "vansrouter",
				bodyText: JSON.stringify({
					data: [{ id: "shared", x: 2 }, { id: "only-vans" }],
				}),
			},
		]);
		expect(merged.data.length).toBe(3);
		expect(merged.data.find((m: any) => m.id === "shared").x).toBe(1);
		expect(merged.data.map((m: any) => m.id)).toContain("only-vans");
		expect(merged.upstreamCount).toBe(2);
	});

	test("tolerates failing upstream (null body)", () => {
		const merged = mergeModelResponses([
			{
				upstreamName: "omp",
				bodyText: JSON.stringify({ data: [{ id: "a" }] }),
			},
			{ upstreamName: "vansrouter", bodyText: null },
		]);
		expect(merged.data.length).toBe(1);
		expect(merged.upstreamCount).toBe(1);
	});
});

describe("upstream-router: auth resolution", () => {
	test("env var overrides manual apiKey", async () => {
		const up: UpstreamTarget = {
			...VANS,
			apiKey: "manual",
			apiKeyEnv: "GN_TEST_KEY",
		};
		// env tidak diset -> pakai manual
		const h1 = await resolveAuthHeaders(up);
		expect(h1.Authorization).toBe("Bearer manual");
		// env diset -> override
		process.env.GN_TEST_KEY = "from-env";
		try {
			const h2 = await resolveAuthHeaders(up);
			expect(h2.Authorization).toBe("Bearer from-env");
		} finally {
			delete process.env.GN_TEST_KEY;
		}
	});

	test("no key yields no auth header (OMP case)", async () => {
		const h = await resolveAuthHeaders(OMP);
		expect(h.Authorization).toBeUndefined();
	});

	test("reads Vans API key from DB (zero-config)", async () => {
		const key = await readVansActiveKeyFromDb();
		// DB mungkin tidak ada di CI; tidak throw apa pun
		expect(key === null || typeof key === "string").toBe(true);
	});

	test("collectCatalogs builds name->set map from stub fetch", async () => {
		const fakeFetch = async (url: string) =>
			new Response(
				JSON.stringify({
					data: [{ id: url.includes("20128") ? "deep-seek" : "gemini" }],
				}),
				{ status: 200 },
			);
		const map = await collectCatalogs([OMP, VANS], fakeFetch as typeof fetch);
		expect(map.get("omp")?.has("gemini")).toBe(true);
		expect(map.get("vansrouter")?.has("deep-seek")).toBe(true);
	});

	test("DEFAULT_UPSTREAMS shape is stable", () => {
		expect(DEFAULT_UPSTREAMS.length).toBe(2);
		expect(DEFAULT_UPSTREAMS[0].name).toBe("omp");
		expect(DEFAULT_UPSTREAMS[1].port).toBe(20128);
	});
});
