import Chat from "@carbon/icons-react/es/Chat";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { ConnectionPage, ConnectionPageLoading } from "../connection-page";

export default function WhatsAppConnectionPage(
	props: PageProps<"/[slug]/settings/connections/whatsapp">,
) {
	return (
		<Suspense fallback={<ConnectionPageLoading />}>
			<WhatsAppConnectionPageContent {...props} />
		</Suspense>
	);
}

async function WhatsAppConnectionPageContent({
	params,
}: PageProps<"/[slug]/settings/connections/whatsapp">) {
	await requireSession();
	await params;
	const status = await getServerQueryClient().fetchQuery(
		getServerTrpc().communications.status.queryOptions(),
	);
	return (
		<ConnectionPage className="max-w-(--container-page)">
			<header className="flex flex-col gap-3 px-(--spacing-block-inline)">
				<div className="flex items-center gap-3">
					<Chat className="size-6" />
					<h1 className="font-medium text-2xl tracking-tight">
						WhatsApp Cloud API
					</h1>
				</div>
				<p className="text-muted-foreground text-sm">
					Send conversation messages and approved templates directly from each
					lead record.
				</p>
				<StatusIndicator
					tone={status.whatsapp ? "success" : "warning"}
					label={status.whatsapp ? "Ready" : "Credentials required"}
				/>
			</header>
			<section className="flex flex-col gap-3 border-y px-(--spacing-block-inline) py-5 text-sm">
				<h2 className="font-medium">Secure configuration</h2>
				<p className="text-muted-foreground">
					Set these server variables, then restart the API. Tokens remain
					outside browser storage.
				</p>
				<code className="rounded-lg border bg-muted p-3">
					WHATSAPP_ACCESS_TOKEN
				</code>
				<code className="rounded-lg border bg-muted p-3">
					WHATSAPP_PHONE_NUMBER_ID
				</code>
			</section>
		</ConnectionPage>
	);
}
