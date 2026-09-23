import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { now, saveTicket, tickets, type Ticket } from "../domain.js";

registerMainMenuItem({ label: "🆘 Поддержка", data: "support:list", order: 50 });
const composer = new Composer<Ctx>();

composer.callbackQuery("support:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  const list = ctx.from ? await tickets(ctx, ctx.from.id) : [];
  await ctx.reply(list.length ? "Ваши обращения:\n" + list.slice(0, 10).map((t) => `${t.status === "closed" ? "✅" : "🟡"} Обращение ${t.id}`).join("\n") : "Обращений пока нет — опишите вопрос, и мы поможем.", { reply_markup: inlineKeyboard([[inlineButton("➕ Новое обращение", "support:create")], [inlineButton("⬅️ Назад", "menu:main")]]) });
});

composer.callbackQuery(/^support:create(?::order:(.+))?$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "ticket_message";
  ctx.session.pendingTicketId = ctx.callbackQuery.data.split(":").length > 3 ? ctx.callbackQuery.data.split(":")[3] : undefined;
  await ctx.reply("Опишите вопрос одним сообщением — ответим здесь.", { reply_markup: { force_reply: true, input_field_placeholder: "Ваш вопрос" } });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "ticket_message") return next();
  const message = ctx.message.text.trim();
  if (message.length < 3) { await ctx.reply("Напишите чуть подробнее — так мы быстрее поможем.", { reply_markup: { force_reply: true, input_field_placeholder: "Ваш вопрос" } }); return; }
  const userId = ctx.from?.id ?? ctx.chat.id;
  const id = `ticket-${userId}-${now().replace(/\D/g, "").slice(-12)}`;
  const ticket: Ticket = { id, user_id: userId, order_id: ctx.session.pendingTicketId, message, status: "open", admin_responses: [], created_at: now(), updated_at: now() };
  await saveTicket(ctx, ticket);
  const admin = adminChatId(ctx as never);
  if (admin) { try { await ctx.api.sendMessage(admin, `🆘 Новое обращение\n${message}`, { reply_markup: inlineKeyboard([[inlineButton("Ответить", `admin:ticket:${id}:reply`), inlineButton("Закрыть", `admin:ticket:${id}:close`)]]) }); } catch { /* admin delivery is best effort */ } }
  ctx.session.step = "idle"; ctx.session.pendingTicketId = undefined;
  await ctx.reply("Обращение создано. Мы ответим вам здесь.", { reply_markup: inlineKeyboard([[inlineButton("К обращениям", "support:list")]]) });
});

export default composer;
