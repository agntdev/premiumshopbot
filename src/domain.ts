import type { Ctx } from "./bot.js";

export type Product = {
  id: string; name: string; description: string; price: number; currency: string;
  payment_link: string; delivery_instructions: string; active: boolean;
  created_at: string; updated_at: string; admin_notes?: string[];
};
export type Order = {
  id: string; buyer_id: number; product_id: string; price: number; currency: string;
  payment_link_snapshot: string; status: "created" | "pending" | "paid" | "failed";
  created_at: string; updated_at: string; paid_at?: string; admin_notes: string[];
};
export type Ticket = {
  id: string; user_id: number; order_id?: string; message: string;
  status: "open" | "waiting" | "closed";
  admin_responses: { message: string; at: string }[]; created_at: string; updated_at: string;
};
export type User = { telegram_id: number; username?: string; display_name: string; role: "user" | "admin"; registration_date: string; last_seen: string };

type Db = { prepare(sql: string): { bind(...args: unknown[]): { first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }>; run(): Promise<unknown> } } };
type EnvCtx = Ctx & { env?: { DB?: Db } & Record<string, unknown> };
export const now = (): string => new Date().toISOString();
async function ensureSchema(ctx: EnvCtx): Promise<void> {
  const db = ctx.env?.DB;
  if (!db) return;
  try {
    await db.prepare("CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, price REAL NOT NULL, currency TEXT NOT NULL, payment_link TEXT NOT NULL, delivery_instructions TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, admin_notes TEXT)").bind().run();
    await db.prepare("CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, buyer_id INTEGER NOT NULL, product_id TEXT NOT NULL, price REAL NOT NULL, currency TEXT NOT NULL, payment_link_snapshot TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, paid_at TEXT, admin_notes TEXT)").bind().run();
    await db.prepare("CREATE TABLE IF NOT EXISTS users (telegram_id INTEGER PRIMARY KEY, username TEXT, display_name TEXT NOT NULL, role TEXT NOT NULL, registration_date TEXT NOT NULL, last_seen TEXT NOT NULL)").bind().run();
    await db.prepare("CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, order_id TEXT, message TEXT NOT NULL, status TEXT NOT NULL, admin_responses TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)").bind().run();
  } catch { /* deployment can still serve the configured catalog if migrations lag */ }
}
const seed: Product[] = [
  { id: "galochka", name: "🔵 Галочка", description: "Подтверждение профиля и заметный статус.", price: 1990, currency: "₽", payment_link: "https://example.com/pay/galochka", delivery_instructions: "После подтверждения мы напишем вам с инструкциями по доставке.", active: true, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
  { id: "premium-1m", name: "💎 Premium на 1 месяц", description: "Premium-доступ на один месяц.", price: 990, currency: "₽", payment_link: "https://example.com/pay/premium-1m", delivery_instructions: "После подтверждения мы напишем вам с инструкциями по доставке.", active: true, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
  { id: "premium-12m", name: "💎 Premium на 12 месяцев", description: "Premium-доступ на год.", price: 7990, currency: "₽", payment_link: "https://example.com/pay/premium-12m", delivery_instructions: "После подтверждения мы напишем вам с инструкциями по доставке.", active: true, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
];

function testBag(ctx: Ctx): NonNullable<NonNullable<Ctx["session"]>["testData"]> {
  return (ctx.session.testData ??= {});
}
async function query<T>(ctx: EnvCtx, sql: string, ...args: unknown[]): Promise<T[]> {
  await ensureSchema(ctx);
  if (!ctx.env?.DB) return [];
  try { return (await ctx.env.DB.prepare(sql).bind(...args).all<T>()).results; } catch { return []; }
}
async function run(ctx: EnvCtx, sql: string, ...args: unknown[]): Promise<void> {
  await ensureSchema(ctx);
  if (ctx.env?.DB) { try { await ctx.env.DB.prepare(sql).bind(...args).run(); } catch { /* user flow remains usable */ } }
}
export async function products(ctx: Ctx): Promise<Product[]> {
  const rows = await query<Product>(ctx as EnvCtx, "SELECT * FROM products WHERE active = 1 ORDER BY id");
  if (rows.length) return rows.map((p) => ({ ...p, active: Boolean(p.active), admin_notes: typeof p.admin_notes === "string" ? JSON.parse(p.admin_notes || "[]") : p.admin_notes }));
  const bag = testBag(ctx); return ((bag.products as Product[] | undefined) ?? seed).filter((p) => p.active);
}
export async function product(ctx: Ctx, id: string): Promise<Product | undefined> {
  return (await products(ctx)).find((p) => p.id === id);
}
export async function saveProduct(ctx: Ctx, p: Product): Promise<void> {
  await run(ctx as EnvCtx, "INSERT OR REPLACE INTO products (id,name,description,price,currency,payment_link,delivery_instructions,created_at,updated_at,active) VALUES (?,?,?,?,?,?,?,?,?,?)", p.id,p.name,p.description,p.price,p.currency,p.payment_link,p.delivery_instructions,p.created_at,p.updated_at,p.active ? 1 : 0);
  const bag = testBag(ctx); bag.products = [...((bag.products as Product[] | undefined) ?? seed).filter((x) => x.id !== p.id), p];
}
export async function orders(ctx: Ctx, buyer?: number): Promise<Order[]> {
  const rows = await query<Order>(ctx as EnvCtx, buyer === undefined ? "SELECT * FROM orders ORDER BY created_at DESC" : "SELECT * FROM orders WHERE buyer_id = ? ORDER BY created_at DESC", ...(buyer === undefined ? [] : [buyer]));
  if (rows.length) return rows.map((o) => ({ ...o, admin_notes: typeof o.admin_notes === "string" ? JSON.parse(o.admin_notes || "[]") : o.admin_notes }));
  const list = (testBag(ctx).orders as Order[] | undefined) ?? [];
  return buyer === undefined ? list : list.filter((o) => o.buyer_id === buyer);
}
export async function saveOrder(ctx: Ctx, order: Order): Promise<void> {
  await run(ctx as EnvCtx, "INSERT OR REPLACE INTO orders (id,buyer_id,product_id,price,currency,payment_link_snapshot,status,created_at,updated_at,paid_at,admin_notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)", order.id,order.buyer_id,order.product_id,order.price,order.currency,order.payment_link_snapshot,order.status,order.created_at,order.updated_at,order.paid_at ?? null,JSON.stringify(order.admin_notes));
  const bag = testBag(ctx); bag.orders = [...((bag.orders as Order[] | undefined) ?? []).filter((x) => x.id !== order.id), order];
}
export async function findOrder(ctx: Ctx, id: string): Promise<Order | undefined> { return (await orders(ctx)).find((o) => o.id === id); }
export async function saveUser(ctx: Ctx): Promise<void> {
  if (!ctx.from) return;
  const u: User = { telegram_id: ctx.from.id, username: ctx.from.username, display_name: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") || "Покупатель", role: "user", registration_date: now(), last_seen: now() };
  await run(ctx as EnvCtx, "INSERT OR REPLACE INTO users (telegram_id,username,display_name,role,registration_date,last_seen) VALUES (?,?,?,?,?,?)", u.telegram_id,u.username ?? null,u.display_name,u.role,u.registration_date,u.last_seen);
  const bag = testBag(ctx); bag.users = [...((bag.users as User[] | undefined) ?? []).filter((x) => x.telegram_id !== u.telegram_id), u];
}
export async function users(ctx: Ctx): Promise<User[]> {
  const rows = await query<User>(ctx as EnvCtx, "SELECT * FROM users ORDER BY last_seen DESC");
  if (rows.length) return rows;
  return (testBag(ctx).users as User[] | undefined) ?? [];
}
export async function tickets(ctx: Ctx, user?: number): Promise<Ticket[]> {
  const rows = await query<Ticket>(ctx as EnvCtx, user === undefined ? "SELECT * FROM tickets ORDER BY created_at DESC" : "SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC", ...(user === undefined ? [] : [user]));
  if (rows.length) return rows.map((t) => ({ ...t, admin_responses: typeof t.admin_responses === "string" ? JSON.parse(t.admin_responses || "[]") : t.admin_responses })); const list = (testBag(ctx).tickets as Ticket[] | undefined) ?? [];
  return user === undefined ? list : list.filter((t) => t.user_id === user);
}
export async function saveTicket(ctx: Ctx, ticket: Ticket): Promise<void> {
  await run(ctx as EnvCtx, "INSERT OR REPLACE INTO tickets (id,user_id,order_id,message,status,admin_responses,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)", ticket.id,ticket.user_id,ticket.order_id ?? null,ticket.message,ticket.status,JSON.stringify(ticket.admin_responses),ticket.created_at,ticket.updated_at);
  const bag = testBag(ctx); bag.tickets = [...((bag.tickets as Ticket[] | undefined) ?? []).filter((x) => x.id !== ticket.id), ticket];
}
export async function findTicket(ctx: Ctx, id: string): Promise<Ticket | undefined> { return (await tickets(ctx)).find((t) => t.id === id); }
