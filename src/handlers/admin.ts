import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard, isOwner, registerMainMenuItem, requireOwner } from "../toolkit/index.js";
import { findOrder, findTicket, now, orders, products, saveOrder, saveProduct, saveTicket, tickets, users, type Product } from "../domain.js";

registerMainMenuItem({ label: "⚙️ Управление", data: "admin:open", order: 90 });
const composer = new Composer<Ctx>();
const adminMenu = inlineKeyboard([[inlineButton("Заказы", "admin:orders")], [inlineButton("Товары и цены", "admin:products")], [inlineButton("Поддержка", "admin:tickets")], [inlineButton("Рассылка", "admin:broadcast")], [inlineButton("Статистика", "admin:stats")], [inlineButton("⬅️ Назад", "menu:main")]]);
const gate = (ctx: Ctx) => requireOwner(ctx as never);

composer.callbackQuery("admin:open", async (ctx) => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; await ctx.reply("Панель управления", { reply_markup: adminMenu }); });
composer.callbackQuery("admin:orders", async (ctx) => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; const list = await orders(ctx); await ctx.reply(list.length ? "Заказы:\n" + list.slice(0, 10).map((o) => `${o.id} — ${o.status} — ${o.price} ${o.currency}`).join("\n") : "Заказов пока нет.", { reply_markup: inlineKeyboard([[inlineButton("⬅️ В панель", "admin:open")]]) }); });
composer.callbackQuery("admin:products", async (ctx) => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; const list = await products(ctx); await ctx.reply(list.length ? "Товары:\n" + list.slice(0, 10).map((p) => `${p.name} — ${p.price} ${p.currency}`).join("\n") : "Товаров пока нет.", { reply_markup: inlineKeyboard([...list.slice(0, 10).map((p) => [inlineButton(`Изменить ${p.id}`, `admin:product:edit:${p.id}`), inlineButton("Удалить", `admin:product:delete:${p.id}`)]), [inlineButton("➕ Создать товар", "admin:product:new")], [inlineButton("⬅️ В панель", "admin:open")]]) }); });
composer.callbackQuery("admin:stats", async (ctx) => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; const list = await orders(ctx); const paid = list.filter((o) => o.status === "paid"); await ctx.reply(`Статистика\nЗаказов: ${list.length}\nОплачено: ${paid.length}\nВыручка: ${paid.reduce((s, o) => s + o.price, 0)}`, { reply_markup: inlineKeyboard([[inlineButton("⬅️ В панель", "admin:open")]]) }); });
composer.callbackQuery("admin:tickets", async (ctx) => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; const list = await tickets(ctx); await ctx.reply(list.length ? "Обращения:\n" + list.slice(0, 10).map((t) => `${t.id} — ${t.status}`).join("\n") : "Новых обращений нет.", { reply_markup: inlineKeyboard([...list.slice(0, 10).map((t) => [inlineButton("Ответить", `admin:ticket:${t.id}:reply`), inlineButton("Закрыть", `admin:ticket:${t.id}:close`)]), [inlineButton("⬅️ В панель", "admin:open")]]) }); });

composer.callbackQuery(/^admin:product:(new|edit):?(.*)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; const [, action, id] = ctx.callbackQuery.data.split(":"); ctx.session.step = "admin_product_form"; ctx.session.pendingProductEditId = action === "edit" ? id : undefined; await ctx.reply("Отправьте: название | описание | цена | валюта | доставка | ссылка на оплату", { reply_markup: { force_reply: true, input_field_placeholder: "Поля товара через |" } }); });
composer.callbackQuery(/^admin:product:delete:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; const id = ctx.callbackQuery.data.split(":")[3]; const p = (await products(ctx)).find((x) => x.id === id); if (!p) { await ctx.reply("Товар не найден."); return; } p.active = false; p.updated_at = now(); p.admin_notes = [...(p.admin_notes ?? []), `deleted ${now()}`]; await saveProduct(ctx, p); await ctx.reply("Товар удалён.", { reply_markup: inlineKeyboard([[inlineButton("К товарам", "admin:products")]]) }); });

composer.callbackQuery(/^admin:order:(paid|failed):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return;
  const [, status, id] = ctx.callbackQuery.data.split(":"); const order = await findOrder(ctx, id);
  if (!order) { await ctx.reply("Не нашли этот заказ."); return; }
  if (order.status !== "pending") { await ctx.reply("По этому заказу уже есть решение."); return; }
  order.status = status as "paid" | "failed"; order.updated_at = now(); if (status === "paid") order.paid_at = now(); order.admin_notes.push(`${status} ${now()}`); await saveOrder(ctx, order);
  try { await ctx.api.sendMessage(order.buyer_id, status === "paid" ? "✅ Оплата подтверждена! Мы скоро пришлём инструкции по доставке." : "Оплату не удалось подтвердить. Проверьте данные и напишите в поддержку."); } catch { /* buyer may have blocked the bot */ }
  await ctx.reply(status === "paid" ? "Заказ отмечен как оплаченный." : "Заказ отклонён.");
});

composer.callbackQuery(/^admin:ticket:(.+):reply$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; const id = ctx.callbackQuery.data.split(":")[2]; if (!(await findTicket(ctx, id))) { await ctx.reply("Не нашли это обращение."); return; } ctx.session.pendingTicketId = id; ctx.session.step = "admin_ticket_reply"; await ctx.reply("Напишите ответ пользователю.", { reply_markup: { force_reply: true, input_field_placeholder: "Ответ пользователю" } }); });

composer.callbackQuery("admin:broadcast", async (ctx) => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; ctx.session.step = "broadcast_message"; await ctx.reply("Отправьте текст рассылки для предварительного просмотра.", { reply_markup: { force_reply: true, input_field_placeholder: "Текст рассылки" } }); });
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step === "admin_product_form") {
    if (!(await gate(ctx))) return;
    const fields = ctx.message.text.split("|").map((x) => x.trim());
    if (fields.length !== 6 || !Number.isFinite(Number(fields[2])) || !/^https:\/\//i.test(fields[5])) { await ctx.reply("Проверьте формат: 6 полей через |, цена числом, ссылка начинается с https://."); return; }
    const id = ctx.session.pendingProductEditId ?? `product-${now().replace(/\D/g, "").slice(-12)}`;
    const old = (await products(ctx)).find((p) => p.id === id); const stamp = now();
    const p: Product = { id, name: fields[0], description: fields[1], price: Number(fields[2]), currency: fields[3], delivery_instructions: fields[4], payment_link: fields[5], active: true, created_at: old?.created_at ?? stamp, updated_at: stamp, admin_notes: [...(old?.admin_notes ?? []), `${old ? "updated" : "created"} ${stamp}`] };
    await saveProduct(ctx, p); ctx.session.step = "idle"; ctx.session.pendingProductEditId = undefined; await ctx.reply("Товар сохранён.", { reply_markup: inlineKeyboard([[inlineButton("К товарам", "admin:products")]]) }); return;
  }
  if (ctx.session.step === "admin_ticket_reply") {
    if (!(await gate(ctx))) return; const id = ctx.session.pendingTicketId; const ticket = id ? await findTicket(ctx, id) : undefined;
    if (!ticket) { await ctx.reply("Не нашли это обращение."); return; }
    ticket.admin_responses.push({ message: ctx.message.text, at: now() }); ticket.status = "waiting"; ticket.updated_at = now(); await saveTicket(ctx, ticket); try { await ctx.api.sendMessage(ticket.user_id, `Ответ поддержки:\n${ctx.message.text}`); } catch { /* blocked user */ }
    ctx.session.step = "idle"; ctx.session.pendingTicketId = undefined; await ctx.reply("Ответ отправлен."); return;
  }
  if (ctx.session.step !== "broadcast_message" && ctx.session.step !== "broadcast_confirm") return next();
  if (ctx.session.step === "broadcast_message") { ctx.session.pendingBroadcast = ctx.message.text; ctx.session.step = "broadcast_confirm"; await ctx.reply(`Предпросмотр:\n\n${ctx.message.text}`, { reply_markup: inlineKeyboard([[inlineButton("✅ Отправить", "admin:broadcast:send")], [inlineButton("Отмена", "admin:open")]]) }); return; }
  return next();
});
composer.callbackQuery("admin:broadcast:send", async (ctx) => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; const text = ctx.session.pendingBroadcast; if (!text) { await ctx.reply("Текст рассылки не найден. Создайте её заново."); return; } const list = await users(ctx); let sent = 0; for (const user of list) { try { await ctx.api.sendMessage(user.telegram_id, text); sent++; } catch { /* continue after blocked/deleted users */ } } ctx.session.step = "idle"; ctx.session.pendingBroadcast = undefined; await ctx.reply(`Рассылка завершена. Доставлено: ${sent}.`); });

composer.callbackQuery(/^admin:ticket:(.+):close$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; const ticket = await findTicket(ctx, ctx.callbackQuery.data.split(":")[2]); if (!ticket) { await ctx.reply("Не нашли это обращение."); return; } ticket.status = "closed"; ticket.updated_at = now(); await saveTicket(ctx, ticket); try { await ctx.api.sendMessage(ticket.user_id, "Обращение закрыто. Если понадобится помощь, создайте новое."); } catch { /* blocked user */ } await ctx.reply("Обращение закрыто."); });

export default composer;
