export const F_BUCKETS: number
export const E_BUCKETS: number
export const X_BUCKETS: number
export function normalizeKey(s: string): string
export function bucketOf(key: string, buckets: number): number
export function englishWords(gloss: string): string[]
export function formCode(tags: string[], pos: string): string
export const FORM_LABELS: Record<string, string>
export function levelOfRank(rank: number | undefined): number
export const LEVEL_NAMES: string[]
