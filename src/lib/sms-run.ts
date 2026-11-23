/**
 * sms-run.ts — the morning run: send every reminder due today. Server only.
 *
 * Called once a day by the scheduler at about 6:00 Nepal time. For each
 * running reminder whose date has come:
 *
 *  1. Months older than yesterday are written down as missed and skipped —
 *     a reminder days late is worse than none (`dueState`).
 *  2. Today's (or yesterday's) message is claimed in `sms_sent` before the
 *     SMS service is called, so a run started twice sends it once.
 *  3. Sent, or refused for good: the reminder moves on to next month.
 *     Failed in a way that may come right (no connection, no credit): it
 *     stays put and tomorrow morning's run tries once more. After that its
 *     day has passed and it moves on.
 *
 * Nothing here throws for one reminder's sake: a reminder that goes wrong is
 * logged and the rest still go out.
 */
import "server-only";
import { bsFromDbText, bsToDbText, todayInNepal } from "@/lib/bs";
import { fillMessage } from "@/lib/sms-text";
import {
  bsTextToAdIso,
  dueState,
  longBs,
  nextOccurrence,
} from "@/lib/sms-schedule";
import type { SmsSender } from "@/lib/sms";
import {
  advanceReminder,
  claimSend,
  getSharedMessage,
  markFailed,
  markSent,
  recordMissed,
  remindersDueBy,
  type DueReminder,
} from "@/lib/repos/sms-reminders";

export interface RunSummary {
  todayBs: string;
  considered: number;
  sent: number;
  failed: number;
  missed: number;
  /** Already dealt with by an earlier run; only moved on. */
  skipped: number;
  /** Left for the next run because this one ran out of time. */
  deferred: number;
}

export interface RunOptions {
  send: SmsSender;
  clinicName: string;
  now?: Date;
  /** Stop starting new messages after this many milliseconds. */
  budgetMs?: number;
  /** How many messages are sent at the same time. */
  concurrency?: number;
}

export async function runSmsReminders(opts: RunOptions): Promise<RunSummary> {
  const now = opts.now ?? new Date();
  const started = Date.now();
  const budget = opts.budgetMs ?? 45_000;
  const concurrency = Math.max(1, opts.concurrency ?? 5);

  const todayText = bsToDbText(todayInNepal(now));
  const todayAd = bsTextToAdIso(todayText);
  const shared = await getSharedMessage();

  const summary: RunSummary = {
    todayBs: todayText,
    considered: 0,
    sent: 0,
    failed: 0,
    missed: 0,
    skipped: 0,
    deferred: 0,
  };

  const due = await remindersDueBy(todayAd);
  summary.considered = due.length;

  const write = (r: DueReminder, dueBs: string) =>
    fillMessage(r.message.trim() || shared, {
      name: r.patientName,
      date: longBs(dueBs),
      clinic: opts.clinicName,
    });

  async function handle(r: DueReminder): Promise<void> {
    let currentBs = r.nextDateBs;
    let currentAd = r.nextDateAd;

    // 1. Months that went by without a message.
    while (dueState(currentAd, todayAd) === "missed") {
      await recordMissed(r.id, currentBs, r.phone, write(r, currentBs));
      summary.missed++;
      const next = bsToDbText(nextOccurrence(bsFromDbText(currentBs), r.dayOfMonth));
      const nextAd = bsTextToAdIso(next);
      // Somebody changed or stopped it meanwhile: leave it to them.
      if (!(await advanceReminder(r.id, currentBs, next, nextAd))) return;
      currentBs = next;
      currentAd = nextAd;
    }
    if (dueState(currentAd, todayAd) !== "due") return;

    const moveOn = async () => {
      const next = bsToDbText(nextOccurrence(bsFromDbText(currentBs), r.dayOfMonth));
      await advanceReminder(r.id, currentBs, next, bsTextToAdIso(next));
    };

    // 2. Claim it.
    const message = write(r, currentBs);
    const sentId = await claimSend(r.id, currentBs, r.phone, message);
    if (!sentId) {
      summary.skipped++;
      await moveOn();
      return;
    }

    // 3. Send it.
    const result = await opts.send(r.phone, message);
    if (result.ok) {
      await markSent(sentId, result.providerId, result.credits);
      summary.sent++;
      await moveOn();
      return;
    }

    // Yesterday's message has had its second chance; today's gets one more.
    const lastChance = currentAd < todayAd;
    const canRetry = result.retry && !lastChance;
    await markFailed(sentId, result.detail, canRetry);
    summary.failed++;
    if (!canRetry) await moveOn();
  }

  for (let i = 0; i < due.length; i += concurrency) {
    if (Date.now() - started > budget) {
      summary.deferred += due.length - i;
      break;
    }
    const batch = due.slice(i, i + concurrency);
    await Promise.all(
      batch.map((r) =>
        handle(r).catch((err: unknown) => {
          // One reminder going wrong must not stop the rest. No name or
          // number in the log (Rules §2.7) — the id is enough to find it.
          console.error("[sms-run] reminder", r.id, (err as Error)?.message);
          summary.failed++;
        }),
      ),
    );
  }

  return summary;
}
