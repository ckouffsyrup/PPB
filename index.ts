import { withSupabase } from "npm:@supabase/server@^1";
import { sendNotification } from "npm:web-push-neo@0.1.2";

type Notice = {
  user_id: string;
  key: string;
  title: string;
  body: string;
  url?: string;
};

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "";
const PUSH_CRON_SECRET = Deno.env.get("PUSH_CRON_SECRET") ?? "";

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function safeTopic(key: string) {
  return key.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 32) || "printbook";
}

async function sendToSubscriptions(ctx: any, userId: string, notice: Notice) {
  const { data: subscriptions, error } = await ctx.supabaseAdmin
    .from("push_subscriptions")
    .select("id,subscription")
    .eq("user_id", userId)
    .eq("active", true);

  if (error) throw error;
  if (!subscriptions?.length) return 0;

  let sent = 0;

  for (const row of subscriptions) {
    try {
      await sendNotification(
        row.subscription,
        JSON.stringify({
          title: notice.title,
          body: notice.body,
          tag: safeTopic(notice.key),
          url: notice.url ?? "./",
        }),
        {
          vapidDetails: {
            subject: VAPID_SUBJECT,
            publicKey: VAPID_PUBLIC_KEY,
            privateKey: VAPID_PRIVATE_KEY,
          },
          TTL: 21600,
          urgency: "high",
          topic: safeTopic(notice.key),
          signal: AbortSignal.timeout(8000),
        },
      );
      sent++;
    } catch (err: any) {
      console.error("Push send failed:", err?.statusCode, err?.message ?? err);
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await ctx.supabaseAdmin
          .from("push_subscriptions")
          .delete()
          .eq("id", row.id);
      }
    }
  }

  return sent;
}

async function sendOnce(ctx: any, notice: Notice) {
  const { data: already } = await ctx.supabaseAdmin
    .from("push_notification_log")
    .select("id")
    .eq("user_id", notice.user_id)
    .eq("notification_key", notice.key)
    .maybeSingle();

  if (already) return 0;

  const sent = await sendToSubscriptions(ctx, notice.user_id, notice);

  if (sent > 0) {
    await ctx.supabaseAdmin.from("push_notification_log").insert({
      user_id: notice.user_id,
      notification_key: notice.key,
      title: notice.title,
      body: notice.body,
    });
  }

  return sent;
}

function buildNotices(
  filaments: any[],
  prints: any[],
  orders: any[],
): Notice[] {
  const notices: Notice[] = [];
  const now = new Date();
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  for (const f of filaments ?? []) {
    const remaining = Number(f.remaining ?? 0);
    const spoolSize = Number(f.spool_size ?? 1000);
    const pct = spoolSize ? (remaining / spoolSize) * 100 : 0;

    if (remaining <= 100 || pct <= 15) {
      const bucket = Math.max(0, Math.floor(pct / 5) * 5);
      notices.push({
        user_id: f.user_id,
        key: `lowfil:${f.id}:${bucket}`,
        title: `Low filament: ${f.color || f.material || "spool"}`,
        body: `${Math.round(remaining)}g remains (${Math.max(0, Math.round(pct))}% of the spool).`,
        url: "./",
      });
    }
  }

  for (const p of prints ?? []) {
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const stock = variants.length
      ? variants.reduce((sum: number, v: any) => sum + Number(v.stock ?? 0), 0)
      : Math.max(0, Number(p.made_qty ?? 0) - Number(p.sold_qty ?? 0));

    if (stock <= 0 && p.out_of_stock_behavior === "show") {
      const stamp = String(p.updated_at ?? p.created_at ?? "").slice(0, 16);
      notices.push({
        user_id: p.user_id,
        key: `out:${p.id}:${stamp}`,
        title: `Out of stock: ${p.name}`,
        body: "This product is still visible in Customer Store Mode.",
        url: "./",
      });
    }
  }

  for (const o of orders ?? []) {
    if (!o.due_date || ["Paid", "Cancelled"].includes(o.status)) continue;

    const [y, m, d] = String(o.due_date).split("-").map(Number);
    if (!y || !m || !d) continue;

    const target = Date.UTC(y, m - 1, d);
    const days = Math.round((target - todayUtc) / 86400000);

    if (days < 0) {
      notices.push({
        user_id: o.user_id,
        key: `order:${o.id}:${o.due_date}:overdue`,
        title: `Order overdue: ${o.item}`,
        body: `${o.customer || "Customer"} · due ${o.due_date}`,
        url: "./",
      });
    } else if (days === 0) {
      notices.push({
        user_id: o.user_id,
        key: `order:${o.id}:${o.due_date}:today`,
        title: `Order due today: ${o.item}`,
        body: o.customer || "Customer order",
        url: "./",
      });
    } else if (days <= 2) {
      notices.push({
        user_id: o.user_id,
        key: `order:${o.id}:${o.due_date}:soon${days}`,
        title: `Order due in ${days} day${days === 1 ? "" : "s"}`,
        body: `${o.item} · ${o.customer || "Customer"}`,
        url: "./",
      });
    }
  }

  return notices;
}

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
      return json({ error: "VAPID secrets are not configured." }, 503);
    }

    if (req.method === "GET") {
      return json({ publicKey: VAPID_PUBLIC_KEY });
    }

    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    if (body.action === "test") {
      const authHeader = req.headers.get("authorization") ?? "";
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (!token) return json({ error: "Sign in to send a test push." }, 401);

      const { data: userData, error: userError } =
        await ctx.supabaseAdmin.auth.getUser(token);

      const user = userData?.user;
      if (userError || !user) {
        return json({ error: "Invalid user session." }, 401);
      }

      const sent = await sendToSubscriptions(ctx, user.id, {
        user_id: user.id,
        key: `test:${Date.now()}`,
        title: "PrintBook test notification",
        body: "Real mobile push is working 🎉",
        url: "./",
      });

      return json({ ok: true, sent });
    }

    const cronSecret = req.headers.get("x-printbook-cron-secret") ?? "";
    if (!PUSH_CRON_SECRET || cronSecret !== PUSH_CRON_SECRET) {
      return json({ error: "Unauthorized scheduler request." }, 401);
    }

    const [filamentRes, printRes, orderRes] = await Promise.all([
      ctx.supabaseAdmin
        .from("filaments")
        .select("id,user_id,brand,material,color,remaining,spool_size,updated_at"),
      ctx.supabaseAdmin
        .from("prints")
        .select("id,user_id,name,made_qty,sold_qty,variants,out_of_stock_behavior,created_at,updated_at"),
      ctx.supabaseAdmin
        .from("orders")
        .select("id,user_id,customer,status,item,due_date,updated_at"),
    ]);

    const firstError = filamentRes.error || printRes.error || orderRes.error;
    if (firstError) {
      console.error(firstError);
      return json({ error: firstError.message }, 500);
    }

    const notices = buildNotices(
      filamentRes.data ?? [],
      printRes.data ?? [],
      orderRes.data ?? [],
    );

    let sent = 0;
    for (const notice of notices) {
      sent += await sendOnce(ctx, notice);
    }

    return json({ ok: true, checked: notices.length, sent });
  }),
};
