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
		"audio/webm;codecs=opus",
		"audio/ogg;codecs=opus",
		"audio/mp4",
		"audio/webm",
	],
	voiceNote: { kbps: 64, frameSamples: 1152, filename: "voice-note.mp3" },
	windowRefreshMs: 60_000,
} as const;
