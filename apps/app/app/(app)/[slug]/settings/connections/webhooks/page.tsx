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
import { WebhooksManager } from "./webhooks-manager";

export const metadata: Metadata = { title: "Lead webhooks" };

export default function WebhooksPage() {
	return (
		<Suspense fallback={<PageShellLoading />}>
			<WebhooksPageContent />
		</Suspense>
	);
}

async function WebhooksPageContent() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();
	await queryClient.prefetchQuery(trpc.webhooks.list.queryOptions());
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Lead webhooks</PageShellTitle>
					<PageShellDescription>
						Accept leads and inbound messages from websites, forms, and external
						systems.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<HydrateClient>
					<WebhooksManager />
				</HydrateClient>
			</PageShellContent>
		</PageShell>
	);
}
