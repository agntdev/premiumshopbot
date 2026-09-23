import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { products } from "../domain.js";

registerMainMenuItem({ label: "💎 Купить Premium", data: "product:open:premium", order: 20 });
const composer = new Composer<Ctx>();
composer.callbackQuery("product:open:premium", async (ctx) => {
  await ctx.answerCallbackQuery(); const list = (await products(ctx)).filter((p) => p.id.startsWith("premium-") && p.active);
  await ctx.reply(list.length ? "Выберите срок Premium:" : "Premium пока недоступен. Попробуйте позже.", { reply_markup: inlineKeyboard([...list.map((p) => [inlineButton(`${p.name} · ${p.price} ${p.currency}`, `product:buy:${p.id}`)]), [inlineButton("⬅️ Назад", "menu:main")]]) });
});
export default composer;
