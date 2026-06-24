import Stripe from "stripe";
import { env } from "./env.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-05-27.dahlia",
  typescript: true,
}) as InstanceType<typeof Stripe>;
