import { GoogleGenAI, Type } from "@google/genai";
import { Worker, Attendance, Payroll, Transaction } from "./db.js";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { apiVersion: "v1beta" },
});

export const STANDARD_SHIFT_HOURS = Number(process.env.STANDARD_SHIFT_HOURS || 9.0);
export const MIN_FULL_DAY_HOURS = Number(process.env.MIN_FULL_DAY_HOURS || 7.0);
const DEFAULT_COMPANY_ID = process.env.COMPANY_ID || "RECOGE";

function padTime(timeStr) {
  if (!timeStr) return null;
  const parts = String(timeStr).trim().split(":");
  if (parts.length !== 2) return timeStr;
  return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
}

export function calculateAttendanceMetrics(inTime, outTime) {
  const cleanIn = padTime(inTime);
  const cleanOut = padTime(outTime);

  if (!cleanIn || !cleanOut) {
    return { worked_minutes: 0, ot_minutes: 0, day_type: "INCOMPLETE" };
  }
  const [inH, inM] = cleanIn.split(":").map(Number);
  const [outH, outM] = cleanOut.split(":").map(Number);
  const workedMins = Math.max(0, outH * 60 + outM - (inH * 60 + inM));

  if (workedMins === 0) {
    return { worked_minutes: 0, ot_minutes: 0, day_type: "INCOMPLETE" };
  }
  if (workedMins >= MIN_FULL_DAY_HOURS * 60) {
    const otMins = Math.max(0, workedMins - STANDARD_SHIFT_HOURS * 60);
    return { worked_minutes: workedMins, ot_minutes: otMins, day_type: "FULL" };
  }
  return { worked_minutes: workedMins, ot_minutes: 0, day_type: "PARTIAL" };
}

export async function findWorkerByExtractedName(companyId, extractedName) {
  const clean = String(extractedName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!clean) return null;

  const workers = await Worker.find({ company_id: companyId, active: true });
  for (const w of workers) {
    const candidates = [w.full_name, ...(w.aliases || [])].map((s) =>
      String(s).trim().toLowerCase().replace(/[^a-z0-9]/g, "")
    );
    if (candidates.some((c) => c && (clean.includes(c) || c.includes(clean)))) {
      return w;
    }
  }
  return null;
}

export async function syncOpenDraftsForWorker(worker) {
  const drafts = await Payroll.find({
    company_id: worker.company_id,
    worker_id: worker._id,
    status: "DRAFT",
  });

  for (const draft of drafts) {
    draft.worker_name = worker.full_name;
    draft.daily_rate = worker.daily_rate;
    draft.ot_rate = worker.ot_rate;
    draft.basic_pay = Math.round(draft.full_days * worker.daily_rate);
    draft.ot_pay = Math.round(draft.ot_hours * worker.ot_rate);
    draft.advance_deducted = worker.advance_balance;
    draft.loan_bf = worker.loan_balance;
    draft.loan_cf = Math.max(0, worker.loan_balance - draft.loan_deducted);
    draft.total_payable =
      draft.basic_pay +
      draft.ot_pay +
      (draft.extra_partial_pay || 0) -
      draft.advance_deducted -
      draft.loan_deducted;
    await draft.save();
  }
}

export function normalizeChronologicalDates(entries, prevAnchorDate) {
  if (!entries || entries.length === 0) return entries;

  const parseParts = (str) => {
    const m = String(str || "").match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (!m) return null;
    return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  };

  const allDates = [prevAnchorDate, ...entries.map((e) => e.date)]
    .map(parseParts)
    .filter(Boolean);

  if (allDates.length === 0) return entries;

  const anchor = parseParts(prevAnchorDate) || allDates[0];
  let expectedYear = anchor.year;
  let expectedMonth = anchor.month;
  let lastDay = anchor.day;

  return entries.map((entry, idx) => {
    const p = parseParts(entry.date);
    if (!p) return entry;

    const futureParts = entries
      .slice(idx + 1)
      .map((e) => parseParts(e.date))
      .filter(Boolean);
    const futureSameMonth = futureParts.find(
      (f) => f.year === expectedYear && f.month === expectedMonth && f.day > p.day
    );

    if (
      (p.year === expectedYear && p.month < expectedMonth && p.day >= lastDay) ||
      (futureSameMonth && p.month !== expectedMonth && p.day < futureSameMonth.day)
    ) {
      p.year = expectedYear;
      p.month = expectedMonth;
    } else if (p.day < lastDay && p.month === expectedMonth) {
      expectedMonth = expectedMonth === 12 ? 1 : expectedMonth + 1;
      if (expectedMonth === 1) expectedYear += 1;
      p.year = expectedYear;
      p.month = expectedMonth;
    } else {
      expectedYear = p.year;
      expectedMonth = p.month;
    }

    lastDay = p.day;
    const formatted = `${p.year}/${String(p.month).padStart(2, "0")}/${String(p.day).padStart(2, "0")}`;
    return {
      ...entry,
      date: formatted,
      in_time: padTime(entry.in_time),
      out_time: padTime(entry.out_time),
    };
  });
}

export async function extractLastPeriodFromImage(imageBuffer) {
  const prompt = `
    First, verify whether this image is a handwritten attendance logbook containing columns for Date, Name, In Time, and Out Time.
    - If it is NOT an attendance logbook, set is_attendance_sheet to false, employee_name to "", previous_block_last_date to "", and entries to [].
    - If it IS an attendance logbook:
      - Set is_attendance_sheet to true.
      - Horizontal pen lines divide the rows into weekly pay periods.
      - Record previous_block_last_date as the date of the row immediately ABOVE the final horizontal divider line (in YYYY/MM/DD format).
      - Extract ONLY the LAST (bottom-most) pay period block located BELOW the final horizontal divider line.
      - IMPORTANT: Dates go strictly forward in chronological order down the page. Handwritten '11' often has two strokes touching at the bottom so it looks like '10' or '12'—always verify the month against previous_block_last_date and the other rows in the block.
      - Format all dates strictly as YYYY/MM/DD.
      - Normalize In Time and Out Time to 24-hour HH:MM format ('6.5' in Out Time means '18:05').
      - If Out Time is blank or missing, set out_time to null and is_complete to false.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      { inlineData: { data: imageBuffer.toString("base64"), mimeType: "image/jpeg" } },
      prompt,
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          is_attendance_sheet: { type: Type.BOOLEAN },
          employee_name: { type: Type.STRING },
          previous_block_last_date: { type: Type.STRING },
          entries: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                in_time: { type: Type.STRING },
                out_time: { type: Type.STRING, nullable: true },
                is_complete: { type: Type.BOOLEAN },
              },
              required: ["date", "in_time", "is_complete"],
            },
          },
        },
        required: [
          "is_attendance_sheet",
          "employee_name",
          "previous_block_last_date",
          "entries",
        ],
      },
    },
  });

  const parsed = JSON.parse(response.text);
  parsed.entries = normalizeChronologicalDates(
    parsed.entries,
    parsed.previous_block_last_date
  );
  return parsed;
}

export async function processAndSavePayroll(data, caption) {
  const params = Object.fromEntries(
    caption.split(/\s+/).map((p) => p.split("=")).filter((kv) => kv.length === 2)
  );

  let fullDays = 0;
  let totalOtMinutes = 0;
  let totalPartialMinutes = 0;
  let loggedCount = 0;
  const fullDates = [];
  const partialRows = [];
  const incompleteDates = [];

  const worker = await findWorkerByExtractedName(DEFAULT_COMPANY_ID, data.employee_name);

  for (const row of data.entries) {
    const inTime = padTime(row.in_time);
    const outTime = row.is_complete && row.out_time ? padTime(row.out_time) : null;
    const metrics = calculateAttendanceMetrics(inTime, outTime);

    if (worker) {
      await Attendance.findOneAndUpdate(
        {
          company_id: DEFAULT_COMPANY_ID,
          worker_id: worker._id,
          date: row.date,
        },
        {
          worker_name: worker.full_name,
          in_time: inTime,
          out_time: outTime,
          ...metrics,
          source: "WHATSAPP",
        },
        { upsert: true, new: true }
      );
      loggedCount += 1;
    }

    if (metrics.day_type === "INCOMPLETE") {
      incompleteDates.push(row.date);
      continue;
    }

    if (metrics.day_type === "FULL") {
      fullDays += 1;
      fullDates.push(row.date.slice(5));
      totalOtMinutes += metrics.ot_minutes;
    } else {
      totalPartialMinutes += metrics.worked_minutes;
      const h = Math.floor(metrics.worked_minutes / 60);
      const m = metrics.worked_minutes % 60;
      partialRows.push({
        label: `${row.date.slice(5)} (${inTime}–${outTime}, ${h}h ${String(m).padStart(2, "0")}m)`,
        workedMins: metrics.worked_minutes,
      });
    }
  }

  const otHrs = Number((totalOtMinutes / 60).toFixed(2));
  const partialHrs = Number((totalPartialMinutes / 60).toFixed(2));

  const lines = [`*RECOGE CLOTHING — PAYROLL SUMMARY*`, ``];

  if (!worker) {
    lines.push(`*Extracted Name:* ${data.employee_name}`);
    lines.push(
      `*Full Dates:* ${fullDates.join(", ") || "None"} (${fullDays} ${fullDays === 1 ? "day" : "days"})`
    );
    lines.push(`*Overtime (OT):* ${otHrs} hrs`);

    if (partialRows.length > 0) {
      lines.push(``);
      lines.push(`*Partial / Short Days (${partialHrs} hrs total)*`);
      partialRows.forEach((p) => lines.push(`- ${p.label}`));
    }

    if (incompleteDates.length > 0) {
      lines.push(``);
      lines.push(`*Incomplete (No Out Time)*`);
      incompleteDates.forEach((d) => lines.push(`- ${d}`));
    }

    lines.push(``);
    lines.push(
      `_Note: Worker "${data.employee_name}" was not found in the database. Add them in the Admin Portal to log attendance and calculate payroll._`
    );
    return lines.join("\n");
  }

  const hourlyBasicRate = worker.daily_rate / STANDARD_SHIFT_HOURS;
  const basicPay = fullDays * worker.daily_rate;
  const otPay = Math.round(otHrs * worker.ot_rate);
  const partialPay = Math.round((totalPartialMinutes / 60) * hourlyBasicRate);

  const advDed = params.adv !== undefined ? Number(params.adv) : worker.advance_balance;
  const loanDed = params.loan !== undefined ? Number(params.loan) : 0;
  const loanBf = worker.loan_balance;
  const loanCf = Math.max(0, loanBf - loanDed);
  const totalPayable = basicPay + otPay + partialPay - advDed - loanDed;

  const partialLabels = partialRows.map((p) => p.label);

  await Payroll.create({
    company_id: DEFAULT_COMPANY_ID,
    worker_id: worker._id,
    worker_name: worker.full_name,
    daily_rate: worker.daily_rate,
    ot_rate: worker.ot_rate,
    dates_worked: fullDates.join(", "),
    full_days: fullDays,
    ot_hours: otHrs,
    partial_days: partialLabels,
    extra_partial_pay: partialPay,
    basic_pay: basicPay,
    ot_pay: otPay,
    advance_deducted: advDed,
    loan_bf: loanBf,
    loan_deducted: loanDed,
    loan_cf: loanCf,
    total_payable: totalPayable,
    status: "DRAFT",
  });

  if (loggedCount > 0) {
    await Transaction.create({
      company_id: DEFAULT_COMPANY_ID,
      worker_id: worker._id,
      worker_name: worker.full_name,
      source: "WHATSAPP",
      type: "ATTENDANCE_LOGGED",
      amount: 0,
      note: `Logged ${loggedCount} attendance ${loggedCount === 1 ? "entry" : "entries"} from WhatsApp photo`,
    });
  }

  await Transaction.create({
    company_id: DEFAULT_COMPANY_ID,
    worker_id: worker._id,
    worker_name: worker.full_name,
    source: "WHATSAPP",
    type: "PAYROLL_DRAFT",
    amount: totalPayable,
    note: `Payroll draft created (${fullDays}d, ${otHrs}h OT${partialLabels.length ? `, ${partialLabels.length} partial` : ""})`,
  });

  lines.push(`*Worker:* ${worker.full_name}`);
  lines.push(
    `*Full Dates:* ${fullDates.join(", ") || "None"} (${fullDays} ${fullDays === 1 ? "day" : "days"})`
  );
  lines.push(``);
  lines.push(`*Earnings & Deductions*`);
  lines.push(
    `Basic Wage: Rs. ${worker.daily_rate.toLocaleString()} x ${fullDays} = Rs. ${basicPay.toLocaleString()}`
  );
  if (partialPay > 0) {
    lines.push(
      `Partial Day Pay: Rs. ${hourlyBasicRate.toFixed(2)}/hr x ${partialHrs} hrs = Rs. ${partialPay.toLocaleString()}`
    );
  }
  lines.push(
    `Overtime (OT): Rs. ${worker.ot_rate.toLocaleString()} x ${otHrs} hrs = Rs. ${otPay.toLocaleString()}`
  );
  lines.push(`Less Advance: - Rs. ${advDed.toLocaleString()}`);
  lines.push(`Less Loan Deduction: - Rs. ${loanDed.toLocaleString()}`);
  lines.push(`*Total Payable: Rs. ${totalPayable.toLocaleString()}*`);
  lines.push(``);
  lines.push(`*Loan Balance*`);
  lines.push(
    `B/F: Rs. ${loanBf.toLocaleString()} | Deducted: Rs. ${loanDed.toLocaleString()} | *C/F: Rs. ${loanCf.toLocaleString()}*`
  );

  if (partialLabels.length > 0) {
    lines.push(``);
    lines.push(`*Partial / Short Days*`);
    partialLabels.forEach((label) => lines.push(`- ${label}`));
  }

  if (incompleteDates.length > 0) {
    lines.push(``);
    lines.push(`*Incomplete (No Out Time)*`);
    incompleteDates.forEach((d) => lines.push(`- ${d}`));
  }

  lines.push(``);
  lines.push(`_Attendance: ${loggedCount} entries saved to Daily Attendance Logbook._`);
  lines.push(`_Payroll: Saved as DRAFT in Admin Portal._`);

  return lines.join("\n");
}