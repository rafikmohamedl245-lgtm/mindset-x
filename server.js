import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = process.env.PORT || 3000;
const ROOT = join(process.cwd(), "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "POST" && url.pathname === "/api/chat") {
    if (!process.env.OPENAI_API_KEY) {
      res.writeHead(503, { "content-type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ error: "المساعد الذكي غير مفعّل بعد. أضف OPENAI_API_KEY في إعدادات الاستضافة." }));
    }
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 20_000) throw new Error("الرسالة طويلة جداً.");
      }
      const { message } = JSON.parse(body || "{}");
      if (typeof message !== "string" || !message.trim() || message.length > 4000) {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
        return res.end(JSON.stringify({ error: "اكتب سؤالاً صالحاً (حتى 4000 حرف)." }));
      }

      const upstream = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
          instructions: "أنت مدرب عربي عملي في تطوير الذات والانضباط والتركيز وتحقيق الأهداف. أجب بالعربية بوضوح وواقعية، وقدّم خطوات قابلة للتنفيذ دون مبالغة أو وعود غير واقعية.",
          input: message,
          max_output_tokens: 700
        })
      });
      const data = await upstream.json();
      if (!upstream.ok) {
        res.writeHead(upstream.status, { "content-type": "application/json; charset=utf-8" });
        return res.end(JSON.stringify({ error: data.error?.message || "تعذر الوصول إلى خدمة الذكاء الاصطناعي." }));
      }
      const answer = (data.output || [])
        .flatMap(item => item.content || [])
        .filter(item => item.type === "output_text")
        .map(item => item.text)
        .join("\n").trim();
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ answer: answer || "لم أتمكن من صياغة إجابة. حاول مرة أخرى." }));
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ error: error.message || "حدث خطأ غير متوقع." }));
    }
  }

  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const safePath = normalize(join(ROOT, pathname));
  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403); return res.end("Forbidden");
  }
  try {
    const content = await readFile(safePath);
    res.writeHead(200, { "content-type": MIME[extname(safePath)] || "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(PORT, () => console.log(`MINDSET X running on port ${PORT}`));