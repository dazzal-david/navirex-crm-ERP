import { Button } from "@crm/ui/components/button";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { authorizeQuery, checkMcpAuthorize } from "@/lib/mcp-authorize";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
	title: "Connect Claude",
};

const ABILITIES = [
	"Search leads and read their details, notes and messages",
	"Add notes, change status and next action, assign owners, add contacts",
	"Send WhatsApp messages and emails, only after you approve each one in Claude",
];

export default async function AuthorizePage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const values = await searchParams;
	const check = await checkMcpAuthorize(values);

	if (!check.ok) {
		return (
			<AuthShell>
				<AuthHeading
					title="This link does not work"
					description={check.reason}
				/>
			</AuthShell>
		);
	}

	const session = await getSession();
	if (!session) {
		const next = `/oauth/authorize?${authorizeQuery(check.request).toString()}`;
		redirect(`/sign-in?next=${encodeURIComponent(next)}`);
	}

	const cancel = new URL(check.request.redirect_uri);
	cancel.searchParams.set("error", "access_denied");
	if (check.request.state)
		cancel.searchParams.set("state", check.request.state);

	return (
		<AuthShell>
			<AuthHeading
				title="Connect Claude to Navirex CRM"
				description={`${check.clientName} asks to use the CRM as ${session.user.email}.`}
			/>
			<ul className="flex list-disc flex-col gap-2 pl-5 text-sm/5">
				{ABILITIES.map((ability) => (
					<li key={ability}>{ability}</li>
				))}
			</ul>
			<p className="text-muted-foreground text-sm/5">
				Everything Claude changes is recorded under your name. You can
				disconnect it any time from Claude&apos;s connector settings.
			</p>
			<form
				action="/oauth/authorize/approve"
				className="flex flex-col gap-2"
				method="post"
			>
				{[...authorizeQuery(check.request).entries()].map(([key, value]) => (
					<input key={key} name={key} type="hidden" value={value} />
				))}
				<Button className="w-full" type="submit">
					Allow
				</Button>
				<Button asChild className="w-full" variant="outline">
					<a href={cancel.toString()}>Cancel</a>
				</Button>
			</form>
		</AuthShell>
	);
}
