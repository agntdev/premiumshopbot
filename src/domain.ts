import type { Ctx } from "./bot.js";

export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  payment_link: string;
  delivery_instructions: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  admin_notes?: string[];
};

export type OrderStatus = "awaiting_payment" | "awaiting_manual_verification" | "verified" | "completed" | "failed";
export type Order = {
  id: string;
  buyer_id: number;
  product_id: string;
  price: number;
  currency: string;
  payment_link_snapshot: string;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
  paid_at?: string;
  admin_notes: string[];
};

export type Ticket = {
  id: string; user_id: number; order_id?: string; message: string;
  status: "open" | "waiting" | "closed";
  admin_responses: { message: string; at: string }[];
  created_at: string; updated_at: string;
};
export type User = {
  telegram_id: number; username?: string; display_name: string; role: "user" | "admin";
  registration_date: string; last_seen: string; banned?: boolean;
};

type Db = { prepare(sql: string): { bind(...args: unknown[]): { first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }>; run(): Promise<unknown> } } };
type EnvCtx = Ctx & { env?: { DB?: Db } & Record<string, unknown> };

let clock: () => Date = () => new Date();
export const now = (): string => clock().toISOString();
export function setNowForTests(next: (() => Date) | undefined): void { clock = next ?? (() => new Date()); }

async function ensureSchema(ctx: EnvCtx): Promise<void> {
  const db = ctx.env?.DB;
  if (!db) return;
  try {
    await db.prepare("CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, price REAL NOT NULL, currency TEXT NOT NULL, payment_link TEXT NOT NULL, delivery_instructions TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, admin_notes TEXT)").bind().run();
    await db.prepare("CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, buyer_id INTEGER NOT NULL, product_id TEXT NOT NULL, price REAL NOT NULL, currency TEXT NOT NULL, payment_link_snapshot TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, paid_at TEXT, admin_notes TEXT)").bind().run();
    await db.prepare("CREATE TABLE IF NOT EXISTS users (telegram_id INTEGER PRIMARY KEY, username TEXT, display_name TEXT NOT NULL, role TEXT NOT NULL, registration_date TEXT NOT NULL, last_seen TEXT NOT NULL, banned INTEGER NOT NULL DEFAULT 0)").bind().run();
    await db.prepare("CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, order_id TEXT, message TEXT NOT NULL, status TEXT NOT NULL, admin_responses TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)").bind().run();
  } catch { /* A delayed migration must not take the bot offline. */ }
}

const seed: Product[] = [
  { id: "galochka", name: "🔵 Галочка", description: "Подтверждение профиля и заметный статус.", price: 1990, currency: "₽", payment_link: "https://t.me/xrocket?start=inv_3k2GsQllb5yFzUh", delivery_instructions: "После завершения заказа мы пришлём инструкции по доставке.", active: true, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
  { id: "premium-1m", name: "💎 Premium на 1 месяц", description: "Premium-доступ на один месяц.", price: 990, currency: "₽", payment_link: "https://t.me/xrocket?start=inv_3k2GsQllb5yFzUh", delivery_instructions: "После завершения заказа мы пришлём инструкции по доставке.", active: true, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
  { id: "premium-12m", name: "💎 Premium на 12 месяцев", description: "Premium-доступ на год.", price: 7990, currency: "₽", payment_link: "https://t.me/xrocket?start=inv_3k2GsQllb5yFzUh", delivery_instructions: "После завершения заказа мы пришлём инструкции по доставке.", active: true, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
];

function bag(ctx: Ctx) { return ctx.session.testData ??= {}; }
async function query<T>(ctx: EnvCtx, sql: string, ...args: unknown[]): Promise<T[]> {
  await ensureSchema(ctx); if (!ctx.env?.DB) return [];
  try { return (await ctx.env.DB.prepare(sql).bind(...args).all<T>()).results; } catch { return []; }
}
async function run(ctx: EnvCtx, sql: string, ...args: unknown[]): Promise<void> {
  await ensureSchema(ctx); if (ctx.env?.DB) { try { await ctx.env.DB.prepare(sql).bind(...args).run(); } catch { /* keep the user flow alive */ } }
}
function parseJson<T>(value: unknown, fallback: T): T { if (typeof value !== "string") return (value as T) ?? fallback; try { return JSON.parse(value) as T; } catch { return fallback; } }

export async function products(ctx: Ctx): Promise<Product[]> {
  const rows = await query<Product>(ctx as EnvCtx, "SELECT * FROM products ORDER BY id");
  if (rows.length) return rows.map((p) => ({ ...p, active: Boolean(p.active), admin_notes: parseJson(p.admin_notes, []) }));
  return ((bag(ctx).products as Product[] | undefined) ?? seed).filter((p) => p.active);
}
export async function product(ctx: Ctx, id: string): Promise<Product | undefined> { return (await products(ctx)).find((p) => p.id === id); }
export async function saveProduct(ctx: Ctx, p: Product): Promise<void> {
  await run(ctx as EnvCtx, "INSERT OR REPLACE INTO products (id,name,description,price,currency,payment_link,delivery_instructions,created_at,updated_at,active,admin_notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)", p.id, p.name, p.description, p.price, p.currency, p.payment_link, p.delivery_instructions, p.created_at, p.updated_at, p.active ? 1 : 0, JSON.stringify(p.admin_notes ?? []));
  const current = (bag(ctx).products as Product[] | undefined) ?? seed;
  bag(ctx).products = [...current.filter((x) => x.id !== p.id), p];
}
export async function orders(ctx: Ctx, buyer?: number): Promise<Order[]> {
  const rows = await query<Order>(ctx as EnvCtx, buyer === undefined ? "SELECT * FROM orders ORDER BY created_at DESC" : "SELECT * FROM orders WHERE buyer_id = ? ORDER BY created_at DESC", ...(buyer === undefined ? [] : [buyer]));
  if (rows.length) return rows.map((o) => ({ ...o, admin_notes: parseJson(o.admin_notes, []) }));
  const list = (bag(ctx).orders as Order[] | undefined) ?? [];
  return buyer === undefined ? list : list.filter((o) => o.buyer_id === buyer);
}
export async function saveOrder(ctx: Ctx, order: Order): Promise<void> {
  await run(ctx as EnvCtx, "INSERT OR REPLACE INTO orders (id,buyer_id,product_id,price,currency,payment_link_snapshot,status,created_at,updated_at,paid_at,admin_notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)", order.id, order.buyer_id, order.product_id, order.price, order.currency, order.payment_link_snapshot, order.status, order.created_at, order.updated_at, order.paid_at ?? null, JSON.stringify(order.admin_notes));
  const list = (bag(ctx).orders as Order[] | undefined) ?? []; bag(ctx).orders = [...list.filter((x) => x.id !== order.id), order];
}
export async function findOrder(ctx: Ctx, id: string): Promise<Order | undefined> { return (await orders(ctx)).find((o) => o.id === id); }
export async function saveUser(ctx: Ctx): Promise<void> {
  if (!ctx.from) return; const old = (await users(ctx)).find((u) => u.telegram_id === ctx.from!.id); const stamp = now();
  const u: User = { telegram_id: ctx.from.id, username: ctx.from.username, display_name: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") || "Покупатель", role: old?.role ?? "user", registration_date: old?.registration_date ?? stamp, last_seen: stamp, banned: old?.banned };
  await run(ctx as EnvCtx, "INSERT OR REPLACE INTO users (telegram_id,username,display_name,role,registration_date,last_seen,banned) VALUES (?,?,?,?,?,?,?)", u.telegram_id, u.username ?? null, u.display_name, u.role, u.registration_date, u.last_seen, u.banned ? 1 : 0);
  const list = (bag(ctx).users as User[] | undefined) ?? []; bag(ctx).users = [...list.filter((x) => x.telegram_id !== u.telegram_id), u];
}
export async function users(ctx: Ctx): Promise<User[]> { const rows = await query<User>(ctx as EnvCtx, "SELECT * FROM users ORDER BY last_seen DESC"); return rows.length ? rows.map((u) => ({ ...u, banned: Boolean(u.banned) })) : ((bag(ctx).users as User[] | undefined) ?? []); }
export async function tickets(ctx: Ctx, user?: number): Promise<Ticket[]> {
  const rows = await query<Ticket>(ctx as EnvCtx, user === undefined ? "SELECT * FROM tickets ORDER BY created_at DESC" : "SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC", ...(user === undefined ? [] : [user]));
  if (rows.length) return rows.map((t) => ({ ...t, admin_responses: parseJson(t.admin_responses, []) })); const list = (bag(ctx).tickets as Ticket[] | undefined) ?? [];
  return user === undefined ? list : list.filter((t) => t.user_id === user);
}
export async function saveTicket(ctx: Ctx, t: Ticket): Promise<void> { await run(ctx as EnvCtx, "INSERT OR REPLACE INTO tickets (id,user_id,order_id,message,status,admin_responses,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)", t.id, t.user_id, t.order_id ?? null, t.message, t.status, JSON.stringify(t.admin_responses), t.created_at, t.updated_at); const list = (bag(ctx).tickets as Ticket[] | undefined) ?? []; bag(ctx).tickets = [...list.filter((x) => x.id !== t.id), t]; }
export async function findTicket(ctx: Ctx, id: string): Promise<Ticket | undefined> { return (await tickets(ctx)).find((t) => t.id === id); }
