import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { findOrder, orders } from "../domain.js";

registerMainMenuItem({ label: "📦 Мои покупки", data: "orders:list", order: 30 });
const composer = new Composer<Ctx>();
const label = (status: string) => ({ awaiting_payment: "ожидает оплаты", awaiting_manual_verification: "проверяем оплату", verified: "оплата подтверждена", completed: "завершён", failed: "отклонён" }[status] ?? status);
async function show(ctx: Ctx) {
  const list = ctx.from ? (await orders(ctx, ctx.from.id)).slice(0, 10) : [];
  if (!list.length) { await ctx.reply("Покупок пока нет — выберите товар в каталоге.", { reply_markup: inlineKeyboard([[inlineButton("🛒 В каталог", "menu:main")]]) }); return; }
  await ctx.reply("Ваши покупки:\n" + list.map((o) => `${o.product_id} · ${label(o.status)} · ${o.price} ${o.currency}`).join("\n"), { reply_markup: inlineKeyboard([...list.map((o) => [inlineButton(`Открыть ${o.product_id}`, `order:view:${o.id}`)]), [inlineButton("🆘 Поддержка", "support:list")], [inlineButton("⬅️ Назад", "menu:main")]]) });
}
composer.callbackQuery("orders:list", async (ctx) => { await ctx.answerCallbackQuery(); await show(ctx); });
composer.callbackQuery(/^order:view:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const o = await findOrder(ctx, ctx.callbackQuery.data.slice(11)); if (!o || o.buyer_id !== ctx.from?.id) { await ctx.reply("Не нашли этот заказ."); return; } await ctx.reply(`Заказ ${o.product_id}\nСтатус: ${label(o.status)}\nСумма: ${o.price} ${o.currency}`, { reply_markup: inlineKeyboard([[inlineButton("🆘 Открыть обращение", `support:create:order:${o.id}`)], [inlineButton("⬅️ К покупкам", "orders:list")]]) }); });
export default composer;
