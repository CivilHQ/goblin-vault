/**
 * ─────────────────────────────────────────────────────────────
 * Goblin Nexus — Single Source of Truth untuk Versi CLI
 * ─────────────────────────────────────────────────────────────
 *
 * Dipisah dari index.ts agar modul gateway/server bisa memakai
 * versi yang sama tanpa menimbulkan circular import.
 */
export const GN_VERSION = "2.2.0";
