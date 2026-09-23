# Продажа галочек и Premium — Bot specification

**Archetype:** commerce

**Voice:** лаконичный и современный — write every user-facing message, button label, error, and empty state in this voice.

Телеграм‑бот для продажи «галочек» и цифровых услуг: каталог товаров с внешними ссылками оплаты, создание заказа после нажатия оплачиваю, ручная верификация платежей админом, отслеживание заказов и система поддержки — всё на русском языке с лаконичным интерфейсом и inline‑кнопками.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Русскоязычные покупатели цифровых услуг (галочки, подписки, подарочные коды)
- Операторы/владельцы сервиса, которые управляют товарами, заказами и поддержкой

## Success criteria

- Покупатель может пройти от меню к созданию заказа и открытия внешней ссылки на оплату; созданный заказ сохраняется в БД со статусом pending
- Админ получает уведомление о новом заказе в ADMIN_CHAT_ID и может пометить заказ как paid/failed
- После пометки paid покупатель получает подтверждение и инструкции по доставке
- Пользователь может создать и отслеживать тикет поддержки; админ может отвечать и закрывать тикеты
- Админ может CRUD-управлять товарами и редактировать статические ссылки оплаты

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Открыть главное меню (каталог, мои покупки, помощь, поддержка)
  - outputs: main_menu (inline keyboard)
- **🔵 Купить галочку** (button, actor: user, callback: product:open:galochka) — Открыть страницу товара «Галочка» с описанием, ценой и кнопками Купить/Назад
  - outputs: product_detail (name, price, description), inline buttons: Купить, ⬅️ Назад
- **💎 Купить Premium** (button, actor: user, callback: product:open:premium) — Открыть страницу товара Premium (отдельные варианты — 1 мес/12 мес)
  - outputs: product_detail, inline buttons: Купить, ⬅️ Назад
- **📦 Мои покупки** (button, actor: user, callback: orders:list) — Показать список последних (до 10) заказов покупателя с кнопками просмотра и создания обращения
  - outputs: orders_list (paginated), order_detail view
- **🆘 Поддержка** (button, actor: user, callback: support:list) — Создать новый тикет или просмотреть существующие обращения
  - outputs: support_ticket_list, create_ticket flow (ForceReply)

## Flows

### Покупка товара (клиентский путь)
_Trigger:_ callback product:open:<product_id>

1. Показать страницу товара с названием, описанием, ценой и кнопками [Купить, ⬅️ Назад]
2. Пользователь нажимает Купить → бот показывает кнопку «💳 Оплатить» (открывает внешнюю static payment_link)
3. После нажатия внешней ссылки бот создаёт Order со status='pending' и отправляет сообщение покупателю: «✅ Оплата отправлена! Если оплата прошла успешно, дождитесь подтверждения заказа.»
4. Бот отправляет уведомление в ADMIN_CHAT_ID с деталями заказа и quick-actions (Mark paid, Reject, Open chat with buyer)

_Data touched:_ Product, Order, User

### Жизненный цикл заказа (админский путь)
_Trigger:_ admin action (Mark paid / Reject)

1. Админ получает уведомление о новом заказе в ADMIN_CHAT_ID
2. Админ нажимает Mark paid → бот ставит Order.status = 'paid', добавляет admin_notes и запись времени
3. Бот отправляет покупателю уведомление о подтверждении и инструкции по доставке
4. Если админ нажимает Reject → Order.status = 'failed', бот уведомляет покупателя и сохраняет причину в admin_notes

_Data touched:_ Order, User

### Создание и обработка тикета поддержки
_Trigger:_ callback support:create or ForceReply

1. Пользователь выбирает Поддержка → Создать обращение → бот открывает ForceReply или короткую форму
2. После отправки бот создаёт SupportTicket со status='open' и уведомляет ADMIN_CHAT_ID
3. Админ отвечает через админ‑панель → ответ сохраняется в ticket.admin_responses и отправляется пользователю
4. Админ закрывает тикет → status='closed'; пользователь может повторно открыть тикет по кнопке в order_detail

_Data touched:_ SupportTicket, User, Order (optional)

### Админ: управление товарами
_Trigger:_ admin opens admin panel -> Products

1. Админ открывает раздел «Управление товарами и ценами», видит список (пагинация 10)
2. Админ может Создать / Редактировать / Удалить товар: поля name, description, price, currency, delivery_text, payment_link (static)
3. Изменения сохраняются в Product; при создании/редактировании бот записывает changelog в admin_notes (audit)

_Data touched:_ Product

### Админ: рассылка (broadcast)
_Trigger:_ admin selects Broadcast

1. Админ вводит текст и (опционально) медиа; бот показывает превью и кнопку Подтвердить
2. После подтверждения бот отправляет сообщение всем пользователям (batch, с rate limit и прогрессом)
3. Бот сохраняет рассылку как событие для audit; ошибки доставки логируются

_Data touched:_ User

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Куда отправлять уведомления о новых заказах и тикетах (ваш Telegram id / чат)
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **Product** _(retention: persistent)_ — Товар или услуга, продаваемая ботом; статическая ссылка оплаты указывается на уровне товара
  - fields: id, name, description, price, currency, payment_link, delivery_instructions, created_at, updated_at, active
- **Order** _(retention: persistent)_ — Заказ, созданный после нажатия кнопки оплаты покупателем
  - fields: id, buyer_id (telegram_id), product_id, price, currency, payment_link_snapshot, status (created|pending|paid|failed), timestamps (created_at, updated_at, paid_at), admin_notes, metadata (ip/user_agent optional)
- **User** _(retention: persistent)_ — Покупатель или админ, минимальные данные для коммуникации и фильтров
  - fields: telegram_id, username, display_name, contact (phone/email optional), role (user|admin), registration_date, last_seen
- **SupportTicket** _(retention: persistent)_ — Обращение пользователя в поддержку, связанное с заказом или общим вопросом
  - fields: id, user_id, order_id (optional), message, status (open|waiting|closed), admin_responses (list), timestamps (created_at, updated_at)

## Integrations

- **Telegram** (required) — Bot API messaging, inline keyboards, callback queries, ForceReply
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- ADMIN: просматривать/фильтровать/экспортировать заказы (по статусу, дате, пользователю)
- ADMIN: пометить заказ как paid / failed и добавить admin_notes
- ADMIN: создать/редактировать/удалить товары (name, price, payment_link, delivery_instructions)
- ADMIN: просматривать и отвечать на тикеты поддержки, закрывать тикеты
- ADMIN: отправлять рассылки с превью и подтверждением
- ADMIN: просматривать статистику (кол‑во заказов, выручка по периодам)
- ADMIN: управлять списком админ‑идентификаторов (если расширять доступ)

## Notifications

- admin:new_order — отправляется в ADMIN_CHAT_ID при создании заказа (включает кнопки Mark paid / Reject / Open chat)
- admin:new_ticket — уведомление о новом тикете поддержки
- user:order_created — после создания заказа: «✅ Оплата отправлена!...»
- user:order_paid — после пометки admin paid с инструкциями доставки
- user:order_failed — при отклонении заказа
- admin:broadcast_preview_success — при успешном создании и подтверждении рассылки

## Permissions & privacy

- Хранить Telegram ID, имя и username пользователей для связи и рассылок; доступ только админам
- Админские действия и заметки сохраняются для аудита; только админы видят admin_notes
- Платежи идут по внешним ссылкам — бот не хранит реквизиты платежных систем, только snapshot ссылки
- Данные сохраняются постоянно (persistent) до удаления админом; приватность данных — ответственность владельца сервиса

## Edge cases

- Пользователь нажал кнопку Оплатить, но не завершил платёж — заказ остаётся в pending бесконечно; требуется политика таймаута
- Внешняя payment_link недоступна/битая — показать ошибку и позволить администратору обновить ссылку
- Несколько админов нажали conflicting actions (один пометил paid, другой отклонил) — хранить audit trail и показывать последний вердикт
- Пользователь удалил бота/заблокировал — уведомления не доставляются; логировать статус доставки
- Пользователь повторно нажал Оплатить — избежать дублирования заказов (идемпотентность по session или кнопке)
- Отказ доставки сообщения администратору (ADMIN_CHAT_ID неверен) — бот должен логировать и пометить админ‑уведомления как failed
- Массовая рассылка триггерит rate limit Telegram — выполнять batch с retry и прогресс‑логом
- Пользователь просит возврат/оспаривает оплату — процесс вне бота, админ должен иметь шаблон ответа/статус

## Required tests

- Диалоговый acceptance: от /start до открытия product_detail и открытия внешней payment_link
- Создание Order: нажать Оплатить → verify Order создан со status='pending' и уведомление отправлено в ADMIN_CHAT_ID
- Admin flow: нажать Mark paid → verify Order.status='paid', buyer получил сообщение с инструкцией
- Admin reject: нажать Reject → verify Order.status='failed' и buyer уведомлён
- Support flow: создать тикет, убедиться, что он появляется в админ‑панели и ответ доходит до пользователя
- Product CRUD: создать/редактировать/удалить продукт и проверить отображение в каталоге
- Pagination: убедиться, что списки (orders, users) пагинируются по 10 и работают пагинационные кнопки
- Permissions test: доступ к админ‑панели доступен только ADMIN_CHAT_ID (или ролям admin)
- Broadcast test: создать рассылку, подтвердить превью и отправку, проверить обработку rate limits
- Edge case tests: сломанная payment_link, неправильный ADMIN_CHAT_ID, дублирование кликов оплаты

## Assumptions

- Интерфейс и тексты ориентированы на русский язык; все пользователи понимают русский
- Админ‑чат один по умолчанию — ADMIN_CHAT_ID; расширение до нескольких админов опционально
- Каталог заранее seed'ится до 6 товаров, но админ может править/дополнять через панель
- Оплата происходит внешними статическими ссылками; верификация оплаты всегда ручная
- Нет автоматической интеграции с платёжными провайдерами по умолчанию
- Список товаров и цены хранятся в бекте/БД; бот не обязан знать юридические аспекты возвратов
