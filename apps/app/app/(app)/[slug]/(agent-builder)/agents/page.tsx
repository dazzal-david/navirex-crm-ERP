import type { Metadata } from "next";
import { Suspense } from "react";
import { TeamAgentsIndex } from "@/components/agent-builder/team-agents-index";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";

export const metadata: Metadata = { title: "Automations" };

export default function AgentsPage() {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Automations</PageShellTitle>
					<PageShellDescription>
						Create and monitor flows for new leads, follow-ups, and team work.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<PrefetchedTeamAgents />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function PrefetchedTeamAgents() {
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	const agents = await queryClient.fetchQuery(trpc.agents.list.queryOptions());

	return (
		<HydrateClient>
			<TeamAgentsIndex initialAgents={agents} />
		</HydrateClient>
	);
}
