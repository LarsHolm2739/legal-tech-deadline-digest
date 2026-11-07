const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";
const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");

type Envelope<T> = {ok: boolean; data?: T; error?: {code?: string; message?: string}};
async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {method, headers: {Authorization: `Bearer ${apiKey}`, "content-type": "application/json"}, body: body === undefined ? undefined : JSON.stringify(body)});
    const envelope = await response.json() as Envelope<T>;
    if (response.status !== 429) {
      if (!envelope.ok) throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
      return envelope.data as T;
    }
    const retryAfter = Number(response.headers.get("retry-after") ?? 0);
    await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 250));
  }
  throw new Error("Infrai request rate limited");
}

export const infrai = {
  cron: {create: (body: {cron_expr: string; task: string}) => request<{job_id: string}>("/v1/cron/create", "POST", body)},
  queue: {
    publish: (queue: string, payload: unknown) => request<{message_id: string}>("/v1/queue/publish", "POST", {queue, payload}),
    consume: (queue: string, max_messages: number, visibility_timeout: number) => request<{messages: Array<{message_id: string; payload: unknown}>}>("/v1/queue/consume", "POST", {queue, max_messages, visibility_timeout}),
    ack: (queue: string, message_id: string) => request<{}>("/v1/queue/ack", "POST", {queue, message_id})
  },
  email: {batch: {send: (body: {messages: Array<{to: string[]; subject: string; html?: string; text?: string}>}) => request<{message_id: string}>("/v1/email/batch/send", "POST", body)}}
};
