import type { Metadata } from "next";
import { Suspense } from "react";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { ReimbursementNotifications } from "./reimbursement-notifications";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Notifications</PageShellTitle>
					<PageShellDescription>
						Control operational email alerts for your team.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Settings />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Settings() {
	await requireSession();
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(
		trpc.settings.reimbursementNotifications.queryOptions(),
	);

	return (
		<HydrateClient>
			<div className="max-w-3xl">
				<ReimbursementNotifications />
			</div>
		</HydrateClient>
	);
}
