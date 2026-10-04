const MB = 1024 * 1024;

export const WHATSAPP_UI = {
	uploadMaxBytes: 4 * MB,
	accept: [
		"image/jpeg",
		"image/png",
		"video/mp4",
		"video/3gpp",
		"audio/ogg",
		"audio/mp4",
		"audio/mpeg",
		"audio/aac",
		"audio/amr",
		"application/pdf",
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"application/vnd.ms-excel",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		"application/vnd.ms-powerpoint",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
		"text/plain",
	].join(","),
	recordingTypes: [
		{ mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
		{ mimeType: "audio/mp4;codecs=mp4a.40.2", extension: "m4a" },
		{ mimeType: "audio/mp4", extension: "m4a" },
	],
	windowRefreshMs: 60_000,
} as const;
