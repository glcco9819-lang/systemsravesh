import { useEffect, useState, type FormEvent } from "react";

const API = (import.meta as any).env.VITE_API_URL || "http://localhost:4000";
type Machine = { id: number; code: string; name: string; department: string; is_active: boolean };
type Downtime = { id: number; machine_name: string; category: string; reason: string; started_at: string; ended_at: string | null };
type Dashboard = { activeMachines: number; openDowntimes: number; downtimesToday: number; recent: Downtime[] };
async function request(path: string, options?: RequestInit) {
  const response = await fetch(API + path, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "خطایی رخ داد");
  return data;
}
export default function App() {
  const [page, setPage] = useState("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [downtimes, setDowntimes] = useState<Downtime[]>([]);
  const [form, setForm] = useState<any>(null);
  const [notice, setNotice] = useState("");
  const [machineForm, setMachineForm] = useState({ code: "", name: "", department: "تولید" });
  const [downForm, setDownForm] = useState({ machineId: "", startedAt: new Date().toISOString().slice(0,16), endedAt: "", category: "خرابی فنی", reason: "", actionTaken: "", reportedBy: "مسئول شیفت" });
  const [formTitle, setFormTitle] = useState("فرم ثبت توقف ماشین‌آلات");
  const [fieldsJson, setFieldsJson] = useState("");
  async function load() {
    try {
      const [d, m, ds, f] = await Promise.all([request("/api/dashboard"), request("/api/machines"), request("/api/downtimes"), request("/api/settings/downtime-form")]);
      setDashboard(d); setMachines(m); setDowntimes(ds); setForm(f); setFormTitle(f?.title || formTitle); setFieldsJson(JSON.stringify(f?.definition || {fields:[]}, null, 2));
      if (!downForm.machineId && m.length) setDownForm(old => ({ ...old, machineId: String(m[0].id) }));
    } catch (e: any) { setNotice(e.message + " — بررسی کنید سرویس‌ها اجرا باشند."); }
  }
  useEffect(() => { load(); }, []);
  async function submitMachine(e: FormEvent) {
    e.preventDefault();
    try { await request("/api/machines", { method: "POST", body: JSON.stringify(machineForm) }); setMachineForm({code:"",name:"",department:"تولید"}); setNotice("ماشین با موفقیت ثبت شد."); await load(); }
    catch (err: any) { setNotice(err.message); }
  }
  async function submitDowntime(e: FormEvent) {
    e.preventDefault();
    try {
      await request("/api/downtimes", { method: "POST", body: JSON.stringify({...downForm, machineId:Number(downForm.machineId), endedAt:downForm.endedAt || null}) });
      setNotice("توقف با موفقیت ثبت شد."); setDownForm(old => ({...old, reason:"",actionTaken:""})); await load();
    } catch (err: any) { setNotice(err.message); }
  }
  async function publishForm(e: FormEvent) {
    e.preventDefault();
    try { const definition = JSON.parse(fieldsJson); await request("/api/settings/downtime-form", {method:"PUT",body:JSON.stringify({title:formTitle,definition})}); setNotice("نسخه جدید فرم منتشر شد."); await load(); }
    catch (err: any) { setNotice(err instanceof SyntaxError ? "ساختار JSON معتبر نیست." : err.message); }
  }
  const nav = [{id:"dashboard",label:"داشبورد"},{id:"downtime",label:"ثبت توقف"},{id:"machines",label:"ماشین‌آلات"},{id:"settings",label:"تنظیم فرم"},{id:"history",label:"سوابق توقف"}];
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-icon">س</div><div><strong>سیستم‌روش</strong><small>مدیریت عملیات کارخانه</small></div></div><div className="nav-label">منوی اصلی</div>{nav.map(n=><button key={n.id} className={"nav-item "+(page===n.id?"active":"")} onClick={()=>setPage(n.id)}><span className="nav-dot"/>{n.label}</button>)}<div className="sidebar-bottom"><span className="status-dot"/> نسخه اولیه · محیط توسعه</div></aside>
    <main className="main"><header className="topbar"><div><span className="eyebrow">سامانه مدیریت کارخانه</span><h1>{nav.find(n=>n.id===page)?.label}</h1></div><button className="secondary" onClick={load}>↻ به‌روزرسانی</button></header>
    {notice && <div className="notice" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
    {page==="dashboard" && <><section className="welcome"><div><span className="eyebrow light">نمای کلی عملیات</span><h2>سلام، به مرکز کنترل عملیات خوش آمدید</h2><p>وضعیت ماشین‌آلات و توقف‌های ثبت‌شده را از یک نقطه دنبال کنید.</p></div><div className="welcome-mark">S&M</div></section><section className="stats"><Stat title="ماشین فعال" value={dashboard?.activeMachines ?? "—"} note="ماشین‌های فعال در سیستم" icon="▦"/><Stat title="توقف باز" value={dashboard?.openDowntimes ?? "—"} note="بدون زمان پایان" icon="◷" alert/><Stat title="توقف امروز" value={dashboard?.downtimesToday ?? "—"} note="از ابتدای روز" icon="↗"/></section><section className="panel"><div className="panel-head"><div><h3>آخرین توقف‌ها</h3><p>آخرین رویدادهای ثبت‌شده در کارخانه</p></div><button className="text-button" onClick={()=>setPage("history")}>مشاهده همه ←</button></div><DowntimeTable rows={dashboard?.recent || []}/></section></>}
    {page==="machines" && <section className="panel"><div className="panel-head"><div><h3>مدیریت ماشین‌آلات</h3><p>تعریف تجهیزات و بخش محل استقرار</p></div></div><form className="form-grid" onSubmit={submitMachine}><label>کد ماشین<input required value={machineForm.code} onChange={e=>setMachineForm({...machineForm,code:e.target.value})} placeholder="مثلاً PR-02"/></label><label>نام ماشین<input required value={machineForm.name} onChange={e=>setMachineForm({...machineForm,name:e.target.value})} placeholder="نام دستگاه"/></label><label>بخش<select value={machineForm.department} onChange={e=>setMachineForm({...machineForm,department:e.target.value})}><option>تولید</option><option>چاپ</option><option>تکمیل</option><option>نگهداری و تعمیرات</option><option>انبار</option></select></label><div className="form-actions"><button className="primary">ثبت ماشین</button></div></form><div className="table-wrap"><table><thead><tr><th>کد</th><th>نام ماشین</th><th>بخش</th><th>وضعیت</th></tr></thead><tbody>{machines.map(m=><tr key={m.id}><td><code>{m.code}</code></td><td>{m.name}</td><td>{m.department}</td><td><span className="badge success">{m.is_active?"فعال":"غیرفعال"}</span></td></tr>)}</tbody></table></div></section>}
    {page==="downtime" && <section className="panel"><div className="panel-head"><div><h3>ثبت توقف ماشین‌آلات</h3><p>اطلاعات توقف را در زمان وقوع ثبت کنید.</p></div><span className="badge warning">ثبت عملیاتی</span></div><form className="form-grid" onSubmit={submitDowntime}><label>ماشین<select required value={downForm.machineId} onChange={e=>setDownForm({...downForm,machineId:e.target.value})}>{machines.map(m=><option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}</select></label><label>دسته توقف<select value={downForm.category} onChange={e=>setDownForm({...downForm,category:e.target.value})}>{(form?.definition?.fields?.find((f:any)=>f.name==="category")?.options || ["خرابی فنی","تنظیمات","کمبود مواد","کیفیت","برنامه‌ریزی","سایر"]).map((v:string)=><option key={v}>{v}</option>)}</select></label><label>زمان شروع<input required type="datetime-local" value={downForm.startedAt} onChange={e=>setDownForm({...downForm,startedAt:e.target.value})}/></label><label>زمان پایان (اختیاری)<input type="datetime-local" value={downForm.endedAt} onChange={e=>setDownForm({...downForm,endedAt:e.target.value})}/></label><label className="full">شرح علت توقف<textarea required rows={3} value={downForm.reason} onChange={e=>setDownForm({...downForm,reason:e.target.value})} placeholder="علت توقف را دقیق توضیح دهید"/></label><label className="full">اقدام انجام‌شده<textarea rows={2} value={downForm.actionTaken} onChange={e=>setDownForm({...downForm,actionTaken:e.target.value})}/></label><label>ثبت‌کننده<input required value={downForm.reportedBy} onChange={e=>setDownForm({...downForm,reportedBy:e.target.value})}/></label><div className="form-actions"><button className="primary" disabled={!machines.length}>ثبت توقف</button></div></form></section>}
    {page==="settings" && <section className="panel"><div className="panel-head"><div><h3>تنظیمات فرم توقف</h3><p>عنوان و تعریف فیلدهای فرم را تنظیم و به‌صورت نسخه جدید منتشر کنید.</p></div><span className="badge success">نسخه {form?.version || 1}</span></div><form onSubmit={publishForm} className="settings-form"><label>عنوان فرم<input required value={formTitle} onChange={e=>setFormTitle(e.target.value)}/></label><label>تعریف فیلدها (JSON)<textarea className="code-editor" dir="ltr" spellCheck={false} rows={18} value={fieldsJson} onChange={e=>setFieldsJson(e.target.value)}/></label><p className="hint">نوع‌های مجاز: text، textarea، select، datetime-local، machine. گزینه‌های فهرست کشویی در آرایه options تعریف می‌شوند.</p><button className="primary">انتشار نسخه جدید</button></form></section>}
    {page==="history" && <section className="panel"><div className="panel-head"><div><h3>سوابق توقف</h3><p>حداکثر ۲۰۰ رکورد آخر</p></div><span className="badge">{downtimes.length} رکورد</span></div><DowntimeTable rows={downtimes}/></section>}
    <footer>سامانه سیستم‌ها و روش‌ها <span>·</span> نسخه MVP · داده‌ها در پایگاه داده محلی ذخیره می‌شوند</footer></main></div>;
}
function Stat({title,value,note,icon,alert=false}:{title:string;value:any;note:string;icon:string;alert?:boolean}) { return <article className="stat-card"><div className={"stat-icon "+(alert?"alert":"")}>{icon}</div><div className="stat-title">{title}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></article>; }
function DowntimeTable({rows}:{rows:Downtime[]}) { if (!rows.length) return <div className="empty"><span>◷</span><strong>هنوز توقفی ثبت نشده است</strong><p>پس از ثبت اولین توقف، اطلاعات در این بخش نمایش داده می‌شود.</p></div>; return <div className="table-wrap"><table><thead><tr><th>ماشین</th><th>دسته</th><th>شرح علت</th><th>شروع</th><th>وضعیت</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.machine_name}</td><td><span className="badge">{r.category}</span></td><td className="reason">{r.reason}</td><td>{new Date(r.started_at).toLocaleString("fa-IR")}</td><td><span className={"badge "+(r.ended_at?"success":"warning")}>{r.ended_at?"بسته":"باز"}</span></td></tr>)}</tbody></table></div>; }
