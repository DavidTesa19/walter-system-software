// Storage for the finance screen. Three kinds of data:
//   finance_expenses        the cost list the admin keeps (one row per service)
//   finance_ai_usage        one row per AI call the app made, with its tokens
//                           and an estimated price (usage.js writes it)
//   finance_provider_costs  what each provider billed per day and line item,
//                           in the provider's currency, copied from its
//                           billing API (providers.js)
//   finance_payments        the payment history admins keep by hand: one-off
//                           payments and the months filled in from fixed
//                           costs (origin 'recurring'); provider bills are
//                           not copied here, the history reads them directly
//   finance_ai_turns        one row per Jarvis question: time to answer,
//                           tools, outcome, cost (the admins' usage view)
//   finance_state           small cached documents: each connector's last
//                           sync, Railway's open billing period, the Brave
//                           quota, the Brevo plan, domain expiry dates
//
// Postgres in production; a JSON file next to the dev store otherwise.

import fs from 'node:fs';
import path from 'node:path';

export async function installFinanceSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS finance_expenses (
      id SERIAL PRIMARY KEY,
      catalog_key TEXT UNIQUE,
      name TEXT NOT NULL,
      vendor TEXT,
      category TEXT NOT NULL DEFAULT 'other',
      billing_cycle TEXT NOT NULL DEFAULT 'monthly',
      amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'CZK',
      is_estimate BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'active',
      started_on DATE,
      renews_on DATE,
      description TEXT,
      used_for TEXT,
      env_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
      dashboard_url TEXT,
      cost_source TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS finance_ai_usage (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      provider TEXT NOT NULL,
      model TEXT,
      feature TEXT NOT NULL,
      user_id INTEGER,
      input_tokens BIGINT NOT NULL DEFAULT 0,
      output_tokens BIGINT NOT NULL DEFAULT 0,
      cache_read_tokens BIGINT NOT NULL DEFAULT 0,
      cache_write_tokens BIGINT NOT NULL DEFAULT 0,
      units NUMERIC NOT NULL DEFAULT 0,
      cost_usd NUMERIC(16, 6)
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_finance_ai_usage_created ON finance_ai_usage (created_at)`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS finance_ai_turns (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_id INTEGER,
      conversation_id TEXT,
      question TEXT,
      voice BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL,
      stop_reason TEXT,
      error TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      first_text_ms INTEGER,
      tools JSONB NOT NULL DEFAULT '[]'::jsonb,
      failed_tools INTEGER NOT NULL DEFAULT 0,
      input_tokens BIGINT NOT NULL DEFAULT 0,
      output_tokens BIGINT NOT NULL DEFAULT 0,
      cache_read_tokens BIGINT NOT NULL DEFAULT 0,
      cache_write_tokens BIGINT NOT NULL DEFAULT 0,
      web_searches INTEGER NOT NULL DEFAULT 0,
      cost_usd NUMERIC(16, 6)
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_finance_ai_turns_created ON finance_ai_turns (created_at)`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS finance_provider_costs (
      provider TEXT NOT NULL,
      day DATE NOT NULL,
      line_item TEXT NOT NULL,
      model TEXT,
      amount NUMERIC(16, 6) NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (provider, day, line_item)
    )
  `);
  // The first version stored dollars only (amount_usd). Google can bill in
  // CZK or EUR, so the amount now carries its own currency.
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'finance_provider_costs' AND column_name = 'amount_usd') THEN
        ALTER TABLE finance_provider_costs RENAME COLUMN amount_usd TO amount;
      END IF;
    END $$
  `);
  await client.query(`ALTER TABLE finance_provider_costs ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD'`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS finance_payments (
      id SERIAL PRIMARY KEY,
      paid_on DATE NOT NULL,
      expense_id INTEGER,
      category TEXT NOT NULL DEFAULT 'other',
      description TEXT,
      amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'CZK',
      amount_czk NUMERIC(14, 2),
      note TEXT,
      origin TEXT NOT NULL DEFAULT 'manual',
      recurring_key TEXT UNIQUE,
      dismissed BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_finance_payments_paid_on ON finance_payments (paid_on)`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS finance_state (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

// The usage view reads at most this many questions (90 days of a busy team).
const TURN_LIMIT = 20000;

// API field <-> column. Dates travel as 'YYYY-MM-DD' strings both ways.
const EXPENSE_COLUMNS = {
  catalogKey: 'catalog_key',
  name: 'name',
  vendor: 'vendor',
  category: 'category',
  billingCycle: 'billing_cycle',
  amount: 'amount',
  currency: 'currency',
  isEstimate: 'is_estimate',
  status: 'status',
  startedOn: 'started_on',
  renewsOn: 'renews_on',
  description: 'description',
  usedFor: 'used_for',
  envKeys: 'env_keys',
  dashboardUrl: 'dashboard_url',
  costSource: 'cost_source',
  notes: 'notes',
};

const EXPENSE_SELECT = `
  SELECT id, catalog_key, name, vendor, category, billing_cycle, amount::float8 AS amount, currency,
         is_estimate, status, started_on::text AS started_on, renews_on::text AS renews_on,
         description, used_for, env_keys, dashboard_url, cost_source, notes, created_at, updated_at
    FROM finance_expenses`;

const toExpense = (row) => {
  const expense = { id: row.id };
  for (const [field, column] of Object.entries(EXPENSE_COLUMNS)) expense[field] = row[column] ?? null;
  expense.amount = Number(row.amount ?? 0);
  expense.isEstimate = Boolean(row.is_estimate);
  expense.envKeys = Array.isArray(row.env_keys) ? row.env_keys : [];
  expense.createdAt = row.created_at;
  expense.updatedAt = row.updated_at;
  return expense;
};

// Payment fields an admin can set; origin, recurring key and dismissal are
// the server's.
const PAYMENT_COLUMNS = {
  paidOn: 'paid_on',
  expenseId: 'expense_id',
  category: 'category',
  description: 'description',
  amount: 'amount',
  currency: 'currency',
  amountCzk: 'amount_czk',
  note: 'note',
};

const PAYMENT_SELECT = `
  SELECT id, paid_on::text AS paid_on, expense_id, category, description, amount::float8 AS amount, currency,
         amount_czk::float8 AS amount_czk, note, origin, recurring_key, dismissed, created_at, updated_at
    FROM finance_payments`;

const toPayment = (row) => ({
  id: row.id,
  paidOn: row.paid_on,
  expenseId: row.expense_id ?? null,
  category: row.category,
  description: row.description ?? null,
  amount: Number(row.amount ?? 0),
  currency: row.currency,
  amountCzk: row.amount_czk === null || row.amount_czk === undefined ? null : Number(row.amount_czk),
  note: row.note ?? null,
  origin: row.origin,
  recurringKey: row.recurring_key ?? null,
  dismissed: Boolean(row.dismissed),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// Sums duplicate (day, line item) rows: a provider can split one line item
// across projects or workspaces. A provider bills in one currency.
const mergeCostRows = (rows) => {
  const merged = new Map();
  for (const row of rows) {
    const key = `${row.day}|${row.lineItem}`;
    const current = merged.get(key);
    if (current) current.amount += row.amount;
    else merged.set(key, { ...row, currency: row.currency ?? 'USD' });
  }
  return [...merged.values()];
};

export function createPgFinanceStore(pool) {
  return {
    async listExpenses() {
      const { rows } = await pool.query(`${EXPENSE_SELECT} ORDER BY category, name`);
      return rows.map(toExpense);
    },

    async catalogKeys() {
      const { rows } = await pool.query(`SELECT catalog_key FROM finance_expenses WHERE catalog_key IS NOT NULL`);
      return new Set(rows.map((row) => row.catalog_key));
    },

    async createExpense(data) {
      const fields = Object.keys(data).filter((field) => EXPENSE_COLUMNS[field]);
      const values = fields.map((field) => (field === 'envKeys' ? JSON.stringify(data[field]) : data[field]));
      const { rows } = await pool.query(
        `INSERT INTO finance_expenses (${fields.map((field) => EXPENSE_COLUMNS[field]).join(', ')})
         VALUES (${fields.map((_, index) => `$${index + 1}`).join(', ')})
         RETURNING id`,
        values
      );
      return this.getExpense(rows[0].id);
    },

    async getExpense(id) {
      const { rows } = await pool.query(`${EXPENSE_SELECT} WHERE id = $1`, [id]);
      return rows[0] ? toExpense(rows[0]) : null;
    },

    async updateExpense(id, data) {
      const fields = Object.keys(data).filter((field) => EXPENSE_COLUMNS[field] && field !== 'catalogKey');
      if (!fields.length) return this.getExpense(id);
      const values = fields.map((field) => (field === 'envKeys' ? JSON.stringify(data[field]) : data[field]));
      const { rowCount } = await pool.query(
        `UPDATE finance_expenses
            SET ${fields.map((field, index) => `${EXPENSE_COLUMNS[field]} = $${index + 2}`).join(', ')}, updated_at = now()
          WHERE id = $1`,
        [id, ...values]
      );
      return rowCount ? this.getExpense(id) : null;
    },

    async deleteExpense(id) {
      const { rowCount } = await pool.query(`DELETE FROM finance_expenses WHERE id = $1`, [id]);
      return rowCount > 0;
    },

    async recordUsage(entry) {
      await pool.query(
        `INSERT INTO finance_ai_usage
           (provider, model, feature, user_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, units, cost_usd)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [entry.provider, entry.model, entry.feature, entry.userId, entry.input, entry.output,
          entry.cacheRead, entry.cacheWrite, entry.units, entry.costUsd]
      );
    },

    // Per Prague calendar month, provider, model and feature.
    async usageSummary(since) {
      const [{ rows }, first] = await Promise.all([
        pool.query(
          `SELECT to_char(created_at AT TIME ZONE 'Europe/Prague', 'YYYY-MM') AS month,
                  provider, COALESCE(model, '') AS model, feature,
                  COUNT(*)::int AS calls,
                  SUM(input_tokens)::float8 AS input, SUM(output_tokens)::float8 AS output,
                  SUM(cache_read_tokens)::float8 AS cache_read, SUM(cache_write_tokens)::float8 AS cache_write,
                  SUM(units)::float8 AS units,
                  COALESCE(SUM(cost_usd), 0)::float8 AS cost_usd,
                  COUNT(*) FILTER (WHERE cost_usd IS NULL)::int AS unpriced
             FROM finance_ai_usage
            WHERE created_at >= $1
            GROUP BY 1, 2, 3, 4
            ORDER BY 1`,
          [since]
        ),
        pool.query(`SELECT MIN(created_at) AS first FROM finance_ai_usage`),
      ]);
      return {
        firstLoggedAt: first.rows[0]?.first ?? null,
        rows: rows.map((row) => ({
          month: row.month,
          provider: row.provider,
          model: row.model || null,
          feature: row.feature,
          calls: row.calls,
          input: row.input,
          output: row.output,
          cacheRead: row.cache_read,
          cacheWrite: row.cache_write,
          units: row.units,
          costUsd: row.cost_usd,
          unpriced: row.unpriced,
        })),
      };
    },

    async recordTurn(turn) {
      await pool.query(
        `INSERT INTO finance_ai_turns
           (user_id, conversation_id, question, voice, status, stop_reason, error, duration_ms, first_text_ms, tools,
            failed_tools, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, web_searches, cost_usd)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [turn.userId, turn.conversationId, turn.question, turn.voice, turn.status, turn.stopReason, turn.error,
          turn.durationMs, turn.firstTextMs, JSON.stringify(turn.tools), turn.failedTools, turn.input, turn.output,
          turn.cacheRead, turn.cacheWrite, turn.webSearches, turn.costUsd]
      );
    },

    // The Jarvis questions since a date, newest first, and every AI call's
    // cost per user and feature over the same days.
    async aiActivity(since) {
      const [turns, usage] = await Promise.all([
        pool.query(
          `SELECT created_at, user_id, conversation_id, question, voice, status, stop_reason, error, duration_ms,
                  first_text_ms, tools, failed_tools, input_tokens, output_tokens, cache_read_tokens,
                  cache_write_tokens, web_searches, cost_usd::float8 AS cost_usd
             FROM finance_ai_turns
            WHERE created_at >= $1
            ORDER BY created_at DESC
            LIMIT ${TURN_LIMIT}`,
          [since]
        ),
        pool.query(
          `SELECT user_id, feature, COUNT(*)::int AS calls, COALESCE(SUM(cost_usd), 0)::float8 AS cost_usd
             FROM finance_ai_usage
            WHERE created_at >= $1
            GROUP BY 1, 2`,
          [since]
        ),
      ]);
      return {
        turns: turns.rows.map((row) => ({
          at: row.created_at,
          userId: row.user_id,
          conversationId: row.conversation_id,
          question: row.question,
          voice: row.voice,
          status: row.status,
          stopReason: row.stop_reason,
          error: row.error,
          durationMs: row.duration_ms,
          firstTextMs: row.first_text_ms,
          tools: row.tools ?? [],
          failedTools: row.failed_tools,
          input: Number(row.input_tokens),
          output: Number(row.output_tokens),
          cacheRead: Number(row.cache_read_tokens),
          cacheWrite: Number(row.cache_write_tokens),
          webSearches: row.web_searches,
          costUsd: row.cost_usd,
        })),
        usage: usage.rows.map((row) => ({ userId: row.user_id, feature: row.feature, calls: row.calls, costUsd: row.cost_usd })),
      };
    },

    // Replaces the provider's figures for the synced days; a line item the
    // provider no longer reports for those days drops to zero.
    async saveProviderCosts(provider, fromDay, toDay, rows) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE finance_provider_costs SET amount = 0, fetched_at = now()
            WHERE provider = $1 AND day >= $2::date AND day <= $3::date`,
          [provider, fromDay, toDay]
        );
        const merged = mergeCostRows(rows).map((row) => ({
          day: row.day, line_item: row.lineItem, model: row.model ?? null, amount: row.amount, currency: row.currency,
        }));
        if (merged.length) {
          await client.query(
            `INSERT INTO finance_provider_costs (provider, day, line_item, model, amount, currency, fetched_at)
             SELECT $1, d.day, d.line_item, d.model, d.amount, d.currency, now()
               FROM jsonb_to_recordset($2::jsonb) AS d(day date, line_item text, model text, amount numeric, currency text)
             ON CONFLICT (provider, day, line_item)
             DO UPDATE SET amount = EXCLUDED.amount, currency = EXCLUDED.currency, model = EXCLUDED.model, fetched_at = now()`,
            [provider, JSON.stringify(merged)]
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },

    async providerCostSummary(sinceDay) {
      const [{ rows }, synced] = await Promise.all([
        pool.query(
          `SELECT provider, to_char(day, 'YYYY-MM') AS month, line_item, currency,
                  SUM(amount)::float8 AS amount
             FROM finance_provider_costs
            WHERE day >= $1::date
            GROUP BY 1, 2, 3, 4
           HAVING SUM(amount) <> 0
            ORDER BY 2, 1`,
          [sinceDay]
        ),
        pool.query(`SELECT provider, MAX(fetched_at) AS fetched_at FROM finance_provider_costs GROUP BY provider`),
      ]);
      return {
        rows: rows.map((row) => ({
          provider: row.provider, month: row.month, lineItem: row.line_item, amount: row.amount, currency: row.currency,
        })),
        fetchedAt: Object.fromEntries(synced.rows.map((row) => [row.provider, row.fetched_at])),
      };
    },

    // Every bill day since a date, for the history (converted per day).
    async providerCostDays(sinceDay) {
      const { rows } = await pool.query(
        `SELECT provider, day::text AS day, line_item, currency, amount::float8 AS amount
           FROM finance_provider_costs
          WHERE day >= $1::date AND amount <> 0
          ORDER BY day`,
        [sinceDay]
      );
      return rows.map((row) => ({ provider: row.provider, day: row.day, lineItem: row.line_item, amount: row.amount, currency: row.currency }));
    },

    async listPayments() {
      const { rows } = await pool.query(`${PAYMENT_SELECT} WHERE NOT dismissed ORDER BY paid_on, id`);
      return rows.map(toPayment);
    },

    async getPayment(id) {
      const { rows } = await pool.query(`${PAYMENT_SELECT} WHERE id = $1`, [id]);
      return rows[0] ? toPayment(rows[0]) : null;
    },

    async createPayment(data) {
      const fields = Object.keys(data).filter((field) => PAYMENT_COLUMNS[field]);
      const { rows } = await pool.query(
        `INSERT INTO finance_payments (${fields.map((field) => PAYMENT_COLUMNS[field]).join(', ')}, origin)
         VALUES (${fields.map((_, index) => `$${index + 1}`).join(', ')}, 'manual')
         RETURNING id`,
        fields.map((field) => data[field])
      );
      return this.getPayment(rows[0].id);
    },

    async updatePayment(id, data) {
      const fields = Object.keys(data).filter((field) => PAYMENT_COLUMNS[field]);
      if (!fields.length) return this.getPayment(id);
      const { rowCount } = await pool.query(
        `UPDATE finance_payments
            SET ${fields.map((field, index) => `${PAYMENT_COLUMNS[field]} = $${index + 2}`).join(', ')}, updated_at = now()
          WHERE id = $1 AND NOT dismissed`,
        [id, ...fields.map((field) => data[field])]
      );
      return rowCount ? this.getPayment(id) : null;
    },

    // A month filled in from a fixed cost is only hidden, so it does not come
    // back on the next fill; a payment added by hand is deleted.
    async deletePayment(id) {
      const { rows } = await pool.query(`SELECT origin, dismissed FROM finance_payments WHERE id = $1`, [id]);
      if (!rows[0] || rows[0].dismissed) return false;
      if (rows[0].origin === 'recurring') {
        await pool.query(`UPDATE finance_payments SET dismissed = true, updated_at = now() WHERE id = $1`, [id]);
      } else {
        await pool.query(`DELETE FROM finance_payments WHERE id = $1`, [id]);
      }
      return true;
    },

    // Adds the given recurring months; one that exists (or was hidden) stays as it is.
    async addRecurringPayments(payments) {
      if (!payments.length) return 0;
      const { rowCount } = await pool.query(
        `INSERT INTO finance_payments (paid_on, expense_id, category, description, amount, currency, origin, recurring_key)
         SELECT p.paid_on, p.expense_id, p.category, p.description, p.amount, p.currency, 'recurring', p.recurring_key
           FROM jsonb_to_recordset($1::jsonb) AS p(paid_on date, expense_id integer, category text, description text,
                                                  amount numeric, currency text, recurring_key text)
         ON CONFLICT (recurring_key) DO NOTHING`,
        [JSON.stringify(payments.map((payment) => ({
          paid_on: payment.paidOn,
          expense_id: payment.expenseId,
          category: payment.category,
          description: payment.description,
          amount: payment.amount,
          currency: payment.currency,
          recurring_key: payment.recurringKey,
        })))]
      );
      return rowCount;
    },

    async getStates(keys) {
      const { rows } = await pool.query(`SELECT key, value FROM finance_state WHERE key = ANY($1::text[])`, [keys]);
      return Object.fromEntries(rows.map((row) => [row.key, row.value]));
    },

    async setState(key, value) {
      await pool.query(
        `INSERT INTO finance_state (key, value, updated_at) VALUES ($1, $2::jsonb, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, JSON.stringify(value)]
      );
    },
  };
}

// Local development: one JSON file, rewritten on every change.
export function createFileFinanceStore(dataDir) {
  const file = path.join(dataDir, 'finance.json');
  const read = () => {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { expenses: [], usage: [], providerCosts: [], payments: [], nextId: 1, nextPaymentId: 1, ...data };
    } catch {
      return { expenses: [], usage: [], providerCosts: [], payments: [], nextId: 1, nextPaymentId: 1 };
    }
  };
  const write = (data) => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data), 'utf8');
  };
  const pragueMonth = (iso) =>
    new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit' }).format(new Date(iso));
  const pick = (data) => Object.fromEntries(Object.entries(data).filter(([field]) => EXPENSE_COLUMNS[field]));

  return {
    async listExpenses() {
      return read().expenses
        .slice()
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, 'cs'));
    },

    async catalogKeys() {
      return new Set(read().expenses.map((expense) => expense.catalogKey).filter(Boolean));
    },

    async createExpense(input) {
      const data = read();
      if (input.catalogKey && data.expenses.some((expense) => expense.catalogKey === input.catalogKey)) {
        throw Object.assign(new Error('duplicate catalog key'), { code: '23505' });
      }
      const now = new Date().toISOString();
      const expense = {
        id: data.nextId,
        catalogKey: null, vendor: null, category: 'other', billingCycle: 'monthly', amount: 0, currency: 'CZK',
        isEstimate: false, status: 'active', startedOn: null, renewsOn: null, description: null, usedFor: null,
        envKeys: [], dashboardUrl: null, costSource: null, notes: null,
        ...pick(input),
        createdAt: now,
        updatedAt: now,
      };
      data.nextId += 1;
      data.expenses.push(expense);
      write(data);
      return expense;
    },

    async getExpense(id) {
      return read().expenses.find((expense) => expense.id === id) ?? null;
    },

    async updateExpense(id, input) {
      const data = read();
      const expense = data.expenses.find((item) => item.id === id);
      if (!expense) return null;
      const { catalogKey: _ignored, ...changes } = pick(input);
      Object.assign(expense, changes, { updatedAt: new Date().toISOString() });
      write(data);
      return expense;
    },

    async deleteExpense(id) {
      const data = read();
      const next = data.expenses.filter((expense) => expense.id !== id);
      const removed = next.length < data.expenses.length;
      data.expenses = next;
      write(data);
      return removed;
    },

    async recordUsage(entry) {
      const data = read();
      data.usage.push({ ...entry, createdAt: new Date().toISOString() });
      write(data);
    },

    async usageSummary(since) {
      const groups = new Map();
      const usage = read().usage;
      for (const row of usage) {
        if (new Date(row.createdAt) < since) continue;
        const month = pragueMonth(row.createdAt);
        const key = [month, row.provider, row.model ?? '', row.feature].join('|');
        const group = groups.get(key) ?? {
          month, provider: row.provider, model: row.model ?? null, feature: row.feature,
          calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, units: 0, costUsd: 0, unpriced: 0,
        };
        group.calls += 1;
        group.input += row.input;
        group.output += row.output;
        group.cacheRead += row.cacheRead;
        group.cacheWrite += row.cacheWrite;
        group.units += row.units;
        if (row.costUsd === null) group.unpriced += 1;
        else group.costUsd += row.costUsd;
        groups.set(key, group);
      }
      return {
        firstLoggedAt: usage[0]?.createdAt ?? null,
        rows: [...groups.values()].sort((a, b) => a.month.localeCompare(b.month)),
      };
    },

    async recordTurn(turn) {
      const data = read();
      data.turns = [...(data.turns ?? []), { ...turn, at: new Date().toISOString() }].slice(-TURN_LIMIT);
      write(data);
    },

    async aiActivity(since) {
      const data = read();
      const recent = (row) => new Date(row.at ?? row.createdAt) >= since;
      const usage = new Map();
      for (const row of data.usage.filter(recent)) {
        const key = `${row.userId}|${row.feature}`;
        const group = usage.get(key) ?? { userId: row.userId, feature: row.feature, calls: 0, costUsd: 0 };
        group.calls += 1;
        group.costUsd += row.costUsd ?? 0;
        usage.set(key, group);
      }
      return { turns: (data.turns ?? []).filter(recent).reverse(), usage: [...usage.values()] };
    },

    async saveProviderCosts(provider, fromDay, toDay, rows) {
      const data = read();
      const fetchedAt = new Date().toISOString();
      data.providerCosts = data.providerCosts.filter(
        (row) => !(row.provider === provider && row.day >= fromDay && row.day <= toDay)
      );
      for (const row of mergeCostRows(rows)) data.providerCosts.push({ provider, ...row, fetchedAt });
      data.syncedAt = { ...(data.syncedAt ?? {}), [provider]: fetchedAt };
      write(data);
    },

    async providerCostSummary(sinceDay) {
      const data = read();
      const groups = new Map();
      for (const row of data.providerCosts) {
        if (row.day < sinceDay) continue;
        const month = row.day.slice(0, 7);
        // Rows saved before costs carried a currency were in dollars.
        const currency = row.currency ?? 'USD';
        const key = [row.provider, month, row.lineItem, currency].join('|');
        const group = groups.get(key) ?? { provider: row.provider, month, lineItem: row.lineItem, amount: 0, currency };
        group.amount += row.amount ?? row.amountUsd ?? 0;
        groups.set(key, group);
      }
      return {
        rows: [...groups.values()].filter((row) => row.amount !== 0).sort((a, b) => a.month.localeCompare(b.month)),
        fetchedAt: data.syncedAt ?? {},
      };
    },

    async providerCostDays(sinceDay) {
      return read()
        .providerCosts.filter((row) => row.day >= sinceDay && (row.amount ?? row.amountUsd ?? 0) !== 0)
        .map((row) => ({
          provider: row.provider, day: row.day, lineItem: row.lineItem, amount: row.amount ?? row.amountUsd, currency: row.currency ?? 'USD',
        }))
        .sort((a, b) => a.day.localeCompare(b.day));
    },

    async listPayments() {
      return read()
        .payments.filter((payment) => !payment.dismissed)
        .sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.id - b.id);
    },

    async getPayment(id) {
      return read().payments.find((payment) => payment.id === id) ?? null;
    },

    async createPayment(input) {
      const data = read();
      const now = new Date().toISOString();
      const payment = {
        id: data.nextPaymentId,
        expenseId: null, category: 'other', description: null, amount: 0, currency: 'CZK', amountCzk: null, note: null,
        ...Object.fromEntries(Object.entries(input).filter(([field]) => PAYMENT_COLUMNS[field])),
        origin: 'manual', recurringKey: null, dismissed: false, createdAt: now, updatedAt: now,
      };
      data.nextPaymentId += 1;
      data.payments.push(payment);
      write(data);
      return payment;
    },

    async updatePayment(id, input) {
      const data = read();
      const payment = data.payments.find((item) => item.id === id && !item.dismissed);
      if (!payment) return null;
      Object.assign(payment, Object.fromEntries(Object.entries(input).filter(([field]) => PAYMENT_COLUMNS[field])), {
        updatedAt: new Date().toISOString(),
      });
      write(data);
      return payment;
    },

    async deletePayment(id) {
      const data = read();
      const payment = data.payments.find((item) => item.id === id);
      if (!payment || payment.dismissed) return false;
      if (payment.origin === 'recurring') payment.dismissed = true;
      else data.payments = data.payments.filter((item) => item.id !== id);
      write(data);
      return true;
    },

    async addRecurringPayments(payments) {
      const data = read();
      const keys = new Set(data.payments.map((payment) => payment.recurringKey).filter(Boolean));
      const now = new Date().toISOString();
      let added = 0;
      for (const payment of payments) {
        if (keys.has(payment.recurringKey)) continue;
        data.payments.push({
          id: data.nextPaymentId, amountCzk: null, note: null, ...payment, origin: 'recurring', dismissed: false, createdAt: now, updatedAt: now,
        });
        data.nextPaymentId += 1;
        keys.add(payment.recurringKey);
        added += 1;
      }
      if (added) write(data);
      return added;
    },

    async getStates(keys) {
      const state = read().state ?? {};
      return Object.fromEntries(keys.filter((key) => key in state).map((key) => [key, state[key]]));
    },

    async setState(key, value) {
      const data = read();
      data.state = { ...(data.state ?? {}), [key]: value };
      write(data);
    },
  };
}
