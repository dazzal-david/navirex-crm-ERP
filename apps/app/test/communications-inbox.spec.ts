import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
	resolve(
		import.meta.dir,
		"../app/(app)/[slug]/communications/communications-inbox.tsx",
	),
	"utf8",
);

describe("communications inbox", () => {
	test("keeps the message scroller inside its required provider", () => {
		const providerStart = source.indexOf("<MessageScrollerProvider");
		const scrollerStart = source.indexOf("<MessageScroller className");
		const scrollerEnd = source.indexOf("</MessageScroller>");
		const providerEnd = source.indexOf("</MessageScrollerProvider>");

		expect(providerStart).toBeGreaterThan(-1);
		expect(providerStart).toBeLessThan(scrollerStart);
		expect(providerEnd).toBeGreaterThan(scrollerEnd);
	});
});
