import Upload from "@carbon/icons-react/es/Upload";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { ConnectionPage, ConnectionPageLoading } from "../connection-page";
import { ZohoImporter } from "./zoho-importer";

export default function ZohoConnectionPage(
	props: PageProps<"/[slug]/settings/connections/zoho">,
) {
	return (
		<Suspense fallback={<ConnectionPageLoading />}>
			<ZohoConnectionPageContent {...props} />
		</Suspense>
	);
}

async function ZohoConnectionPageContent({
	params,
}: PageProps<"/[slug]/settings/connections/zoho">) {
	await requireSession();
	await params;
	return (
		<ConnectionPage className="max-w-(--container-page)">
			<header className="flex flex-col gap-3 px-(--spacing-block-inline)">
				<div className="flex items-center gap-3">
					<Upload className="size-6" />
					<h1 className="font-medium text-2xl tracking-tight">
						Zoho CRM migration
					</h1>
				</div>
				<p className="text-muted-foreground text-sm leading-relaxed">
					Import a Zoho Leads CSV. Repeated imports update matching Zoho records
					safely.
				</p>
			</header>
			<ZohoImporter />
		</ConnectionPage>
	);
}
