import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard, registerMainMenuItem, urlButton } from "../toolkit/index.js";
import { findOrder, now, orders, product, saveOrder, saveUser, type Order } from "../domain.js";

registerMainMenuItem({ label: "🔵 Купить галочку", data: "product:open:galochka", order: 10 });
const composer = new Composer<Ctx>();
const PAYMENT = "https://t.me/xrocket?start=inv_3k2GsQllb5yFzUh";

function detail(p: { id: string; price: number; currency: string }) {
  return inlineKeyboard([[inlineButton("Купить", `product:buy:${p.id}`)], [inlineButton("⬅️ Назад", "menu:main")]]);
}
async function notify(ctx: Ctx, order: Order) {
  const admin = adminChatId(ctx as never);
  if (!admin) return;
  try { await ctx.api.sendMessage(admin, `🛒 Новый заказ\nТовар: ${order.product_id}\nСумма: ${order.price} ${order.currency}`, { reply_markup: inlineKeyboard([[inlineButton("✅ Проверить оплату", `admin:order:verify:${order.id}`), inlineButton("❌ Отклонить", `admin:order:failed:${order.id}`)], [inlineButton("Завершить заказ", `admin:order:complete:${order.id}`)]]) }); } catch { /* admin delivery is best effort */ }
}

composer.callbackQuery("product:open:galochka", async (ctx) => {
  await ctx.answerCallbackQuery(); const p = await product(ctx, "galochka");
  if (!p || !p.active) { await ctx.reply("Этот товар сейчас недоступен. Попробуйте позже."); return; }
  await ctx.reply(`Выберите вариант покупки: ${p.name} — 1 шт.\n💰 Цена: ${p.price} ${p.currency}\n\n${p.description}`, { reply_markup: detail(p) });
});

composer.callbackQuery(/^product:buy:(galochka|premium-1m|premium-12m)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); const p = await product(ctx, ctx.callbackQuery.data.split(":")[2]);
  if (!p || !p.active) { await ctx.reply("Этот товар сейчас недоступен. Попробуйте позже."); return; }
  if (!/^https:\/\//i.test(p.payment_link)) { await ctx.reply("Ссылка на оплату пока недоступна. Мы уже проверяем её."); return; }
  const buyer = ctx.from?.id ?? ctx.chat?.id; if (!buyer) return;
  await saveUser(ctx);
  const old = (await orders(ctx, buyer)).find((o) => o.product_id === p.id && ["awaiting_payment", "awaiting_manual_verification", "verified"].includes(o.status));
  const order: Order = old ?? { id: `ord-${buyer}-${p.id}`, buyer_id: buyer, product_id: p.id, price: p.price, currency: p.currency, payment_link_snapshot: p.payment_link, status: "awaiting_payment", created_at: now(), updated_at: now(), admin_notes: [] };
  if (!old) { await saveOrder(ctx, order); await notify(ctx, order); }
  await ctx.reply(`Заказ создан. Нажмите «Оплатить», затем подтвердите оплату здесь.`, { reply_markup: inlineKeyboard([[urlButton("💳 Оплатить", order.payment_link_snapshot)], [inlineButton("✅ Я оплатил", `order:paid:${order.id}`)], [inlineButton("⬅️ Назад", "menu:main")]]) });
});

composer.callbackQuery(/^order:paid:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); const order = await findOrder(ctx, ctx.callbackQuery.data.slice("order:paid:".length));
  if (!order || order.buyer_id !== ctx.from?.id) { await ctx.reply("Не нашли этот заказ. Откройте каталог и попробуйте ещё раз."); return; }
  if (order.status === "awaiting_payment") { order.status = "awaiting_manual_verification"; order.updated_at = now(); await saveOrder(ctx, order); }
  await ctx.reply("✅ Оплата отправлена! Если оплата прошла успешно, дождитесь подтверждения заказа.");
});

export default composer;
