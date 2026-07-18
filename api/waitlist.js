module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const notifyTo = String(process.env.NOTIFY_EMAIL || "gobyjea@gmail.com")
    .trim()
    .replace(/^["']|["']$/g, "");
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ error: "invalid_json" });
    }
  }

  const email = String((body && body.email) || "")
    .trim()
    .toLowerCase();
  const birthday = String((body && body.birthday) || "").trim();

  if (!email || !email.includes("@") || !birthday) {
    return res.status(400).json({
      error: "invalid_input",
      message: "이메일과 생일을 확인해 주세요.",
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
    return res.status(400).json({
      error: "invalid_birthday",
      message: "생일 형식이 올바르지 않습니다.",
    });
  }

  const [y, m, d] = birthday.split("-");
  const birthdayLabel = y + "년 " + Number(m) + "월 " + Number(d) + "일";
  const submittedAt = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
  });

  const messageText =
    "새로운 출시 알림 사전 등록이 들어왔습니다.\n\n" +
    "이메일: " +
    email +
    "\n" +
    "생일: " +
    birthdayLabel +
    " (" +
    birthday +
    ")\n" +
    "등록 시각: " +
    submittedAt +
    "\n";

  let formsubmitOk = false;
  let resendOk = false;
  let lastError = null;

  // 1) FormSubmit → Gmail 직접 수신 (첫 1회는 활성화 메일 확인 필요)
  try {
    const fsRes = await fetch(
      "https://formsubmit.co/ajax/" + encodeURIComponent(notifyTo),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Origin: "https://somsatang.vercel.app",
          Referer: "https://somsatang.vercel.app/",
        },
        body: JSON.stringify({
          _subject: "[somsatang] 사전 등록 — " + email,
          _template: "table",
          _captcha: "false",
          email: email,
          생일: birthdayLabel,
          등록시각: submittedAt,
          message: messageText,
        }),
      }
    );
    const fsData = await fsRes.json().catch(() => ({}));
    const fsMessage = String(fsData.message || "");
    formsubmitOk =
      fsRes.ok &&
      (fsData.success === "true" ||
        fsData.success === true ||
        fsMessage.toLowerCase().includes("success") ||
        fsMessage.toLowerCase().includes("activation") ||
        fsMessage.includes("Activate Form"));
    if (!formsubmitOk) {
      console.error("FormSubmit error:", fsRes.status, fsData);
      lastError = fsData;
    } else {
      console.log("FormSubmit ok:", fsData);
    }
  } catch (err) {
    console.error("FormSubmit exception:", err);
    lastError = String(err && err.message ? err.message : err);
  }

  // 2) Resend 백업 (키가 있을 때만)
  if (apiKey && apiKey !== "[SENSITIVE]") {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "somsatang <onboarding@resend.dev>",
          to: [notifyTo],
          reply_to: email,
          subject: "[somsatang] 사전 등록 — " + email,
          text: messageText,
          html:
            "<h2>somsatang 사전 등록</h2><pre style='font-family:inherit;white-space:pre-wrap'>" +
            messageText.replace(/</g, "&lt;") +
            "</pre>",
        }),
      });
      const data = await response.json().catch(() => ({}));
      resendOk = response.ok && Boolean(data.id);
      if (!resendOk) {
        console.error("Resend error:", response.status, data);
        lastError = data;
      }
    } catch (err) {
      console.error("Resend exception:", err);
      lastError = String(err && err.message ? err.message : err);
    }
  }

  if (!formsubmitOk && !resendOk) {
    return res.status(502).json({
      error: "send_failed",
      message: "알림 메일 발송에 실패했습니다.",
      detail: lastError,
    });
  }

  return res.status(200).json({
    ok: true,
    via: {
      formsubmit: formsubmitOk,
      resend: resendOk,
    },
  });
};
