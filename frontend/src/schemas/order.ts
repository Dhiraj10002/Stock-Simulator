import { z } from "zod";

export const orderFormSchema = z
  .object({
    symbol: z.string().min(1, "Symbol is required"),
    side: z.enum(["BUY", "SELL"]),
    product: z.enum(["DELIVERY", "INTRADAY", "FNO"]),
    type: z.enum(["MARKET", "LIMIT", "SL", "SL-M"]),
    variety: z.enum(["REGULAR", "COVER", "BRACKET"]),
    quantity: z.number().int().positive("Quantity must be greater than 0"),
    price_rupees: z.number().nonnegative("Price cannot be negative").default(0),
    trigger_price_rupees: z.number().nonnegative("Trigger price cannot be negative").default(0),
    target_rupees: z.number().optional(),
    stop_loss_rupees: z.number().optional(),
    targetEnabled: z.boolean().default(false),
    stopLossEnabled: z.boolean().default(false),
    lotSize: z.number().int().positive().default(1),
  })
  .superRefine((data, ctx) => {
    // 1. LIMIT orders must have price > 0
    if ((data.type === "LIMIT" || data.type === "SL") && data.price_rupees <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["price_rupees"],
        message: "Limit price must be greater than ₹0.00",
      });
    }

    // 2. SL / SL-M orders must have trigger_price > 0
    if ((data.type === "SL" || data.type === "SL-M") && data.trigger_price_rupees <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trigger_price_rupees"],
        message: "Trigger price must be greater than ₹0.00",
      });
    }

    // 3. FNO lot size check
    if (data.product === "FNO" && data.lotSize > 1) {
      if (data.quantity % data.lotSize !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["quantity"],
          message: `Quantity must be a multiple of lot size (${data.lotSize})`,
        });
      }
    }
  });

export type OrderFormData = z.infer<typeof orderFormSchema>;
