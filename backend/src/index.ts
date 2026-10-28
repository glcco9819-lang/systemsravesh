import express from "express";
import cors from "cors";
import pg from "pg";
import { z } from "zod";

const { Pool } = pg;
const app = express();
const port = Number(process.env.API_PORT || 4000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
app.use(cors());
app.use(express.json({ limit: "1mb" }));

async function audit(action: string, entityType: string, entityId: string | number | null, details: unknown = {}) {
  await pool.query(
    "INSERT INTO audit_events(actor, action, entity_type, entity_id, details) VALUES($1,$2,$3,$4,$5)",
    ["کاربر سیستم", action, entityType, entityId == null ? null : String(entityId), JSON.stringify(details)]
  );
}
app.get("/api/health", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ status: "ok", database: "connected" }); }
  catch { res.status(503).json({ status: "error", database: "unavailable" }); }
});
app.get("/api/dashboard", async (_req, res) => {
  try {
    const [machines, open, today, recent] = await Promise.all([
      pool.query("SELECT count(*)::int AS count FROM machines WHERE is_active=true"),
      pool.query("SELECT count(*)::int AS count FROM downtime_records WHERE ended_at IS NULL"),
      pool.query("SELECT count(*)::int AS count FROM downtime_records WHERE started_at >= date_trunc('day', now())"),
      pool.query("SELECT d.id, m.name AS machine_name, d.category, d.reason, d.started_at, d.ended_at FROM downtime_records d JOIN machines m ON m.id=d.machine_id ORDER BY d.created_at DESC LIMIT 8")
    ]);
    res.json({ activeMachines: machines.rows[0].count, openDowntimes: open.rows[0].count, downtimesToday: today.rows[0].count, recent: recent.rows });
  } catch { res.status(500).json({ error: "خطا در دریافت داشبورد" }); }
});
app.get("/api/machines", async (_req, res) => {
  try { const q = await pool.query("SELECT * FROM machines ORDER BY id"); res.json(q.rows); }
  catch { res.status(500).json({ error: "خطا در دریافت ماشین‌آلات" }); }
});
const machineSchema = z.object({ code: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(160), department: z.string().trim().min(1).max(100).default("تولید") });
app.post("/api/machines", async (req, res) => {
  const parsed = machineSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "اطلاعات ماشین معتبر نیست", details: parsed.error.flatten() });
  try {
    const q = await pool.query("INSERT INTO machines(code,name,department) VALUES($1,$2,$3) RETURNING *", [parsed.data.code, parsed.data.name, parsed.data.department]);
    await audit("create", "machine", q.rows[0].id, parsed.data);
    res.status(201).json(q.rows[0]);
  } catch (e: any) { res.status(e.code === "23505" ? 409 : 500).json({ error: e.code === "23505" ? "کد ماشین تکراری است" : "ثبت ماشین ناموفق بود" }); }
});
app.get("/api/downtimes", async (_req, res) => {
  try {
    const q = await pool.query("SELECT d.*, m.name AS machine_name, m.code AS machine_code FROM downtime_records d JOIN machines m ON m.id=d.machine_id ORDER BY d.started_at DESC LIMIT 200");
    res.json(q.rows);
  } catch { res.status(500).json({ error: "خطا در دریافت توقف‌ها" }); }
});
const downtimeSchema = z.object({
  machineId: z.coerce.number().int().positive(),
  startedAt: z.string().min(1),
  endedAt: z.string().optional().nullable(),
  category: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(2000),
  actionTaken: z.string().max(2000).optional().nullable(),
  reportedBy: z.string().trim().min(1).max(160).default("کاربر سیستم")
});
app.post("/api/downtimes", async (req, res) => {
  const parsed = downtimeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "اطلاعات توقف معتبر نیست", details: parsed.error.flatten() });
  const d = parsed.data;
  if (d.endedAt && new Date(d.endedAt) < new Date(d.startedAt)) return res.status(400).json({ error: "زمان پایان نمی‌تواند قبل از شروع باشد" });
  try {
    const q = await pool.query(
      "INSERT INTO downtime_records(machine_id,started_at,ended_at,category,reason,action_taken,reported_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [d.machineId, d.startedAt, d.endedAt || null, d.category, d.reason, d.actionTaken || null, d.reportedBy]
    );
    await audit("create", "downtime", q.rows[0].id, { machineId: d.machineId, category: d.category });
    res.status(201).json(q.rows[0]);
  } catch { res.status(500).json({ error: "ثبت توقف ناموفق بود" }); }
});
app.get("/api/settings/downtime-form", async (_req, res) => {
  try {
    const q = await pool.query("SELECT version,title,definition,is_published FROM form_definitions WHERE form_key='downtime' ORDER BY version DESC LIMIT 1");
    res.json(q.rows[0] || null);
  } catch { res.status(500).json({ error: "خطا در دریافت تنظیمات فرم" }); }
});
app.put("/api/settings/downtime-form", async (req, res) => {
  const schema = z.object({ title: z.string().trim().min(1).max(160), definition: z.object({ fields: z.array(z.object({ name: z.string().min(1), label: z.string().min(1), type: z.enum(["text","textarea","select","datetime-local","machine"]), required: z.boolean().default(false), options: z.array(z.string()).optional() })).min(1) }) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "تعریف فرم معتبر نیست", details: parsed.error.flatten() });
  try {
    const result = await pool.query("SELECT COALESCE(MAX(version),0)+1 AS version FROM form_definitions WHERE form_key='downtime'");
    const version = result.rows[0].version;
    await pool.query("UPDATE form_definitions SET is_published=false WHERE form_key='downtime'");
    const q = await pool.query("INSERT INTO form_definitions(form_key,version,title,definition,is_published) VALUES('downtime',$1,$2,$3,true) RETURNING *", [version, parsed.data.title, JSON.stringify(parsed.data.definition)]);
    await audit("publish", "form_definition", q.rows[0].id, { formKey: "downtime", version });
    res.status(201).json(q.rows[0]);
  } catch { res.status(500).json({ error: "انتشار نسخه جدید فرم ناموفق بود" }); }
});
app.get("/api/audit-events", async (_req, res) => {
  try { const q = await pool.query("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 100"); res.json(q.rows); }
  catch { res.status(500).json({ error: "خطا در دریافت رویدادهای ممیزی" }); }
});
app.listen(port, () => console.log(`SystemsRavesh API listening on ${port}`));
