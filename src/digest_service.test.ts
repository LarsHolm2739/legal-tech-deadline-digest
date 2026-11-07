import {strict as assert} from "node:assert";
import {followUpNeeded, intakeSchema} from "./digest_service.ts";
const matter = intakeSchema.parse({matterId:"m-17", subscriber:"counsel@example.org", title:"Lease review", deadline:"2026-09-20T09:00:00.000Z", signedDocumentUrl:"https://files.example.org/signed/17"});
assert.equal(followUpNeeded(matter, new Date("2026-09-14T09:00:00.000Z")), true);
assert.equal(followUpNeeded(matter, new Date("2026-09-01T09:00:00.000Z")), false);
console.log("deadline decision test passed");

const {registerMatter, sendDigest} = await import("./digest_service.ts");
const originalFetch = globalThis.fetch;
const originalCallback = process.env.INFRAI_DIGEST_CALLBACK_URL;
const calls: Array<{path: string; body: any}> = [];
let published: unknown;
globalThis.fetch = async (input, init) => {
  const path = new URL(String(input)).pathname;
  const body = JSON.parse(String(init?.body));
  calls.push({path, body});
  let data: unknown = {};
  if (path === "/v1/queue/publish") { published = body.payload; data = {message_id: "message-test"}; }
  if (path === "/v1/cron/create") data = {job_id: "job-test"};
  if (path === "/v1/queue/consume") data = {messages: [{message_id: "message-test", payload: published}]};
  return new Response(JSON.stringify({ok: true, data}), {headers: {"content-type": "application/json"}});
};
try {
  delete process.env.INFRAI_DIGEST_CALLBACK_URL;
  await assert.rejects(registerMatter(matter));
  assert.equal(calls.length, 0);
  process.env.INFRAI_DIGEST_CALLBACK_URL = "https://worker.example.org/digest";
  assert.deepEqual(await registerMatter(matter), {jobId: "job-test", messageId: "message-test"});
  assert.deepEqual(published, matter);
  assert.equal(calls[1].body.task, process.env.INFRAI_DIGEST_CALLBACK_URL);
  assert.equal(await sendDigest(), 1);
  assert.equal(calls.find(c => c.path === "/v1/queue/consume")?.body.max_messages, 10);
  assert.deepEqual(calls.find(c => c.path === "/v1/email/batch/send")?.body.messages[0].to, [matter.subscriber]);
  assert.equal(calls.at(-1)?.path, "/v1/queue/ack");
  console.log("register-to-digest handoff test passed");
} finally {
  globalThis.fetch = originalFetch;
  if (originalCallback === undefined) delete process.env.INFRAI_DIGEST_CALLBACK_URL;
  else process.env.INFRAI_DIGEST_CALLBACK_URL = originalCallback;
}
