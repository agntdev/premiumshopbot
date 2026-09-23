import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
registerMainMenuItem({ label: "ℹ️ Информация", data: "info:show", order: 40 });
const composer = new Composer<Ctx>();
composer.callbackQuery("info:show", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply("Покупка проходит по внешней ссылке. После оплаты дождитесь ручного подтверждения — мы пришлём инструкции по доставке. Возвраты и спорные платежи решаются через поддержку.", { reply_markup: inlineKeyboard([[inlineButton("⬅️ Назад", "menu:main")]]) }); });
export default composer;
