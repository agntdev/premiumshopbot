import { Composer } from "grammy";

// SCAFFOLD — generated from the bot blueprint BEFORE the agent runs.
// Keep a LIVE registration (.command / .callbackQuery / …) so this feature is
// never an empty stub. Replace the reply body with real logic + copy; if you
// change the user-facing text, update tests/specs to match EXACTLY.
// Do NOT rewrite src/bot.ts — buildBot() already auto-loads this module.
// Menu: wire this into /start via registerMainMenuItem({ label: "🆘 Поддержка", data: "support:list" }) if the toolkit exposes it.

const composer = new Composer();

composer.callbackQuery("support:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("Создать новый тикет или просмотреть существующие обращения");
});

export default composer;
