import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { now, saveTicket, tickets, type Ticket } from "../domain.js";

registerMainMenuItem({ label: "🆘 Поддержка", data: "support:list", order: 40 });
const composer = new Composer<Ctx>();
async function showSupport(ctx: Ctx) {
  const list = ctx.from ? await tickets(ctx, ctx.from.id) : [];
  const body = list.length ? "Ваши обращения:\n" + list.slice(0, 10).map((t) => `${t.status === "closed" ? "✅" : "🟡"} ${t.id}`).join("\n") : "Создать новый тикет или просмотреть существующие обращения";
  await ctx.reply(body, { reply_markup: inlineKeyboard([[inlineButton("➕ Новое обращение", "support:create")], [inlineButton("⬅️ Назад", "menu:main")]]) });
}
composer.callbackQuery("support:list", async (ctx) => { await ctx.answerCallbackQuery(); await showSupport(ctx); });
composer.callbackQuery(/^support:create(?::order:(.+))?$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "ticket_message";
  ctx.session.pendingTicketId = ctx.callbackQuery.data.split(":").length > 3 ? ctx.callbackQuery.data.split(":")[3] : undefined;
  await ctx.reply("Опишите вопрос одним сообщением — мы ответим здесь.", { reply_markup: { force_reply: true, input_field_placeholder: "Ваш вопрос" } });
});
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "ticket_message") return next();
  const message = ctx.message.text.trim();
  if (message.length < 3) { await ctx.reply("Напишите чуть подробнее — так мы быстрее поможем.", { reply_markup: { force_reply: true, input_field_placeholder: "Ваш вопрос" } }); return; }
  const ticket: Ticket = { id: `ticket-${ctx.from?.id ?? ctx.chat.id}-${now().replace(/\D/g, "").slice(-12)}`, user_id: ctx.from?.id ?? ctx.chat.id, order_id: ctx.session.pendingTicketId, message, status: "open", admin_responses: [], created_at: now(), updated_at: now() };
  await saveTicket(ctx, ticket); ctx.session.step = "idle"; ctx.session.pendingTicketId = undefined;
  await ctx.reply("Обращение создано. Мы ответим вам здесь.", { reply_markup: inlineKeyboard([[inlineButton("К моим обращениям", "support:list")]]) });
});
export default composer;
