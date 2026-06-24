import { prisma } from "../config/db.js";
import { TOKEN_COSTS, SIGNUP_BONUS, type AiAction } from "../config/tokens.js";

export async function initializeTokenBalance(userId: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const balance = await tx.tokenBalance.create({
      data: { userId, balance: SIGNUP_BONUS },
    });
    await tx.tokenTransaction.create({
      data: {
        userId,
        type: "credit",
        amount: SIGNUP_BONUS,
        action: "signup_bonus",
        balanceAfter: balance.balance,
      },
    });
  });
}

export async function getBalance(userId: number): Promise<number> {
  const record = await prisma.tokenBalance.findUnique({ where: { userId } });
  return record?.balance ?? 0;
}

export async function deductTokens(
  userId: number,
  action: AiAction
): Promise<{ newBalance: number }> {
  const cost = TOKEN_COSTS[action];

  return prisma.$transaction(async (tx) => {
    const records = await tx.$queryRaw<Array<{ balance: number }>>`
      SELECT balance FROM token_balance
      WHERE user_id = ${userId}
      FOR UPDATE
    `;

    if (!records.length) throw new Error("Token balance not found");
    const current = records[0].balance;

    if (current < cost) {
      const err = new Error("Insufficient tokens");
      (err as NodeJS.ErrnoException).code = "INSUFFICIENT_TOKENS";
      throw err;
    }

    const newBalance = current - cost;

    await tx.tokenBalance.update({
      where: { userId },
      data: { balance: newBalance },
    });

    await tx.tokenTransaction.create({
      data: {
        userId,
        type: "debit",
        amount: cost,
        action,
        balanceAfter: newBalance,
      },
    });

    return { newBalance };
  });
}

export async function creditTokensForPurchase(
  userId: number,
  purchaseId: string,
  tokens: number,
  action: string
): Promise<{ newBalance: number }> {
  return prisma.$transaction(async (tx) => {
    const record = await tx.tokenBalance.upsert({
      where: { userId },
      update: { balance: { increment: tokens } },
      create: { userId, balance: tokens },
    });

    await tx.tokenTransaction.create({
      data: {
        userId,
        type: "credit",
        amount: tokens,
        action,
        purchaseId,
        balanceAfter: record.balance,
      },
    });

    return { newBalance: record.balance };
  });
}
