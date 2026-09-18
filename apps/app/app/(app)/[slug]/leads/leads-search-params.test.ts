import { describe, expect, it } from "bun:test";
import { loadLeadSearchParams, toLeadFilters } from "./leads-search-params";

describe("lead search params", () => {
	it("parses linkable board filters", async () => {
		const values = await loadLeadSearchParams({
			q: "  solar  ",
			entity: "INDIA",
			kind: "EPC",
			owner: "user-1",
		});

		expect(toLeadFilters(values)).toEqual({
			q: "solar",
			entity: "INDIA",
			kind: "EPC",
			ownerId: "user-1",
		});
	});

	it("rejects invalid enum values", async () => {
		const values = await loadLeadSearchParams({
			entity: "FRANCE",
			kind: "PARTNER",
		});

		expect(toLeadFilters(values)).toEqual({});
	});

	it("gives the mine filter priority over an owner", async () => {
		const values = await loadLeadSearchParams({
			mine: "true",
			owner: "user-1",
		});

		expect(toLeadFilters(values)).toEqual({ mine: true });
	});
});
