import { Button } from "@crm/ui/components/button";
import Link from "next/link";
import { Suspense } from "react";
import { API_URL } from "@/lib/env";
import { requireSession } from "@/lib/session";
import { ConnectionPage, ConnectionPageLoading } from "../connection-page";

export default function IntakeConnectionPage(
	props: PageProps<"/[slug]/settings/connections/intake">,
) {
	return (
		<Suspense fallback={<ConnectionPageLoading />}>
			<IntakeConnectionPageContent {...props} />
		</Suspense>
	);
}

async function IntakeConnectionPageContent({
	params,
}: PageProps<"/[slug]/settings/connections/intake">) {
	await requireSession();
	const { slug } = await params;

	return (
		<ConnectionPage className="max-w-(--container-page)">
			<header className="flex flex-col gap-3 px-(--spacing-block-inline)">
				<h1 className="font-medium text-2xl tracking-tight">Intake endpoint</h1>
				<p className="text-muted-foreground text-sm leading-relaxed">
					Create leads from websites, partner systems, and automation tools with
					an authenticated REST request.
				</p>
			</header>
			<section className="flex flex-col gap-4 border-y px-(--spacing-block-inline) py-5">
				<div>
					<p className="font-medium text-sm">POST endpoint</p>
					<code className="mt-2 block overflow-x-auto rounded-lg border bg-muted p-3 text-xs">
						{API_URL}/rest/leads/intake
					</code>
				</div>
				<pre className="overflow-x-auto rounded-lg border bg-muted p-4 text-xs">
					{JSON.stringify(
						{
							name: "Example lead",
							email: "lead@example.com",
							phone: "+919876543210",
							source: "Navitrace website",
							externalId: "form-submission-123",
							kind: "CUSTOMER",
							stage: "UNASSIGNED",
						},
						null,
						2,
					)}
				</pre>
				<p className="text-muted-foreground text-sm">
					Send the API key through the <code>x-api-key</code> header. Repeated
					external IDs or email addresses match existing leads.
				</p>
			</section>
			<div className="flex gap-3 px-(--spacing-block-inline)">
				<Button asChild>
					<Link href={`/${slug}/settings/api-keys`}>Manage API keys</Link>
				</Button>
				<Button asChild variant="outline">
					<Link href={`${API_URL}/`}>Open API documentation</Link>
				</Button>
			</div>
		</ConnectionPage>
	);
}
