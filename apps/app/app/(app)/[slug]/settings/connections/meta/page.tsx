import LogoFacebook from "@carbon/icons-react/es/LogoFacebook";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { ConnectionPage, ConnectionPageLoading } from "../connection-page";
import { MetaConnection } from "./meta-connection";

export default function MetaConnectionPage(
	props: PageProps<"/[slug]/settings/connections/meta">,
) {
	return (
		<Suspense fallback={<ConnectionPageLoading />}>
			<MetaConnectionPageContent {...props} />
		</Suspense>
	);
}

async function MetaConnectionPageContent({
	params,
}: PageProps<"/[slug]/settings/connections/meta">) {
	await requireSession();
	const { slug } = await params;

	return (
		<ConnectionPage className="max-w-(--container-page)">
			<header className="flex flex-col gap-3 px-(--spacing-block-inline)">
				<div className="flex items-center gap-3">
					<LogoFacebook className="size-6" />
					<h1 className="font-medium text-2xl tracking-tight">Meta Lead Ads</h1>
				</div>
				<p className="text-muted-foreground text-sm leading-relaxed">
					Synchronize Facebook and Instagram instant forms with the Navirex lead
					board.
				</p>
			</header>
			<MetaConnection slug={slug} />
		</ConnectionPage>
	);
}
