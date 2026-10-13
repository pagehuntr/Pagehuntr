import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const TELEGRAM = "https://t.me/null_atm";

// Edit prices here. Keys are the number of days.
const PLANS = {
  g_cool: {
    name: "G Cool",
    blurb: "20 fresh leads per run, provider picked at random",
    prices: { 30: 20, 15: 11 },
  },
  g_pro: {
    name: "G Pro",
    blurb: "20 fresh leads per run, you choose Office 365 or Google Workspace",
    prices: { 30: 30, 15: 16 },
  },
};

const planName = (p) => PLANS[p]?.name ?? "No plan";
const daysLeft = (d) => (d ? Math.ceil((new Date(d) - new Date()) / 86400000) : 0);
const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });

async function callAdmin(body) {
  const { data, error } = await supabase.functions.invoke("admin", { body });
  if (error) return { error: error.message || "Request failed" };
  return data;
}

function CopyButton({ text, label }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {}
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div className="center muted">Loading</div>;
  if (!session) return <Login />;
  return <Home session={session} />;
}

function Login() {
  return (
    <div className="center">
      <div className="wrap stack" style={{ textAlign: "center" }}>
        <h1 className="logo" style={{ fontSize: 40 }}>PageHuntr</h1>
        <p className="muted">
          Find businesses on Office 365 or Google Workspace, with their contact emails, delivered to your Telegram.
        </p>
        <button
          className="btn"
          onClick={() =>
            supabase.auth.signInWithOAuth({
              provider: "github",
              options: { redirectTo: window.location.origin },
            })
          }
        >
          Sign in with GitHub
        </button>
      </div>
    </div>
  );
}

function Home({ session }) {
  const [profile, setProfile] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState("dash");

  useEffect(() => {
    supabase
      .from("profiles")
      .select("short_id, github_login, plan, paid_until")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        setProfile(data);
        setLoaded(true);
      });
    callAdmin({ action: "list" }).then((r) => setIsAdmin(!r.error));
  }, [session.user.id]);

  return (
    <div className="wrap">
      <header className="top">
        <span className="logo">PageHuntr</span>
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>

      {isAdmin && (
        <div className="tabs">
          <button className="tab" aria-pressed={tab === "dash"} onClick={() => setTab("dash")}>My account</button>
          <button className="tab" aria-pressed={tab === "admin"} onClick={() => setTab("admin")}>Approvals</button>
        </div>
      )}

      {tab === "admin" && isAdmin ? (
        <AdminPanel />
      ) : !loaded ? (
        <p className="muted">Loading your account</p>
      ) : !profile ? (
        <p className="err">We could not find your account. Sign out and sign in again.</p>
      ) : (
        <Dashboard profile={profile} isAdmin={isAdmin} />
      )}
    </div>
  );
}

function Dashboard({ profile, isAdmin }) {
  const left = daysLeft(profile.paid_until);
  const active = isAdmin || left > 0;
  const expiring = !isAdmin && left > 0 && left <= 3;

  let status;
  if (isAdmin) status = "Admin account. No expiry.";
  else if (left > 0)
    status = `${planName(profile.plan)} is active for ${left} more ${left === 1 ? "day" : "days"}, until ${fmtDate(profile.paid_until)}.`;
  else if (profile.paid_until) status = "Your plan has expired. Choose a plan below to renew.";
  else status = "No plan yet. Choose one below to get started.";

  return (
    <div className="stack">
      <section className="ticket">
        <div className="ticket-top">
          <p className="small muted">Your ID</p>
          <p className="ticket-id">{profile.short_id}</p>
        </div>
        <div className="ticket-bottom">
          <p>{status}</p>
          <CopyButton text={profile.short_id} label="Copy ID" />
        </div>
      </section>

      {active && (
        <section className="card">
          <h2>Lead runs</h2>
          <p className="muted">
            Your plan is active. Starting runs from this page is coming in the next update.
          </p>
        </section>
      )}

      {!isAdmin && (!active || expiring) && (
        <PlanPicker shortId={profile.short_id} renewing={expiring} />
      )}
    </div>
  );
}

function PlanPicker({ shortId, renewing }) {
  const [plan, setPlan] = useState("g_cool");
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  const price = PLANS[plan].prices[days];
  const message = `Hi, my PageHuntr ID is ${shortId}. I want ${PLANS[plan].name} for ${days} days ($${price}).`;

  async function submit() {
    setBusy(true);
    setErr("");
    const { error } = await supabase.functions.invoke("request-plan", { body: { plan, days } });
    setBusy(false);
    if (error) return setErr("Your request did not go through. Try again.");
    setSent(true);
  }

  if (sent) {
    return (
      <section className="card">
        <h2>Request sent</h2>
        <p className="muted">Send this message on Telegram so your payment can be confirmed.</p>
        <div className="msgbox">{message}</div>
        <div className="row">
          <CopyButton text={message} label="Copy message" />
          <a className="btn" href={TELEGRAM} target="_blank" rel="noreferrer">Open Telegram</a>
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>{renewing ? "Renew your plan" : "Choose a plan"}</h2>
      <div className="choices">
        {Object.entries(PLANS).map(([key, p]) => (
          <button key={key} className="choice" aria-pressed={plan === key} onClick={() => setPlan(key)}>
            <strong>{p.name}</strong>
            <span>{p.blurb}</span>
          </button>
        ))}
      </div>
      <div className="choices">
        {[30, 15].map((d) => (
          <button key={d} className="choice" aria-pressed={days === d} onClick={() => setDays(d)}>
            <strong>{d === 30 ? "Full month" : "Half month"}</strong>
            <span>{d} days</span>
          </button>
        ))}
      </div>
      <p className="price">${price}</p>
      <button className="btn" onClick={submit} disabled={busy}>
        {busy ? "Sending" : "Request plan and pay on Telegram"}
      </button>
      {err && <p className="err">{err}</p>}
    </section>
  );
}

function AdminPanel() {
  const [pending, setPending] = useState([]);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState(null);
  const [renewPlan, setRenewPlan] = useState("g_cool");
  const [note, setNote] = useState({ type: "", text: "" });

  async function load() {
    const r = await callAdmin({ action: "list" });
    if (!r.error) setPending(r.requests || []);
  }
  useEffect(() => { load(); }, []);

  async function decide(action, id) {
    const r = await callAdmin({ action, request_id: id });
    setNote(r.error ? { type: "err", text: r.error } : { type: "ok", text: action === "approve" ? `Approved until ${fmtDate(r.paid_until)}.` : "Request rejected." });
    load();
  }

  async function search() {
    setNote({ type: "", text: "" });
    const r = await callAdmin({ action: "search", short_id: query });
    if (r.error) { setFound(null); return setNote({ type: "err", text: "No user with that ID." }); }
    setFound(r.user);
    setRenewPlan(r.user.plan || "g_cool");
  }

  async function renew(days) {
    const r = await callAdmin({ action: "renew", short_id: found.short_id, plan: renewPlan, days });
    if (r.error) return setNote({ type: "err", text: r.error });
    setNote({ type: "ok", text: `Renewed until ${fmtDate(r.paid_until)}.` });
    search();
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>Pending requests</h2>
        {pending.length === 0 && <p className="muted">No pending requests.</p>}
        {pending.map((r) => (
          <div className="req" key={r.id}>
            <div>
              <b>{r.profiles?.short_id}</b>
              <p className="small muted">
                {r.profiles?.github_login}: {planName(r.plan)}, {r.days} days
              </p>
            </div>
            <div className="row">
              <button className="btn" onClick={() => decide("approve", r.id)}>Approve</button>
              <button className="btn danger" onClick={() => decide("reject", r.id)}>Reject</button>
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Find a user</h2>
        <div className="search">
          <input type="text" placeholder="PH-XXXXXXXX" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn" onClick={search}>Search</button>
        </div>
        {found && (
          <div className="found">
            <b>{found.github_login}</b>
            <p className="small muted">{found.email}</p>
            <p className="small">
              {planName(found.plan)}, {daysLeft(found.paid_until) > 0 ? `until ${fmtDate(found.paid_until)}` : "not active"}
            </p>
            <select value={renewPlan} onChange={(e) => setRenewPlan(e.target.value)}>
              {Object.entries(PLANS).map(([k, p]) => <option key={k} value={k}>{p.name}</option>)}
            </select>
            <div className="row">
              <button className="btn" onClick={() => renew(15)}>Renew 15 days</button>
              <button className="btn" onClick={() => renew(30)}>Renew 30 days</button>
            </div>
          </div>
        )}
      </section>
      {note.text && <p className={note.type}>{note.text}</p>}
    </div>
  );
}
