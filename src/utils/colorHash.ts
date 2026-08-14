/** djb2 string hash — simple, well-distributed, no security requirement here. */
function djb2Hash(input: string): number {
	let hash = 5381;
	for (let i = 0; i < input.length; i++) {
		hash = (hash * 33) ^ input.charCodeAt(i);
	}
	return hash >>> 0;
}

/** Deterministically maps a key (e.g. a category id) to a color from the palette. */
export function colorForKey(key: string, palette: string[]): string {
	const normalized = key.trim().toLowerCase();
	if (!normalized || palette.length === 0) return palette[0] ?? "#4285F4";
	const hash = djb2Hash(normalized);
	return palette[hash % palette.length];
}
