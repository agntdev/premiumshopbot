import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { findOrder, orders } from "../domain.js";

registerMainMenuItem({ label: "📦 Мои покупки", data: "orders:list", order: 30 });
const composer = new Composer<Ctx>();
async function showOrders(ctx: Ctx) {
  const list = ctx.from ? await orders(ctx, ctx.from.id) : [];
  if (!list.length) { await ctx.reply("📦 Мои покупки — you're in the right place. What would you like to do next?", { reply_markup: inlineKeyboard([[inlineButton("🛒 В каталог", "menu:main")]]) }); return; }
  const page = list.slice(0, 10);
  await ctx.reply("📦 Ваши покупки:\n" + page.map((o) => `${o.status === "paid" ? "✅" : o.status === "failed" ? "❌" : "🕐"} ${o.product_id} — ${o.price} ${o.currency}`).join("\n"), { reply_markup: inlineKeyboard(page.map((o) => [inlineButton(`Открыть ${o.product_id}`, `order:view:${o.id}`)]).concat([[inlineButton("🆘 Написать в поддержку", "support:list")], [inlineButton("⬅️ Назад", "menu:main")]])) });
}
composer.callbackQuery("orders:list", async (ctx) => { await ctx.answerCallbackQuery(); await showOrders(ctx); });
composer.callbackQuery(/^order:view:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const order = await findOrder(ctx, ctx.callbackQuery.data.slice("order:view:".length));
  if (!order || order.buyer_id !== ctx.from?.id) { await ctx.reply("Не нашли этот заказ."); return; }
  await ctx.reply(`Заказ ${order.product_id}\nСтатус: ${order.status === "pending" ? "ожидает подтверждения" : order.status === "paid" ? "оплачен" : "отклонён"}`, { reply_markup: inlineKeyboard([[inlineButton("🆘 Открыть обращение", `support:create:order:${order.id}`)], [inlineButton("⬅️ К покупкам", "orders:list")]]) });
});
export default composer;
