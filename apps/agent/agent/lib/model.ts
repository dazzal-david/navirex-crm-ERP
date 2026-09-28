import { db } from "@crm/db";
import { readAgentModel } from "@crm/db/settings";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export interface ModelSelection {
	model: string;
	modelContextWindowTokens: number;
}

export async function selectedModel(): Promise<ModelSelection | null> {
	try {
		const setting = await readAgentModel(db);

		if (setting.isDefault) return null;

		return {
			model: setting.id,
			modelContextWindowTokens: setting.contextWindowTokens,
		};
	} catch (error) {
		console.error(
			`[agent] could not read the configured model, falling back: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return null;
	}
}

export const OPENROUTER = {
	model: "nex-agi/nex-n2.5-pro:free",
	fallbacks: ["openrouter/free"],
	contextWindowTokens: 262_144,
} as const;

type OpenRouterSelection = {
	model: ReturnType<ReturnType<typeof createOpenRouter>["chat"]>;
	modelContextWindowTokens: number;
};

let openRouter: { key: string; selection: OpenRouterSelection } | null = null;

export function openRouterModel(): OpenRouterSelection | null {
	const key = process.env.OPENROUTER_API_KEY?.trim();
	if (!key) return null;
	if (openRouter?.key === key) return openRouter.selection;

	const modelId = process.env.OPENROUTER_MODEL?.trim() || OPENROUTER.model;
	const provider = createOpenRouter({ apiKey: key, appName: "Navirex CRM" });
	const selection = {
		model: provider.chat(modelId, { models: [...OPENROUTER.fallbacks] }),
		modelContextWindowTokens: OPENROUTER.contextWindowTokens,
	};
	openRouter = { key, selection };
	return selection;
}
