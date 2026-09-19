import { Suspense } from "react";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { DashboardSummary } from "./dashboard-summary";
import {
	OverviewGreeting,
	OverviewGreetingFallback,
} from "./overview-greeting";
import {
	OverviewScopeToggle,
	OverviewScopeToggleFallback,
} from "./overview-scope";
import { loadOverviewSearchParams } from "./overview-search-params";

export default function OverviewPage({ searchParams }: PageProps<"/[slug]">) {
	return (
		<PageShell>
			<PageShellHeader className="rounded-[1.75rem] border bg-gradient-to-br from-emerald-50 via-background to-sky-50 p-6 shadow-sm dark:from-emerald-950/30 dark:to-sky-950/20 md:p-8">
				<PageShellHeading>
					<Suspense fallback={<OverviewGreetingFallback />}>
						<Greeting />
					</Suspense>
				</PageShellHeading>
				<PageShellActions>
					<Suspense fallback={<OverviewScopeToggleFallback />}>
						<OverviewScopeToggle />
					</Suspense>
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Summary searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Greeting() {
	const { user } = await requireSession();
	return <OverviewGreeting name={user.name} />;
}

async function Summary({
	searchParams,
}: Pick<PageProps<"/[slug]">, "searchParams">) {
	const [, { scope }] = await Promise.all([
		requireSession(),
		loadOverviewSearchParams(searchParams),
	]);

	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(
		getServerTrpc().dashboard.leadOverview.queryOptions({ scope }),
	);

	return (
		<HydrateClient>
			<DashboardSummary />
		</HydrateClient>
	);
}
