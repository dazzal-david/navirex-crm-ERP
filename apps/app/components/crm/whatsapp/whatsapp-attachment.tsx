"use client";

import Document from "@carbon/icons-react/es/Document";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { useState } from "react";

export type WhatsAppAttachmentData = {
	url: string;
	kind: "image" | "video" | "document" | "audio" | "sticker";
	mimeType: string | null;
	filename: string | null;
	voice: boolean;
};

export function WhatsAppAttachment({
	attachment,
}: {
	attachment: WhatsAppAttachmentData;
}) {
	const [failed, setFailed] = useState(false);

	if (failed) {
		return (
			<p className="text-muted-foreground text-xs">
				This file has expired. WhatsApp keeps files for 30 days.
			</p>
		);
	}

	if (attachment.kind === "image" || attachment.kind === "sticker") {
		return (
			<a href={attachment.url} rel="noreferrer" target="_blank">
				<img
					alt={attachment.filename ?? "WhatsApp image"}
					className="max-h-72 max-w-full rounded-md"
					loading="lazy"
					onError={() => setFailed(true)}
					src={attachment.url}
				/>
			</a>
		);
	}

	if (attachment.kind === "video") {
		return (
			<video
				className="max-h-72 max-w-full rounded-md"
				controls
				onError={() => setFailed(true)}
				preload="metadata"
				src={attachment.url}
			>
				<track kind="captions" />
			</video>
		);
	}

	if (attachment.kind === "audio") {
		return (
			<audio
				className="w-64 max-w-full"
				controls
				onError={() => setFailed(true)}
				preload="metadata"
				src={attachment.url}
			>
				<track kind="captions" />
			</audio>
		);
	}

	return (
		<Button asChild size="sm" variant="outline">
			<a href={attachment.url} rel="noreferrer" target="_blank">
				<Icon data-icon="inline-start" icon={Document} />
				{attachment.filename ?? "Open document"}
			</a>
		</Button>
	);
}
