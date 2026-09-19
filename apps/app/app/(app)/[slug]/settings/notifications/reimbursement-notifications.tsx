"use client";

import Notification from "@carbon/icons-react/es/Notification";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import { Switch } from "@crm/ui/components/switch";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function ReimbursementNotifications() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const settings = useQuery(
		trpc.settings.reimbursementNotifications.queryOptions(),
	);
	const [notifyManager, setNotifyManager] = useState(
		settings.data?.notifyManager ?? true,
	);
	const save = useMutation(
		trpc.settings.setReimbursementNotifications.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.settings.reimbursementNotifications.queryKey(),
				});
				toast.success("Notification settings saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Card className="rounded-2xl border bg-card p-5 shadow-sm">
			<CardHeader>
				<div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
					<Icon icon={Notification} />
				</div>
				<CardTitle className="text-base">Reimbursement alerts</CardTitle>
				<CardDescription>
					Choose who receives an email when an employee submits a claim.
				</CardDescription>
			</CardHeader>
			<CardContent className="rounded-2xl bg-muted/20">
				<form
					className="flex flex-col gap-5"
					onSubmit={(event) => {
						event.preventDefault();
						const data = new FormData(event.currentTarget);
						const additionalRecipients = String(data.get("recipients") ?? "")
							.split(/[\n,]/)
							.map((email) => email.trim())
							.filter(Boolean);
						save.mutate({ notifyManager, additionalRecipients });
					}}
				>
					<div className="flex items-center justify-between gap-4 rounded-xl border bg-background p-4">
						<span>
							<label
								className="block font-medium text-sm"
								htmlFor="notify-manager"
							>
								Employee manager
							</label>
							<span className="block text-muted-foreground text-xs">
								Send to the manager assigned in the employee profile.
							</span>
						</span>
						<Switch
							id="notify-manager"
							checked={notifyManager}
							onCheckedChange={setNotifyManager}
						/>
					</div>

					<div className="flex flex-col gap-2 text-sm">
						<label className="font-medium" htmlFor="notification-recipients">
							Additional recipients
						</label>
						<Textarea
							defaultValue={settings.data?.additionalRecipients.join("\n")}
							id="notification-recipients"
							name="recipients"
							placeholder={"finance@navirex.co.in\noperations@navirex.co.in"}
							rows={5}
						/>
						<span className="text-muted-foreground text-xs">
							Use one email per line. The sender uses the connected Microsoft or
							Google account.
						</span>
					</div>

					<Button
						className="self-start"
						disabled={save.isPending}
						type="submit"
					>
						{save.isPending ? "Saving…" : "Save notifications"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
