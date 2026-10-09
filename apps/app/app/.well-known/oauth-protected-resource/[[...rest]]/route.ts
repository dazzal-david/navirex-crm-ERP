import { preflight, protectedResourceMetadata } from "@/lib/mcp-metadata";

export const GET = protectedResourceMetadata;
export const OPTIONS = preflight;
