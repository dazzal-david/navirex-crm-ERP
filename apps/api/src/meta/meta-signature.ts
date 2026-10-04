import { createHmac, timingSafeEqual } from "node:crypto";

function escapeLikeMeta(json: string, hexCase: "lower" | "upper"): string {
	return json.replace(/\//g, "\\/").replace(/[\u0080-￿]/g, (character) => {
		const hex = character.charCodeAt(0).toString(16).padStart(4, "0");
		return `\\u${hexCase === "lower" ? hex : hex.toUpperCase()}`;
	});
}

export function metaSignatureCandidates(raw: string): string[] {
	if (raw.includes("\\/")) return [raw];
	return [
		...new Set([
			raw,
			escapeLikeMeta(raw, "lower"),
			escapeLikeMeta(raw, "upper"),
		]),
	];
}

export function metaSignatureMatches(
	secret: string,
	raw: string,
	signature: string,
): boolean {
	const received = Buffer.from(signature.slice("sha256=".length), "hex");
	return metaSignatureCandidates(raw).some((candidate) => {
		const expected = createHmac("sha256", secret).update(candidate).digest();
		return (
			expected.length === received.length && timingSafeEqual(expected, received)
		);
	});
}
