export const TOKEN_COSTS = {
  background_removal: 2,
  image_extension: 5,
  ai_image_generation: 4,
  smart_object_removal: 3,
} as const;

export type AiAction = keyof typeof TOKEN_COSTS;

export const PLANS = {
  creator: { amountCents: 900, tokens: 500, label: "Creator" },
  pro: { amountCents: 2900, tokens: 2000, label: "Pro" },
} as const;

export type PlanKey = keyof typeof PLANS;

export const SIGNUP_BONUS = 50;
