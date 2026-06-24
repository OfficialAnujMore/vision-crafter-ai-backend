import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { stripe } from "../config/stripe.js";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { PLANS, type PlanKey } from "../config/tokens.js";

const router = Router();

router.use(requireAuth);

// GET /api/payments/balance
router.get("/balance", async (req: Request, res: Response) => {
  const userId = parseInt(req.user!.sub as string);

  const [balance, transactions] = await Promise.all([
    prisma.tokenBalance.findUnique({ where: { userId } }),
    prisma.tokenTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  res.json({
    success: true,
    message: "Token balance retrieved",
    data: {
      balance: balance?.balance ?? 0,
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        action: t.action,
        balance_after: t.balanceAfter,
        created_at: t.createdAt.toISOString(),
      })),
    },
  });
});

// GET /api/payments/purchases
router.get("/purchases", async (req: Request, res: Response) => {
  const userId = parseInt(req.user!.sub as string);

  const purchases = await prisma.purchase.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    success: true,
    message: "Purchases retrieved",
    data: {
      purchases: purchases.map((p) => ({
        id: p.id,
        amount_cents: p.amountCents,
        tokens_granted: p.tokensGranted,
        status: p.status,
        created_at: p.createdAt.toISOString(),
        fulfilled_at: p.fulfilledAt?.toISOString() ?? null,
      })),
    },
  });
});

// POST /api/payments/checkout
router.post("/checkout", async (req: Request, res: Response) => {
  const userId = parseInt(req.user!.sub as string);
  const { plan } = req.body as { plan: PlanKey };

  if (!plan || !PLANS[plan]) {
    res.status(400).json({
      success: false,
      message: "Invalid plan. Must be 'creator' or 'pro'.",
      statusCode: 400,
    });
    return;
  }

  const planConfig = PLANS[plan];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: planConfig.amountCents,
          product_data: {
            name: `${planConfig.label} Pack — ${planConfig.tokens} Tokens`,
            description: `One-time purchase of ${planConfig.tokens} AI tokens for VisionCrafter AI`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      user_id: String(userId),
      plan,
      tokens: String(planConfig.tokens),
    },
    success_url: `${env.FRONTEND_URL}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.FRONTEND_URL}/dashboard?payment=cancelled`,
    ...(user?.email ? { customer_email: user.email } : {}),
  });

  await prisma.purchase.create({
    data: {
      userId,
      stripeSessionId: session.id,
      stripePriceId: plan,
      amountCents: planConfig.amountCents,
      tokensGranted: planConfig.tokens,
      status: "pending",
    },
  });

  res.json({
    success: true,
    message: "Checkout session created",
    data: { checkout_url: session.url },
  });
});

export default router;
