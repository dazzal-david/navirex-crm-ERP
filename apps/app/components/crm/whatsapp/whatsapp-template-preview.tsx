"use client";

import Document from "@carbon/icons-react/es/Document";
import Video from "@carbon/icons-react/es/Video";
import { Icon } from "@crm/ui/components/icon";
import { useState } from "react";

export type WhatsAppTemplatePreviewData = {
	body: string;
	headerFormat: string | null;
	headerText: string | null;
	headerMediaUrl: string | null;
	footer: string | null;
};

export function WhatsAppTemplatePreview({
	template,
}: {
	template: WhatsAppTemplatePreviewData;
}) {
	const [imageFailed, setImageFailed] = useState(false);
	const format = template.headerFormat?.toUpperCase() ?? null;

	return (
		<div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
			{format === "IMAGE" && template.headerMediaUrl && !imageFailed ? (
				<img
					alt="Template header"
					className="max-h-48 w-full rounded-sm object-cover"
					onError={() => setImageFailed(true)}
					src={template.headerMediaUrl}
				/>
			) : null}
			{format === "IMAGE" && (!template.headerMediaUrl || imageFailed) ? (
				<p className="text-muted-foreground text-xs">
					Header image: the approved image is sent automatically.
				</p>
			) : null}
			{format === "VIDEO" || format === "DOCUMENT" ? (
				<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
					<Icon icon={format === "VIDEO" ? Video : Document} />
					The approved header {format === "VIDEO" ? "video" : "document"} is
					sent automatically.
				</p>
			) : null}
			{format === "TEXT" && template.headerText ? (
				<p className="font-medium">{template.headerText}</p>
			) : null}
			<p className="whitespace-pre-wrap">{template.body}</p>
			{template.footer ? (
				<p className="text-muted-foreground text-xs">{template.footer}</p>
			) : null}
		</div>
	);
}
