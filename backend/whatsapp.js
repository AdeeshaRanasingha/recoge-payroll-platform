import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  initAuthCreds,
  BufferJSON,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import { Worker, Payroll, Transaction, WaSession } from "./db.js";
import {
  findWorkerByExtractedName,
  syncOpenDraftsForWorker,
  extractLastPeriodFromImage,
  processAndSavePayroll,
} from "./payroll.js";

const DEFAULT_COMPANY_ID = process.env.COMPANY_ID || "RECOGE";
const botSentIds = new Set();

let latestQrDataUrl = null;
let waStatus = "INITIALIZING";

export function getWhatsAppStatus() {
  return { status: waStatus, qrDataUrl: latestQrDataUrl };
}

async function useMongoAuthState() {
  const readData = async (id) => {
    const doc = await WaSession.findById(id).lean();
    return doc ? JSON.parse(doc.data, BufferJSON.reviver) : null;
  };

  const writeData = async (id, value) => {
    const serialized = JSON.stringify(value, BufferJSON.replacer);
    await WaSession.findByIdAndUpdate(id, { data: serialized }, { upsert: true });
  };

  const removeData = async (id) => {
    await WaSession.findByIdAndDelete(id);
  };

  const creds = (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === "app-state-sync-key" && value) {
                value = makeWASocket.proto?.Message?.AppStateSyncKeyData?.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(key, value) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData("creds", creds),
  };
}

async function sendTrackedReply(sock, chatJid, text, quotedMsg) {
  const sent = await sock.sendMessage(chatJid, { text }, { quoted: quotedMsg });
  if (sent?.key?.id) {
    botSentIds.add(sent.key.id);
    if (botSentIds.size > 200) {
      const oldest = botSentIds.values().next().value;
      botSentIds.delete(oldest);
    }
  }
}

async function handleTextCommand(rawText) {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  if (lower === "help" || lower === "commands") {
    return [
      `*RECOGE CLOTHING — WHATSAPP COMMANDS*`,
      ``,
      `*Loans & Advances*`,
      `- wasana loan +5000`,
      `- wasana loan -1000`,
      `- wasana advance +2000`,
      `- wasana adv -500`,
      ``,
      `*Wage Rates*`,
      `- wasana daily 2800`,
      `- wasana ot 250`,
      ``,
      `*Status & Balances*`,
      `- wasana balance`,
      `- workers`,
    ].join("\n");
  }

  if (lower === "workers" || lower === "balances") {
    const workers = await Worker.find({
      company_id: DEFAULT_COMPANY_ID,
      active: true,
    }).sort({ full_name: 1 });

    if (workers.length === 0) return `No active workers found in the system.`;

    const lines = [`*RECOGE CLOTHING — WORKER BALANCES*`, ``];
    for (const w of workers) {
      lines.push(`*${w.full_name}*`);
      lines.push(
        `Rates: Rs. ${w.daily_rate.toLocaleString()}/day | Rs. ${w.ot_rate.toLocaleString()}/hr OT`
      );
      lines.push(
        `Advance: Rs. ${w.advance_balance.toLocaleString()} | Loan B/F: Rs. ${w.loan_balance.toLocaleString()}`
      );
      lines.push(``);
    }
    return lines.join("\n").trim();
  }

  const infoMatch = text.match(/^(.+?)\s+(?:balance|status|info)$/i);
  if (infoMatch) {
    const workerName = infoMatch[1].trim();
    const worker = await findWorkerByExtractedName(DEFAULT_COMPANY_ID, workerName);
    if (!worker) return `Worker "${workerName}" was not found in the system.`;

    const latestDraft = await Payroll.findOne({
      company_id: DEFAULT_COMPANY_ID,
      worker_id: worker._id,
      status: "DRAFT",
    }).sort({ createdAt: -1 });

    const lines = [
      `*WORKER SUMMARY — ${worker.full_name}*`,
      ``,
      `Daily Rate: Rs. ${worker.daily_rate.toLocaleString()}`,
      `OT Rate: Rs. ${worker.ot_rate.toLocaleString()}/hr`,
      `Advance Balance: Rs. ${worker.advance_balance.toLocaleString()}`,
      `Loan B/F Balance: Rs. ${worker.loan_balance.toLocaleString()}`,
    ];

    if (latestDraft) {
      lines.push(``);
      lines.push(
        `Pending Draft: ${latestDraft.dates_worked || "No full dates"} (${latestDraft.full_days}d / ${latestDraft.ot_hours}h OT) — Payable: Rs. ${latestDraft.total_payable.toLocaleString()}`
      );
    }
    return lines.join("\n");
  }

  const cmdMatch = text.match(
    /^(.+?)\s+(loan|advance|adv|daily|ot)\s*([+-=]?)\s*(\d+(?:\.\d+)?)(?:\s+(.*))?$/i
  );
  if (!cmdMatch) return null;

  const workerQuery = cmdMatch[1].trim();
  const field = cmdMatch[2].toLowerCase();
  const operator = cmdMatch[3] || "=";
  const amount = Number(cmdMatch[4]);
  const note = (cmdMatch[5] || "").trim();

  if (
    (field === "loan" || field === "advance" || field === "adv") &&
    operator !== "+" &&
    operator !== "-"
  ) {
    return null;
  }

  const worker = await findWorkerByExtractedName(DEFAULT_COMPANY_ID, workerQuery);
  if (!worker) return `Worker "${workerQuery}" was not found in the system.`;

  if (field === "loan") {
    const prevLoan = worker.loan_balance;
    const newLoan = operator === "+" ? prevLoan + amount : Math.max(0, prevLoan - amount);
    worker.loan_balance = newLoan;
    await worker.save();
    await syncOpenDraftsForWorker(worker);

    await Transaction.create({
      company_id: DEFAULT_COMPANY_ID,
      worker_id: worker._id,
      worker_name: worker.full_name,
      source: "WHATSAPP",
      type: operator === "+" ? "LOAN_GIVEN" : "LOAN_REPAID",
      amount,
      note: note || `Command: ${text}`,
    });

    const lines = [
      `*LOAN UPDATED — ${worker.full_name}*`,
      ``,
      `Previous Loan B/F: Rs. ${prevLoan.toLocaleString()}`,
      `${operator === "+" ? "Loan Added" : "Loan Deducted"}: ${operator} Rs. ${amount.toLocaleString()}`,
      `*New Loan B/F: Rs. ${newLoan.toLocaleString()}*`,
    ];
    if (note) lines.push(`Note: ${note}`);
    lines.push(``);
    lines.push(`_Synced to Admin Dashboard._`);
    return lines.join("\n");
  }

  if (field === "advance" || field === "adv") {
    const prevAdv = worker.advance_balance;
    const newAdv = operator === "+" ? prevAdv + amount : Math.max(0, prevAdv - amount);
    worker.advance_balance = newAdv;
    await worker.save();
    await syncOpenDraftsForWorker(worker);

    await Transaction.create({
      company_id: DEFAULT_COMPANY_ID,
      worker_id: worker._id,
      worker_name: worker.full_name,
      source: "WHATSAPP",
      type: operator === "+" ? "ADVANCE_GIVEN" : "ADVANCE_REPAID",
      amount,
      note: note || `Command: ${text}`,
    });

    const lines = [
      `*ADVANCE UPDATED — ${worker.full_name}*`,
      ``,
      `Previous Advance: Rs. ${prevAdv.toLocaleString()}`,
      `${operator === "+" ? "Advance Added" : "Advance Deducted"}: ${operator} Rs. ${amount.toLocaleString()}`,
      `*New Advance Balance: Rs. ${newAdv.toLocaleString()}*`,
    ];
    if (note) lines.push(`Note: ${note}`);
    lines.push(``);
    lines.push(`_Synced to Admin Dashboard._`);
    return lines.join("\n");
  }

  if (field === "daily") {
    const prevRate = worker.daily_rate;
    const newRate =
      operator === "+" ? prevRate + amount : operator === "-" ? Math.max(0, prevRate - amount) : amount;
    worker.daily_rate = newRate;
    await worker.save();
    await syncOpenDraftsForWorker(worker);

    await Transaction.create({
      company_id: DEFAULT_COMPANY_ID,
      worker_id: worker._id,
      worker_name: worker.full_name,
      source: "WHATSAPP",
      type: "RATE_UPDATED",
      amount: newRate,
      note: `Daily rate updated from Rs. ${prevRate.toLocaleString()} to Rs. ${newRate.toLocaleString()}`,
    });

    return [
      `*DAILY RATE UPDATED — ${worker.full_name}*`,
      ``,
      `Previous Rate: Rs. ${prevRate.toLocaleString()}/day`,
      `*New Daily Rate: Rs. ${newRate.toLocaleString()}/day*`,
      ``,
      `_Synced to Admin Dashboard._`,
    ].join("\n");
  }

  if (field === "ot") {
    const prevOt = worker.ot_rate;
    const newOt =
      operator === "+" ? prevOt + amount : operator === "-" ? Math.max(0, prevOt - amount) : amount;
    worker.ot_rate = newOt;
    await worker.save();
    await syncOpenDraftsForWorker(worker);

    await Transaction.create({
      company_id: DEFAULT_COMPANY_ID,
      worker_id: worker._id,
      worker_name: worker.full_name,
      source: "WHATSAPP",
      type: "RATE_UPDATED",
      amount: newOt,
      note: `OT rate updated from Rs. ${prevOt.toLocaleString()} to Rs. ${newOt.toLocaleString()}/hr`,
    });

    return [
      `*OT RATE UPDATED — ${worker.full_name}*`,
      ``,
      `Previous OT Rate: Rs. ${prevOt.toLocaleString()}/hr`,
      `*New OT Rate: Rs. ${newOt.toLocaleString()}/hr*`,
      ``,
      `_Synced to Admin Dashboard._`,
    ].join("\n");
  }

  return null;
}

export async function startWhatsAppBot() {
  const { state, saveCreds } = await useMongoAuthState();
  const sock = makeWASocket({ auth: state, logger: pino({ level: "silent" }) });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      waStatus = "WAITING_FOR_QR";
      latestQrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 2 });
      console.log("New WhatsApp QR generated. Open /qr in your browser to scan.");
    }
    if (connection === "close") {
      waStatus = "DISCONNECTED";
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        console.log("WhatsApp logged out. Clearing session from MongoDB and restarting...");
        latestQrDataUrl = null;
        await WaSession.deleteMany({});
        startWhatsAppBot();
      } else {
        setTimeout(() => startWhatsAppBot(), 3000);
      }
    } else if (connection === "open") {
      waStatus = "CONNECTED";
      latestQrDataUrl = null;
      console.log("WhatsApp Bot connected to MongoDB Backend.");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    const myNumber = sock.user?.id?.split(":")[0]?.split("@")[0];
    const myLid = sock.user?.lid?.split(":")[0]?.split("@")[0];

    for (const msg of messages) {
      if (!msg.message || !msg.key.fromMe) continue;
      if (msg.key.id && botSentIds.has(msg.key.id)) continue;

      const chatJid = msg.key.remoteJid || "";
      const chatUser = chatJid.split(":")[0].split("@")[0];
      const isSelfChat = (myNumber && chatUser === myNumber) || (myLid && chatUser === myLid);

      const content =
        msg.message.ephemeralMessage?.message ||
        msg.message.viewOnceMessage?.message ||
        msg.message.viewOnceMessageV2?.message ||
        msg.message;

      const textBody = content?.conversation || content?.extendedTextMessage?.text || "";
      if (textBody && isSelfChat) {
        try {
          const commandReply = await handleTextCommand(textBody);
          if (commandReply) {
            await sendTrackedReply(sock, chatJid, commandReply, msg);
          }
        } catch (err) {
          console.error("Command Error:", err.message);
        }
        continue;
      }

      const imageMsg = content?.imageMessage;
      if (!imageMsg) continue;

      const caption = (imageMsg.caption || "").trim();
      if (!isSelfChat && !caption.toLowerCase().includes("payroll")) continue;

      try {
        const imageBuffer = await downloadMediaMessage(
          msg,
          "buffer",
          {},
          { logger: pino({ level: "silent" }), reuploadRequest: sock.updateMediaMessage }
        );

        const extracted = await extractLastPeriodFromImage(imageBuffer);
        if (!extracted.is_attendance_sheet || extracted.entries.length === 0) continue;

        const replyText = await processAndSavePayroll(extracted, caption);
        await sendTrackedReply(sock, chatJid, replyText, msg);
      } catch (err) {
        console.error("Extraction Error:", err.message);
      }
    }
  });
}