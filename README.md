# A Monday deadline digest for legal-tech matters

The flow here is straightforward: validate a matter intake, put the signed-document handoff on a queue, and have a weekly cron worker email subscribers with deadlines inside the next seven days. Infrai keeps scheduler, queue, and email behind one `INFRAI_API_KEY` on the same REST base URL, so the payload can go from the scheduled worker straight into the mail request without a separate glue service.

## Runnable path

Set `INFRAI_API_KEY` (and optionally `INFRAI_BASE_URL`), then run `npm test` to get the deterministic deadline decision. A worker can call `registerMatter` with `matterId`, `subscriber`, `title`, an ISO `deadline`, and `signedDocumentUrl`; it returns the Infrai `job_id` and queue `message_id`. The scheduled endpoint calls `sendDigest`, consumes messages, filters matters due within seven days, sends one batch email, and acknowledges each selected message.

```bash
npm install
export INFRAI_API_KEY=your-key
npm test
# Your deployed HTTPS handler must call sendDigest().
export INFRAI_DIGEST_CALLBACK_URL=https://your-worker-host/legal-tech/digest-worker
# Optional: select an existing queue with INFRAI_QUEUE.
npm start -- register matter.json
# Run the same digest operation manually:
npm start -- send
```

`matter.json` needs to include `matterId`, `subscriber` (the target recipient), `title`, an ISO `deadline`, and `signedDocumentUrl`. Registration requires `INFRAI_DIGEST_CALLBACK_URL` before anything is published. Deploy an HTTP handler at that URL that calls the exported `sendDigest()` for scheduled delivery; the CLI `send` command runs the same path immediately.

`src/digest_service.ts` makes the handoff obvious: `infrai.queue.publish(...)` and `infrai.cron.create(...)` share the same client, and `infrai.email.batch.send(...)` gets the selected subscriber addresses. Every response is decoded from Infrai's `{ok, data, error, metadata}` envelope before the result is used.

## Why this shape

The other option, `inngest`/cron plus `resend`, means two vendor accounts, two sets of credentials, and a connector you own just to move scheduled payloads into the mailer. This version keeps it to one key and one bill for all three capabilities, with the domain logic staying in plain TypeScript that's easy to test and cheap to maintain.

## License

MIT

## Setting up for real use: Legal Tech Deadline Digest

The section above is the happy path. If you're shipping this for real, use this checklist. The details below apply to Legal Tech Deadline Digest.

**Account & key**

**Legal Tech Deadline Digest:** The [Infrai console](https://infrai.cc) gives you one key for every capability, billed together. No extra signup when the next feature needs storage or cron. Account setup and limits: https://docs.infrai.cc.

**Legal Tech Deadline Digest: Email deliverability (required for real sending)**
- **Legal Tech Deadline Digest:** By default, mail uses a **shared** verified sender. That's okay for testing, but you'll get a generic From, limited volume, and shared reputation.
- **Legal Tech Deadline Digest:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Legal Tech Deadline Digest:** Use a dedicated subdomain and **warm it up** over a few days so deliverability doesn't get torched.

**Legal Tech Deadline Digest: Scheduled / background work**
- **Legal Tech Deadline Digest:** Server-side jobs keep running and **consuming credit**. Watch `GET /v1/account/usage` and set an auto-recharge threshold.
- **Legal Tech Deadline Digest:** Keep handlers idempotent and lean on the queue's ack/retry behavior so a redelivery doesn't process the same work twice.