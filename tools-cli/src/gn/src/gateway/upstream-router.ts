/**
 * ─────────────────────────────────────────────────────────────
 * Goblin Nexus — Hybrid Multi-Upstream Router (Issue #38)
 * ─────────────────────────────────────────────────────────────
 *
 * Menjadikan GN Gateway (:4010) sebagai single source of truth
 * yang me-route request ke beberapa upstream sekaligus:
 *   - OMP Gateway   (:4000)  basePath /v1
 *   - VansRouter    (:20128) basePath /api/v1
 *
 * Routing bersifat CATALOG-DRIVEN: model di-resolve ke upstream
 * yang mempublikasikan model tsb di /v1/models. Ketidakcocokan
 * (model tidak dikenal di catalog manapun) jatuh ke default
 * upstream (backward-compat dengan perilaku single-upstream).
 */

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import type { UpstreamTarget, ResolvedRoute } from "./types";

/** Default registry bila user tidak mendefinisikan upstream sendiri. */
export const DEFAULT_UPSTREAMS: readonly UpstreamTarget[] = Object.freeze([
	Object.freeze({
		name: "omp",
		host: "127.0.0.1",
		port: 4000,
		basePath: "/v1",
	}),
	Object.freeze({
		name: "vansrouter",
		host: "127.0.0.1",
		port: 20128,
		basePath: "/api/v1",
	}),
]);

const VANS_DB_PATH_DEFAULT = join(homedir(), ".9router", "db", "data.sqlite");

/**
 * Baca definisi upstream dari config (gateway.upstreams). Hasil di-merge
 * dengan DEFAULT_UPSTREAMS: upstream user menimpa default bernama sama,
 * upstream baru ditambahkan, dan yang tak terdaftar tetap dipertahankan.
 * Immutable: tidak memutasi argumen.
 */
export function loadUpstreamsFromConfig(config: any): UpstreamTarget[] {
	const defaults = [...DEFAULT_UPSTREAMS];
	if (!config || typeof config !== "object") return defaults;

	const gw = config.gateway || config;
	const rawUpstreams = Array.isArray(gw.upstreams) ? gw.upstreams : [];

	const merged = new Map<string, UpstreamTarget>(
		defaults.map((u) => [u.name, u]),
	);
	for (const raw of rawUpstreams) {
		if (!raw || typeof raw !== "object" || typeof raw.name !== "string") {
			continue;
		}
		merged.set(raw.name, {
			name: raw.name,
			host: raw.host ?? "127.0.0.1",
			port: Number(raw.port) || 4000,
			basePath: raw.basePath || "/v1",
			apiKey: typeof raw.apiKey === "string" ? raw.apiKey : undefined,
			apiKeyEnv: typeof raw.apiKeyEnv === "string" ? raw.apiKeyEnv : undefined,
		});
	}
	return [...merged.values()];
}

/**
 * Resolusi auth header per upstream.
 * Priority: env var (apiKeyEnv) -> apiKey manual -> DB VansRouter.
 * DB key HANYA dipakai untuk upstream VansRouter (zero-config); upstream lain
 * (mis. OMP) tanpa apiKey/apiKeyEnv tetap tanpa auth.
 */
export async function resolveAuthHeaders(
	upstream: UpstreamTarget,
): Promise<Record<string, string>> {
	const auth: Record<string, string> = {};

	const envKey = upstream.apiKeyEnv
		? (process.env as Record<string, string>)[upstream.apiKeyEnv]
		: undefined;
	const manualKey = upstream.apiKey;

	let key: string | undefined = envKey || manualKey;
	if (!key && upstream.name === "vansrouter") {
		key = (await readVansActiveKeyFromDb()) ?? undefined;
	}

	if (key) {
		auth["Authorization"] = `Bearer ${key}`;
	}
	return auth;
}

/**
 * Ambil API key aktif pertama dari DB VansRouter (~/.9router/db/data.sqlite).
 * Zero-config default: user tidak perlu menyetel apa pun. Gagal/gak ada DB
 * mengembalikan null (upstream dilayani tanpa auth, OMP tetap jalan).
 */
export async function readVansActiveKeyFromDb(
	dbPath: string = VANS_DB_PATH_DEFAULT,
): Promise<string | null> {
	try {
		if (!existsSync(dbPath)) return null;
		const db = new Database(dbPath, { readonly: true });
		try {
			const row = db
				.query(
					"SELECT key FROM apiKeys WHERE isActive = 1 ORDER BY createdAt LIMIT 1",
				)
				.get() as { key?: string } | undefined;
			return row?.key ?? null;
		} finally {
			db.close();
		}
	} catch {
		// Best-effort: DB Vans bisa terkunci/read-only-error; jangan crash gateway.
		return null;
	}
}

/**
 * Bangun URL upstream dari path request. basePath upstream dipakai sebagai
 * prefix vendor: path dari client (mis. /v1/chat/completions) dipetakan ke
 * {basePath}/chat/completions supaya format tiap upstream konsisten.
 */
export function buildUpstreamUrl(
	upstream: UpstreamTarget,
	clientPath: string,
	search: string = "",
): string {
	// Client selalu berbicara OpenAI-style /v1/*. Buang prefix /v1 agar bisa
	// ditempelkan ke basePath vendor yang mungkin /v1 (OMP) atau /api/v1 (Vans).
	let rest = clientPath;
	if (rest.startsWith("/v1")) {
		rest = rest.slice(3) || "";
	}

	const base = upstream.basePath.replace(/\/+$/, "");
	const normalizedBase = base || "";
	return `http://${upstream.host}:${upstream.port}${normalizedBase}${rest}${search}`;
}

/**
 * Resolve upstream untuk sebuah model ID berdasarkan catalog.
 * @param catalogMap Map nama upstream -> Set model ID yang dipublikasikan.
 * @param defaultName Nama upstream default bila model tidak dikenal.
 */
export function resolveUpstreamForModel(
	upstreams: UpstreamTarget[],
	catalogMap: Map<string, Set<string>>,
	modelId: string | null,
	defaultName: string,
): UpstreamTarget {
	if (!modelId) {
		return pickDefault(upstreams, defaultName);
	}
	// Preferensi eksplisit: cari upstream yang catalog-nya memuat model.
	for (const upstream of upstreams) {
		const catalog = catalogMap.get(upstream.name);
		if (catalog?.has(modelId)) return upstream;
	}
	return pickDefault(upstreams, defaultName);
}

function pickDefault(
	upstreams: UpstreamTarget[],
	defaultName: string,
): UpstreamTarget {
	return (
		upstreams.find((u) => u.name === defaultName) ??
		upstreams[0] ??
		({
			name: "omp",
			host: "127.0.0.1",
			port: 4000,
			basePath: "/v1",
		} as UpstreamTarget)
	);
}

/**
 * Fetch & parse catalog model dari satu upstream.
 * Normalisasi ke bentuk OpenAI list; toleran terhadap response non-JSON.
 */
export async function fetchUpstreamCatalog(
	upstream: UpstreamTarget,
	authHeaders: Record<string, string>,
	fetchFn: typeof fetch = fetch,
): Promise<string[]> {
	try {
		const url = buildUpstreamUrl(upstream, "/v1/models");
		const res = await fetchFn(url, {
			headers: { ...authHeaders, accept: "application/json" },
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) return [];
		const text = await res.text();
		return parseModelIds(text);
	} catch {
		return [];
	}
}

/**
 * Parse model ID dari payload catalog. Mendukung bentuk:
 *  - OpenAI list: { data: [{ id, ... }] }
 *  - Object map : { models: { "id": {...} } } (VansRouter cache)
 *  - Array polos: ["id1", "id2"]
 */
export function parseModelIds(rawText: string): string[] {
	try {
		const parsed = JSON.parse(rawText);
		if (Array.isArray(parsed)) {
			// Array polos mis. ["id1","id2"] — validasi elemen string
			return [...new Set(parsed.filter((m) => typeof m === "string"))];
		}
		if (Array.isArray(parsed?.data)) {
			// OpenAI-style list { data: [{ id, ... }] } — dedupe id
			const ids = parsed.data
				.map((m: any) => (typeof m?.id === "string" ? m.id : null))
				.filter((v: unknown): v is string => typeof v === "string");
			return [...new Set<string>(ids)];
		}
		if (parsed && typeof parsed === "object") {
			// Object map (model cache VansRouter)
			const bucket = parsed.models ?? parsed;
			if (bucket && typeof bucket === "object" && !Array.isArray(bucket)) {
				const ids = Object.keys(bucket).filter(
					(k) => typeof bucket[k] === "object" || bucket[k] !== undefined,
				);
				if (ids.length > 0) return ids;
			}
		}
		return [];
	} catch {
		return [];
	}
}

/**
 * Merge catalog beberapa upstream menjadi satu map name->Set model ID.
 */
export async function collectCatalogs(
	upstreams: UpstreamTarget[],
	fetchFn: typeof fetch = fetch,
): Promise<Map<string, Set<string>>> {
	const catalogMap = new Map<string, Set<string>>();
	await Promise.all(
		upstreams.map(async (upstream) => {
			const authHeaders = await resolveAuthHeaders(upstream);
			const ids = await fetchUpstreamCatalog(upstream, authHeaders, fetchFn);
			catalogMap.set(upstream.name, new Set(ids));
		}),
	);
	return catalogMap;
}

/**
 * Normalisasi dua respons catalog (masing-masing { data: [...] }) menjadi
 * satu daftar OpenAI-style yang sudah di-dedupe. Entry dipertahankan secara
 * utuh dari upstream asal; id duplikat dipilih dari upstream pertama.
 */
export function mergeModelResponses(
	responses: { upstreamName: string; bodyText: string | null }[],
): { object: string; data: any[]; upstreamCount: number } {
	const byId = new Map<string, any>();
	const seenUpstream = new Set<string>();

	for (const resp of responses) {
		if (resp.bodyText == null) continue;
		seenUpstream.add(resp.upstreamName);
		let parsed: any;
		try {
			parsed = JSON.parse(resp.bodyText);
		} catch {
			continue;
		}
		const entries = Array.isArray(parsed?.data) ? parsed.data : [];
		for (const entry of entries) {
			if (entry && typeof entry.id === "string" && !byId.has(entry.id)) {
				byId.set(entry.id, entry);
			}
		}
	}

	return {
		object: "list",
		data: [...byId.values()],
		upstreamCount: seenUpstream.size,
	};
}

/** Helper untuk membungkus target URL hasil routing. */
export function makeResolvedRoute(
	upstream: UpstreamTarget,
	url: string,
	authHeaders: Record<string, string>,
): ResolvedRoute {
	return { upstream, url, authHeaders };
}
