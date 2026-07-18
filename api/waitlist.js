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

  const apiKey = process.env.RESEND_API_KEY;
  const notifyTo = process.env.NOTIFY_EMAIL;

  if (!apiKey || !notifyTo) {
    console.error("Missing RESEND_API_KEY or NOTIFY_EMAIL");
    return res.status(500).json({
      error: "email_not_configured",
      message: "서버 이메일 설정이 아직 없습니다.",
    });
  }

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

  const from =
    process.env.NOTIFY_FROM || "somsatang <onboarding@resend.dev>";
  const [y, m, d] = birthday.split("-");
  const birthdayLabel = y + "년 " + Number(m) + "월 " + Number(d) + "일";
  const submittedAt = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
  });

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from,
        to: [notifyTo],
        reply_to: email,
        subject: "[somsatang] 사전 등록 — " + email,
        text:
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
          "\n",
        html:
          "<h2>somsatang 사전 등록</h2>" +
          "<p>새로운 출시 알림 사전 등록이 들어왔습니다.</p>" +
          "<ul>" +
          "<li><strong>이메일:</strong> " +
          email +
          "</li>" +
          "<li><strong>생일:</strong> " +
          birthdayLabel +
          "</li>" +
          "<li><strong>등록 시각:</strong> " +
          submittedAt +
          "</li>" +
          "</ul>",
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("Resend error:", response.status, data);
      return res.status(502).json({
        error: "send_failed",
        message: "알림 메일 발송에 실패했습니다.",
      });
    }

    return res.status(200).json({ ok: true, id: data.id || null });
  } catch (err) {
    console.error("Waitlist email error:", err);
    return res.status(500).json({
      error: "server_error",
      message: "일시적인 오류가 발생했습니다.",
    });
  }
};
