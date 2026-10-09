import { authorizationServerMetadata, preflight } from "@/lib/mcp-metadata";

export const GET = authorizationServerMetadata;
export const OPTIONS = preflight;
