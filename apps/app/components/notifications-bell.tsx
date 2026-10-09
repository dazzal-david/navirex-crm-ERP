"use client";

import NotificationIcon from "@carbon/icons-react/es/Notification";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { LocalRelativeTime } from "@/components/local-date-time";
import { NOTIFICATIONS_UI } from "@/lib/notifications-config";
import { useTRPC } from "@/lib/trpc/client";

export function NotificationsBell() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const openRecord = useOpenRecord();
	const [open, setOpen] = useState(false);

	const unread = useQuery({
		...trpc.notifications.unreadCount.queryOptions(),
		refetchInterval: NOTIFICATIONS_UI.pollMs,
		refetchIntervalInBackground: false,
	});
	const list = useQuery({
		...trpc.notifications.list.queryOptions(),
		enabled: open,
	});

	const refresh = () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.notifications.unreadCount.queryKey(),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.notifications.list.queryKey(),
			}),
		]);

	const markRead = useMutation(
		trpc.notifications.markRead.mutationOptions({ onSuccess: refresh }),
	);
	const markAllRead = useMutation(
		trpc.notifications.markAllRead.mutationOptions({ onSuccess: refresh }),
	);

	const count = unread.data?.count ?? 0;
	const items = list.data ?? [];

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					aria-label={
						count > 0 ? `${count} unread notifications` : "Notifications"
					}
					className="relative"
					size="icon"
					variant="ghost"
				>
					<Icon icon={NotificationIcon} />
					{count > 0 ? (
						<span className="absolute -top-0.5 -right-0.5">
							<Badge>{count > 99 ? "99+" : count}</Badge>
						</span>
					) : null}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" size="panel">
				<div className="flex items-center justify-between border-b px-3 py-2">
					<span className="font-medium text-sm">Notifications</span>
					<Button
						disabled={count === 0 || markAllRead.isPending}
						onClick={() => markAllRead.mutate()}
						size="sm"
						variant="ghost"
					>
						Mark all read
					</Button>
				</div>
				<div className="max-h-[min(28rem,70dvh)] overflow-y-auto">
					{items.length === 0 ? (
						<p className="p-4 text-muted-foreground text-sm">
							{list.isPending
								? "Loading…"
								: "Nothing yet. Mentions show up here."}
						</p>
					) : (
						<ul className="flex flex-col divide-y">
							{items.map((item) => (
								<li key={item.id}>
									<button
										className="flex w-full gap-2 px-3 py-2.5 text-left hover:bg-muted"
										onClick={() => {
											if (!item.readAt) markRead.mutate({ id: item.id });
											setOpen(false);
											if (item.leadId)
												openRecord({ kind: "lead", id: item.leadId });
											else if (item.companyId)
												openRecord({ kind: "company", id: item.companyId });
										}}
										type="button"
									>
										<span
											aria-hidden
											className="mt-1.5 size-2 shrink-0 rounded-full data-[unread=true]:bg-primary"
											data-unread={!item.readAt}
										/>
										<span className="flex min-w-0 flex-1 flex-col gap-0.5">
											<span className="font-medium text-sm">{item.title}</span>
											<span className="line-clamp-2 text-muted-foreground text-xs">
												{item.body}
											</span>
											<span className="text-muted-foreground text-xs">
												<LocalRelativeTime date={item.createdAt} />
											</span>
										</span>
									</button>
								</li>
							))}
						</ul>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
