import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const MODEL = "claude-sonnet-4-6";
const MAX_BODY_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_TOKENS = 4096;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

// Best-effort protection against accidental loops. Authentication and the
// fixed model/token limits are the primary controls; Edge Function instances
// can restart, so this in-memory limiter is not a durable quota.
const recentCalls = new Map<string, number[]>();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function allowRequest(userId: string) {
  const now = Date.now();
  const recent = (recentCalls.get(userId) || []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) return false;
  recent.push(now);
  recentCalls.set(userId, recent);
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "Anmeldung erforderlich." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!supabaseUrl || !publishableKey) {
    return json({ error: "Supabase Auth ist nicht konfiguriert." }, 500);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const accessToken = authorization.slice("Bearer ".length);
  const { data: { user }, error: authError } = await userClient.auth.getUser(accessToken);
  if (authError || !user) return json({ error: "Anmeldung ungueltig." }, 401);

  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return json({ error: "Anfrage zu gross." }, 413);

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return json({ error: "Anfrage konnte nicht gelesen werden." }, 400);
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return json({ error: "Anfrage zu gross." }, 413);
  }

  let input: Record<string, unknown>;
  try {
    input = JSON.parse(rawBody);
  } catch {
    return json({ error: "Ungueltiges JSON." }, 400);
  }

  if (input.ping === true) {
    return json({ ready: Boolean(anthropicKey) });
  }
  if (!anthropicKey) {
    return json({ error: "Der gemeinsame KI-Zugang ist noch nicht eingerichtet." }, 503);
  }
  if (!allowRequest(user.id)) {
    return json({ error: "Zu viele KI-Anfragen. Bitte kurz warten." }, 429);
  }

  const messages = input.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
    return json({ error: "Ungueltige Nachrichten." }, 400);
  }
  for (const message of messages) {
    if (!message || typeof message !== "object" ||
        !["user", "assistant"].includes(String(message.role)) ||
        !(typeof message.content === "string" || Array.isArray(message.content))) {
      return json({ error: "Ungueltiges Nachrichtenformat." }, 400);
    }
  }

  const requestedTokens = Number(input.max_tokens || 1000);
  if (!Number.isFinite(requestedTokens) || requestedTokens < 1) {
    return json({ error: "Ungueltige Token-Anzahl." }, 400);
  }

  const anthropicBody: Record<string, unknown> = {
    model: MODEL,
    max_tokens: Math.min(Math.floor(requestedTokens), MAX_OUTPUT_TOKENS),
    messages,
  };
  if (typeof input.system === "string" && input.system.length <= 20_000) {
    anthropicBody.system = input.system;
  }

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
    });
  } catch {
    return json({ error: "Der KI-Dienst ist gerade nicht erreichbar." }, 502);
  }

  const responseBody = await response.text();
  return new Response(responseBody, {
    status: response.status,
    headers: corsHeaders,
  });
});
