import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { type auth, SESSION_COOKIE_NAME } from "@crm/auth";
import {
	BadRequestException,
	Controller,
	Get,
	Headers,
	Param,
	Post,
	Query,
	Req,
	Res,
	StreamableFile,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import type { Response } from "express";
import { CommunicationsService } from "./communications.service";
import { WHATSAPP } from "./whatsapp-config";

type CrmSession = UserSession<typeof auth>;

@ApiTags("Communications")
@ApiCookieAuth(SESSION_COOKIE_NAME)
@Controller("api/communications")
export class WhatsAppMediaController {
	constructor(private readonly communications: CommunicationsService) {}

	@Get("media/:activityId")
	async read(
		@Param("activityId") activityId: string,
		@Res({ passthrough: true }) response: Response,
	) {
		const media = await this.communications.whatsappMedia(activityId);
		response.setHeader("Cache-Control", "private, max-age=3600");
		response.setHeader("Content-Type", media.mimeType);
		if (media.size) response.setHeader("Content-Length", media.size);
		response.setHeader(
			"Content-Disposition",
			`inline; filename*=UTF-8''${encodeURIComponent(media.filename)}`,
		);
		response.setHeader("X-Content-Type-Options", "nosniff");
		return new StreamableFile(
			Readable.fromWeb(media.body as WebReadableStream<Uint8Array>),
		);
	}

	@Post("whatsapp/:leadId/media")
	async send(
		@Param("leadId") leadId: string,
		@Query("filename") filename: string | undefined,
		@Query("caption") caption: string | undefined,
		@Headers("content-type") contentType: string | undefined,
		@Req() request: IncomingMessage,
		@Session() session: CrmSession,
	) {
		const bytes = await readBytes(request, WHATSAPP.uploadMaxBytes);
		if (!bytes) {
			throw new BadRequestException(
				`The file is too large. The limit is ${WHATSAPP.uploadMaxBytes / (1024 * 1024)} MB.`,
			);
		}
		return this.communications.sendWhatsAppMedia(
			{
				leadId,
				bytes,
				mimeType: contentType ?? "",
				filename: filename?.trim() || "file",
				caption,
			},
			session.user.id,
		);
	}
}

async function readBytes(
	request: IncomingMessage,
	limit: number,
): Promise<Buffer | null> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.byteLength;
		if (size > limit) return null;
		chunks.push(buffer);
	}
	return Buffer.concat(chunks);
}
