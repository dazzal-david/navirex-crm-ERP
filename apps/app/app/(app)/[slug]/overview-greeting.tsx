"use client";

import { useQueryState } from "nuqs";
import { PageShellDescription, PageShellTitle } from "@/components/page-shell";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { overviewParsers } from "./overview-search-params";

export function OverviewGreetingFallback() {
	return (
		<>
			<PageShellTitle>Welcome back</PageShellTitle>
			<PageShellDescription>
				Your lead flow, follow-ups, and important updates for today.
			</PageShellDescription>
		</>
	);
}

export function OverviewGreeting({ name }: { name: string }) {
	const [scope] = useQueryState(
		SEARCH_PARAM.overview.scope,
		overviewParsers[SEARCH_PARAM.overview.scope],
	);

	return (
		<>
			<PageShellTitle>Welcome back, {firstName(name)}</PageShellTitle>
			<PageShellDescription>
				{scope === "me"
					? "Your lead flow, follow-ups, and important updates for today."
					: "The team's lead flow, follow-ups, and important updates for today."}
			</PageShellDescription>
		</>
	);
}

function firstName(name: string): string {
	return name.trim().split(/\s+/)[0] || "there";
}
