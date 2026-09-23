import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { products } from "../domain.js";

registerMainMenuItem({ label: "💎 Купить Premium", data: "product:open:premium", order: 20 });
const composer = new Composer<Ctx>();
composer.callbackQuery("product:open:premium", async (ctx) => {
  await ctx.answerCallbackQuery();
  const premium = (await products(ctx)).filter((p) => p.id.startsWith("premium-"));
  await ctx.reply("Открыть страницу товара Premium (отдельные варианты — 1 мес/12 мес)", { reply_markup: inlineKeyboard([...premium.map((p) => [inlineButton(`${p.name} — ${p.price} ${p.currency}`, `product:buy:${p.id}`)]), [inlineButton("⬅️ Назад", "menu:main")]]) });
});
export default composer;
