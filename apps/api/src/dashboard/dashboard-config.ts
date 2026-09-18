const DAY_MS = 24 * 60 * 60 * 1000;

export const DASHBOARD = {
	sales: {
		trendMonths: 6,
		rateWindowDays: 90,
	},
	leads: {
		trendDays: 14,
		staleDays: 7,
		priorityLimit: 6,
		recentUpdateLimit: 8,
		overdueTaskLimit: 6,
		sourceLimit: 5,
	},
	dayMs: DAY_MS,
} as const;
