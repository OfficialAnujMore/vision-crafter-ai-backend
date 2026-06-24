import { Router, Request, Response } from "express";
import { stripe } from "../config/stripe.js";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { creditTokensForPurchase } from "../services/tokenService.js";

const router = Router();

// POST /stripe/webhook
// Must be mounted with express.raw() body parser — see index.ts
router.post("/", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"];

  if (!sig) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  let event: ReturnType<typeof stripe.webhooks.constructEvent>;
  try {
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Webhook signature verification failed";
    console.error("[WEBHOOK] Signature verification failed:", message);
    res.status(400).json({ error: message });
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    if (session.payment_status !== "paid") {
      res.status(200).json({ received: true });
      return;
    }

    const sessionId = session.id;
    const metadata = session.metadata;
    const userId = parseInt(metadata?.user_id ?? "");
    const plan = metadata?.plan ?? "";
    const tokens = parseInt(metadata?.tokens ?? "0");

    if (!userId || !tokens) {
      console.error("[WEBHOOK] Missing metadata in session:", sessionId);
      res.status(400).json({ error: "Invalid session metadata" });
      return;
    }

    try {
      const purchase = await prisma.purchase.findUnique({
        where: { stripeSessionId: sessionId },
      });

      if (!purchase) {
        console.error("[WEBHOOK] No purchase record found for session:", sessionId);
        res.status(200).json({ received: true }); // 200 to prevent Stripe retries for unknown sessions
        return;
      }

      if (purchase.status === "completed") {
        console.log("[WEBHOOK] Duplicate event, already fulfilled:", sessionId);
        res.status(200).json({ received: true });
        return;
      }

      await prisma.purchase.update({
        where: { stripeSessionId: sessionId },
        data: { status: "completed", fulfilledAt: new Date() },
      });

      await creditTokensForPurchase(userId, purchase.id, tokens, `purchase_${plan}`);

      console.log(
        `[WEBHOOK] Fulfilled ${tokens} tokens for user ${userId}, plan: ${plan}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[WEBHOOK] Failed to fulfill checkout session:", sessionId, message);
      res.status(500).json({ error: "Failed to fulfill purchase" });
      return;
    }
  }

  res.status(200).json({ received: true });
});

export default router;
