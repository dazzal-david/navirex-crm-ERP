import Logo from "@crm/ui/components/logo";
import { Spinner } from "@crm/ui/components/spinner";

export default function WorkspaceLoading() {
	return (
		<main
			className="flex min-w-0 flex-1 items-center justify-center"
			aria-busy="true"
		>
			<div className="flex flex-col items-center gap-4 text-center">
				<Logo className="size-12" />
				<div className="flex flex-col items-center gap-2">
					<p className="font-medium">Loading Navirex CRM</p>
					<p className="text-muted-foreground text-sm">
						Preparing your lead workspace
					</p>
				</div>
				<Spinner />
			</div>
		</main>
	);
}
