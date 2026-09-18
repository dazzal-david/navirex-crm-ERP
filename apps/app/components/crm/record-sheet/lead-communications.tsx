"use client";

import Chat from "@carbon/icons-react/es/Chat";
import Email from "@carbon/icons-react/es/Email";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

type Channel = "email" | "whatsapp";

export function LeadCommunicationActions({
	leadId,
	email,
	phone,
}: {
	leadId: string;
	email: string | null;
	phone: string | null;
}) {
	const [channel, setChannel] = useState<Channel | null>(null);
	return (
		<>
			<Button
				disabled={!email}
				onClick={() => setChannel("email")}
				size="sm"
				variant="outline"
			>
				<Icon data-icon="inline-start" icon={Email} />
				Email
			</Button>
			<Button
				disabled={!phone}
				onClick={() => setChannel("whatsapp")}
				size="sm"
				variant="outline"
			>
				<Icon data-icon="inline-start" icon={Chat} />
				WhatsApp
			</Button>
			<CommunicationDialog
				channel={channel}
				leadId={leadId}
				onClose={() => setChannel(null)}
			/>
		</>
	);
}

function CommunicationDialog({
	channel,
	leadId,
	onClose,
}: {
	channel: Channel | null;
	leadId: string;
	onClose: () => void;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [subject, setSubject] = useState("Following up from Navirex");
	const [body, setBody] = useState("");
	const [mode, setMode] = useState<"text" | "template">("text");
	const [templateName, setTemplateName] = useState("");
	const [language, setLanguage] = useState("en_US");
	const [variables, setVariables] = useState("");
	const status = useQuery({
		...trpc.communications.status.queryOptions(),
		enabled: channel !== null,
	});
	const refresh = async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.activities.timeline.queryKey({ leadId }),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.dashboard.leadOverview.queryKey(),
			}),
		]);
	};
	const emailMutation = useMutation(
		trpc.communications.sendEmail.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success("Email sent.");
				onClose();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const whatsappMutation = useMutation(
		trpc.communications.sendWhatsApp.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success("WhatsApp message accepted by Meta.");
				onClose();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const emailReady = Boolean(
		status.data?.email.google || status.data?.email.microsoft,
	);
	const whatsappReady = status.data?.whatsapp === true;
	const pending = emailMutation.isPending || whatsappMutation.isPending;

	return (
		<Dialog
			open={channel !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{channel === "email" ? "Send email" : "Send WhatsApp message"}
					</DialogTitle>
					<DialogDescription>
						Navirex records the successful send in this lead&apos;s activity.
					</DialogDescription>
				</DialogHeader>
				{status.isPending ? <Spinner /> : null}
				{channel === "email" ? (
					<div className="flex flex-col gap-4">
						<Field label="Subject">
							<Input
								onChange={(event) => setSubject(event.target.value)}
								value={subject}
							/>
						</Field>
						<Field label="Message">
							<Textarea
								className="min-h-40"
								onChange={(event) => setBody(event.target.value)}
								value={body}
							/>
						</Field>
						<Button
							disabled={
								!emailReady || !subject.trim() || !body.trim() || pending
							}
							onClick={() => emailMutation.mutate({ leadId, subject, body })}
						>
							{pending
								? "Sending…"
								: emailReady
									? "Send email"
									: "Reconnect email with sending access"}
						</Button>
					</div>
				) : null}
				{channel === "whatsapp" ? (
					<div className="flex flex-col gap-4">
						<div className="flex gap-2">
							<Button
								onClick={() => setMode("text")}
								size="sm"
								variant={mode === "text" ? "default" : "outline"}
							>
								Conversation message
							</Button>
							<Button
								onClick={() => setMode("template")}
								size="sm"
								variant={mode === "template" ? "default" : "outline"}
							>
								Approved template
							</Button>
						</div>
						{mode === "text" ? (
							<Field label="Message">
								<Textarea
									className="min-h-40"
									onChange={(event) => setBody(event.target.value)}
									value={body}
								/>
							</Field>
						) : (
							<>
								<Field label="Template name">
									<Input
										onChange={(event) => setTemplateName(event.target.value)}
										value={templateName}
									/>
								</Field>
								<Field label="Language">
									<Input
										onChange={(event) => setLanguage(event.target.value)}
										value={language}
									/>
								</Field>
								<Field label="Body variables">
									<Input
										onChange={(event) => setVariables(event.target.value)}
										placeholder="Comma-separated values"
										value={variables}
									/>
								</Field>
							</>
						)}
						<p className="text-muted-foreground text-xs">
							Conversation messages require an open customer service window. Use
							approved templates otherwise.
						</p>
						<Button
							disabled={
								!whatsappReady ||
								pending ||
								(mode === "text" ? !body.trim() : !templateName.trim())
							}
							onClick={() =>
								whatsappMutation.mutate({
									leadId,
									mode,
									body: mode === "text" ? body : undefined,
									templateName: mode === "template" ? templateName : undefined,
									language,
									variables: variables
										.split(",")
										.map((value) => value.trim())
										.filter(Boolean),
								})
							}
						>
							{pending
								? "Sending…"
								: whatsappReady
									? "Send WhatsApp message"
									: "WhatsApp credentials required"}
						</Button>
					</div>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2 font-medium text-sm">
			<span>{label}</span>
			{children}
		</div>
	);
}
