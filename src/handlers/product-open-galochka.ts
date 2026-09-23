import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard, registerMainMenuItem, urlButton } from "../toolkit/index.js";
import { findOrder, now, product, products, saveOrder, saveUser, type Order } from "../domain.js";

registerMainMenuItem({ label: "🔵 Купить галочку", data: "product:open:galochka", order: 10 });
const composer = new Composer<Ctx>();

function productKeyboard(id: string, link?: string) {
  return inlineKeyboard([[inlineButton("Купить", `product:buy:${id}`)], ...(link ? [[urlButton("💳 Оплатить", link)]] : []), [inlineButton("⬅️ Назад", "menu:main")]]);
}
async function notifyAdmin(ctx: Ctx, order: Order, title: string) {
  const admin = adminChatId(ctx as unknown as { env?: Record<string, unknown> });
  if (!admin) return;
  try {
    await ctx.api.sendMessage(
      admin,
      title + `\nТовар: ${order.product_id}\nСумма: ${order.price} ${order.currency}`,
      {
        reply_markup: inlineKeyboard([
          [
            inlineButton("✅ Подтвердить", `admin:order:paid:${order.id}`),
            inlineButton("❌ Отклонить", `admin:order:failed:${order.id}`),
          ],
          [inlineButton("Открыть чат", `admin:buyer:${order.buyer_id}`)],
        ]),
      },
    );
  } catch { /* an unavailable admin chat must not break checkout */ }
}
composer.callbackQuery("product:open:galochka", async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await product(ctx, "galochka");
  await ctx.reply("🔵 Купить галочку — you're in the right place. What would you like to do next?", { reply_markup: p ? productKeyboard(p.id) : inlineKeyboard([[inlineButton("⬅️ Назад", "menu:main")]]) });
});
composer.callbackQuery(/^product:buy:(galochka|premium-1m|premium-12m)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = ctx.callbackQuery.data.split(":")[2];
  const p = await product(ctx, id);
  if (!p || !p.active) { await ctx.reply("Этот товар сейчас недоступен. Попробуйте позже."); return; }
  if (!/^https:\/\//i.test(p.payment_link)) { await ctx.reply("Ссылка на оплату пока недоступна. Мы уже проверяем её."); return; }
  await saveUser(ctx);
  const previous = ctx.from ? (await findOrder(ctx, `${ctx.from.id}-${id}`)) : undefined;
  const order: Order = previous ?? { id: `${ctx.from?.id ?? ctx.chat?.id}-${id}`, buyer_id: ctx.from?.id ?? Number(ctx.chat?.id), product_id: id, price: p.price, currency: p.currency, payment_link_snapshot: p.payment_link, status: "pending", created_at: now(), updated_at: now(), admin_notes: [] };
  if (!previous) await saveOrder(ctx, order);
  await ctx.reply(`💳 ${p.name}\n${p.price} ${p.currency}\n\nПосле оплаты нажмите «Я оплатил».`, { reply_markup: inlineKeyboard([[urlButton("💳 Оплатить", p.payment_link), inlineButton("Я оплатил", `order:paid:${order.id}`)], [inlineButton("⬅️ Назад", `product:open:${id === "galochka" ? "galochka" : "premium"}`)]]) });
  if (!previous) await notifyAdmin(ctx, order, "🛒 Новый заказ");
});
composer.callbackQuery(/^order:paid:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const order = await findOrder(ctx, ctx.callbackQuery.data.slice("order:paid:".length));
  if (!order) { await ctx.reply("Не нашли этот заказ. Откройте каталог и попробуйте ещё раз."); return; }
  await ctx.reply("✅ Оплата отправлена! Если оплата прошла успешно, дождитесь подтверждения заказа.");
});

export default composer;
