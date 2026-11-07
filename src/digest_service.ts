import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {z} from "zod";
import {infrai} from "./infrai.ts";

const queue = process.env.INFRAI_QUEUE ?? "legal-tech-digest";

export const intakeSchema = z.object({matterId: z.string().min(1), subscriber: z.string().email(), title: z.string().min(1), deadline: z.string().datetime(), signedDocumentUrl: z.string().url()});
export type MatterIntake = z.infer<typeof intakeSchema>;

export function followUpNeeded(matter: MatterIntake, now = new Date()): boolean {
  return new Date(matter.deadline).getTime() - now.getTime() <= 7 * 86400000;
}

export async function registerMatter(input: unknown): Promise<{jobId: string; messageId: string}> {
  const matter = intakeSchema.parse(input);
  const task = z.string().url().parse(process.env.INFRAI_DIGEST_CALLBACK_URL);
  const message = await infrai.queue.publish(queue, matter);
  const job = await infrai.cron.create({cron_expr: "0 9 * * 1", task});
  return {jobId: job.job_id, messageId: message.message_id};
}

export async function sendDigest(): Promise<number> {
  const batch = await infrai.queue.consume(queue, 10, 60);
  const due = batch.messages.filter((m) => followUpNeeded(intakeSchema.parse(m.payload)));
  if (due.length) {
    const emailBody = {to: due.map((m) => intakeSchema.parse(m.payload).subscriber), subject: "Legal matter deadline follow-up", text: due.map((m) => `${intakeSchema.parse(m.payload).title}: ${intakeSchema.parse(m.payload).signedDocumentUrl}`).join("\n")};
    await infrai.email.batch.send({messages: [emailBody]});
  }
  for (const item of due) await infrai.queue.ack(queue, item.message_id);
  return due.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, inputPath] = process.argv.slice(2);
  if (command === "register" && inputPath) {
    console.log(JSON.stringify(await registerMatter(JSON.parse(await readFile(inputPath, "utf8")))));
  } else if (command === "send") {
    console.log(JSON.stringify({sent: await sendDigest()}));
  } else {
    throw new Error("Usage: npm start -- register <matter.json> | send");
  }
}
