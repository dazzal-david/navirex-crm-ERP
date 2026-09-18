"use client";

import { Button } from "@crm/ui/components/button";
import Link from "next/link";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

export function CommunicationsLinks() {
	const workspaceUrl = useWorkspaceUrl();
	return (
		<>
			<Button asChild size="sm" variant="outline">
				<Link href={workspaceUrl("/templates")}>Templates</Link>
			</Button>
			<Button asChild size="sm" variant="outline">
				<Link href={workspaceUrl("/settings/connections/webhooks")}>
					Webhooks
				</Link>
			</Button>
		</>
	);
}
