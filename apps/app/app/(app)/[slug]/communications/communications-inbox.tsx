"use client";

import Chat from "@carbon/icons-react/es/Chat";
import Email from "@carbon/icons-react/es/Email";
import Notes from "@carbon/icons-react/es/Notebook";
import { Bubble, BubbleContent } from "@crm/ui/components/bubble";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Marker, MarkerContent } from "@crm/ui/components/marker";
import {
	Message,
	MessageContent,
	MessageFooter,
	MessageHeader,
} from "@crm/ui/components/message";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerViewport,
} from "@crm/ui/components/message-scroller";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

type Channel = "note" | "email" | "whatsapp";

export function CommunicationsInbox() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const conversations = useQuery(
		trpc.communications.conversations.queryOptions(),
	);
	const status = useQuery(trpc.communications.status.queryOptions());
	const templates = useQuery(trpc.templates.list.queryOptions());
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [channel, setChannel] = useState<Channel>("note");
	const [subject, setSubject] = useState("Following up from Navirex");
	const [body, setBody] = useState("");
	const leads = conversations.data ?? [];
	const activeId = selectedId ?? leads[0]?.id ?? null;
	const active = leads.find((lead) => lead.id === activeId) ?? null;
	const conversation = useQuery({
		...trpc.communications.conversation.queryOptions({
			leadId: activeId ?? "",
		}),
		enabled: activeId !== null,
	});
	const visible = leads.filter((lead) =>
		`${lead.name} ${lead.companyName ?? ""} ${lead.email ?? ""}`
			.toLowerCase()
			.includes(query.toLowerCase()),
	);
	const refresh = async () => {
		if (!activeId) return;
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.communications.conversation.queryKey({
					leadId: activeId,
				}),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.communications.conversations.queryKey(),
			}),
		]);
		setBody("");
	};
	const note = useMutation(
		trpc.communications.addNote.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);
	const email = useMutation(
		trpc.communications.sendEmail.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);
	const whatsapp = useMutation(
		trpc.communications.sendWhatsApp.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);
	const pending = note.isPending || email.isPending || whatsapp.isPending;
	const canSend =
		Boolean(activeId && body.trim()) &&
		(channel === "note" ||
			(channel === "email" &&
				Boolean(status.data?.email.google || status.data?.email.microsoft)) ||
			(channel === "whatsapp" && status.data?.whatsapp === true));

	return (
		<div className="grid min-h-0 flex-1 overflow-hidden rounded-lg border bg-card md:grid-cols-[18rem_minmax(0,1fr)]">
			<aside className="flex min-h-0 flex-col border-b md:border-r md:border-b-0">
				<div className="border-b p-3">
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search leads"
					/>
				</div>
				<div className="max-h-48 overflow-y-auto md:max-h-none md:flex-1">
					{visible.map((lead) => (
						<button
							className="flex w-full flex-col gap-1 border-b px-4 py-3 text-left hover:bg-muted data-[active=true]:bg-muted"
							data-active={lead.id === activeId}
							key={lead.id}
							onClick={() => setSelectedId(lead.id)}
							type="button"
						>
							<span className="truncate font-medium text-sm">{lead.name}</span>
							<span className="truncate text-muted-foreground text-xs">
								{lead.preview ??
									lead.companyName ??
									lead.source ??
									"No messages yet"}
							</span>
						</button>
					))}
				</div>
			</aside>
			<section className="flex min-h-0 min-w-0 flex-col">
				{active ? (
					<>
						<header className="border-b px-4 py-3">
							<p className="font-medium">{active.name}</p>
							<p className="text-muted-foreground text-xs">
								{active.companyName ??
									active.email ??
									active.phone ??
									active.stage}
							</p>
						</header>
						<MessageScroller className="flex-1">
							<MessageScrollerViewport>
								<MessageScrollerContent className="p-4">
									{conversation.data?.items.length ? (
										conversation.data.items.map((item) => (
											<MessageScrollerItem key={item.id}>
												{item.direction === "internal" ? (
													<Marker variant="separator">
														<MarkerContent>Internal note</MarkerContent>
													</Marker>
												) : null}
												<Message
													align={
														item.direction === "outbound" ? "end" : "start"
													}
												>
													<MessageContent>
														<MessageHeader>
															{channelLabel(item.channel)}
															{item.subject ? ` · ${item.subject}` : ""}
														</MessageHeader>
														<Bubble
															variant={
																item.direction === "outbound"
																	? "tinted"
																	: item.direction === "internal"
																		? "muted"
																		: "outline"
															}
														>
															<BubbleContent className="whitespace-pre-wrap">
																{item.body}
															</BubbleContent>
														</Bubble>
														<MessageFooter>
															{item.authorName ?? active.name} ·{" "}
															{new Date(item.occurredAt).toLocaleString()}
														</MessageFooter>
													</MessageContent>
												</Message>
											</MessageScrollerItem>
										))
									) : (
										<div className="m-auto text-muted-foreground text-sm">
											Start this conversation with a note or message.
										</div>
									)}
								</MessageScrollerContent>
							</MessageScrollerViewport>
							<MessageScrollerButton />
						</MessageScroller>
						<div className="border-t p-3">
							<div className="mb-2 flex flex-wrap gap-2">
								{(["note", "email", "whatsapp"] as const).map((value) => (
									<Button
										key={value}
										size="sm"
										variant={channel === value ? "default" : "outline"}
										onClick={() => setChannel(value)}
									>
										<Icon
											icon={
												value === "email"
													? Email
													: value === "whatsapp"
														? Chat
														: Notes
											}
											data-icon="inline-start"
										/>
										{channelLabel(value)}
									</Button>
								))}
								<Select
									onValueChange={(id) => {
										const template = templates.data?.find(
											(item) => item.id === id,
										);
										if (!template) return;
										setChannel(template.channel.toLowerCase() as Channel);
										setSubject(template.subject ?? "Following up from Navirex");
										setBody(template.body);
									}}
								>
									<SelectTrigger className="ml-auto w-40">
										<SelectValue placeholder="Use template" />
									</SelectTrigger>
									<SelectContent>
										{templates.data
											?.filter((item) => item.active)
											.map((item) => (
												<SelectItem key={item.id} value={item.id}>
													{item.name}
												</SelectItem>
											))}
									</SelectContent>
								</Select>
							</div>
							{channel === "email" ? (
								<Input
									className="mb-2"
									value={subject}
									onChange={(event) => setSubject(event.target.value)}
									placeholder="Subject"
								/>
							) : null}
							<Textarea
								rows={3}
								value={body}
								onChange={(event) => setBody(event.target.value)}
								placeholder={
									channel === "note"
										? "Add an internal note…"
										: "Write a message…"
								}
							/>
							<div className="mt-2 flex items-center justify-between gap-3">
								<p className="text-muted-foreground text-xs">
									{channel === "note"
										? "Visible only to your team"
										: channel === "email" && !canSend
											? "Connect email sending if unavailable"
											: channel === "whatsapp" && !canSend
												? "Configure WhatsApp if unavailable"
												: `Send via ${channelLabel(channel)}`}
								</p>
								<Button
									disabled={!canSend || pending}
									onClick={() => {
										if (!activeId) return;
										if (channel === "note")
											note.mutate({ leadId: activeId, body });
										if (channel === "email")
											email.mutate({ leadId: activeId, subject, body });
										if (channel === "whatsapp")
											whatsapp.mutate({
												leadId: activeId,
												mode: "text",
												body,
												language: "en_US",
												variables: [],
											});
									}}
								>
									Send
								</Button>
							</div>
						</div>
					</>
				) : (
					<div className="m-auto text-muted-foreground text-sm">
						No leads yet.
					</div>
				)}
			</section>
		</div>
	);
}

function channelLabel(channel: Channel): string {
	return channel === "email"
		? "Email"
		: channel === "whatsapp"
			? "WhatsApp"
			: "Note";
}
