// きものフォトの「AIでリアルに」：アプリが描いた着物入りの写真（image）と、描き直す場所（mask：白 = 着物）を受け取り、
// Cloudflare Workers AI の Stable Diffusion（部分描き直し）で、着物の所だけ写真らしく描き直して PNG で返す。
// ・受け付けるのは、きものフォトの公開サイトからだけ
// ・AI へのお願い文（prompt）はここで作る（外から自由な文は送れない）
// ・送られた写真は保存しない
const MODEL = "@cf/runwayml/stable-diffusion-v1-5-inpainting";
const ORIGINS = ["https://yangxiangyangxiang468-tech.github.io"];
const PATTERNS = { asanoha: "hemp leaf (asanoha) geometric", seigaiha: "wave (seigaiha)", sakura: "cherry blossom (sakura) floral", yagasuri: "arrow feather (yagasuri)", ichimatsu: "checkered (ichimatsu)",
  "shop-green": "deep green silk with large white and gold peony flowers", "shop-white": "ivory silk with pastel flowers, maple leaves and gold accents", "shop-red": "crimson red silk with white plum blossom (ume) dots",
  "shop-black": "black silk with colorful bamboo leaves, flowers and decorative balls (temari)", "shop-shibori": "white cotton with dark red snowflake shibori tie-dye",
  "shop-blue": "white and blue cloud pattern cotton", "shop-purple": "lavender silk with white outlined flower petals" };
const COLORS = { shu: "vermilion red", kon: "navy blue", momo: "pink", moegi: "green", fuji: "wisteria purple", sumi: "black" };
const MAX_BYTES = 3 * 1024 * 1024;

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const ok = ORIGINS.includes(origin);
    const cors = { "Access-Control-Allow-Origin": ok ? origin : ORIGINS[0], "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" };
    const fail = (msg, status) => new Response(JSON.stringify({ error: msg }), { status, headers: { ...cors, "Content-Type": "application/json" } });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST" || !ok) return fail("forbidden", 403);
    let form;
    try { form = await req.formData(); } catch { return fail("bad request", 400); }
    const image = form.get("image"), mask = form.get("mask");
    const width = Number(form.get("width")), height = Number(form.get("height"));
    const pattern = PATTERNS[form.get("pattern")] || PATTERNS.asanoha, color = COLORS[form.get("color")] || COLORS.shu, male = form.get("sex") === "m";
    if (!(image instanceof File) || !(mask instanceof File) || image.size > MAX_BYTES || mask.size > MAX_BYTES) return fail("bad image", 400);
    if (!(width >= 256 && width <= 768 && height >= 256 && height <= 768 && width % 8 === 0 && height % 8 === 0)) return fail("bad size", 400);
    const strength = Math.max(0.3, Math.min(0.6, Number(form.get("strength")) || 0.45));
    const shop = String(form.get("pattern")).startsWith("shop-"); // お店の布は、布そのものの色で
    const prompt = `photograph of a ${male ? "man" : "woman"} wearing a traditional Japanese ${male ? "kimono" : "silk furisode kimono"}, ${shop ? pattern : `${color} fabric with ${pattern} pattern`}, `
      + "realistic silk texture, natural fabric folds and drapes, soft natural lighting, high detail, DSLR photo";
    const negative_prompt = "cartoon, illustration, drawing, anime, flat colors, painting, 3d render, deformed, blurry, low quality, text, watermark";
    try {
      const out = await env.AI.run(MODEL, {
        prompt, negative_prompt, width, height, strength, num_steps: 20, guidance: 7.5,
        image: [...new Uint8Array(await image.arrayBuffer())], mask: [...new Uint8Array(await mask.arrayBuffer())],
      });
      return new Response(out, { headers: { ...cors, "Content-Type": "image/png", "Cache-Control": "no-store" } });
    } catch (e) {
      const msg = String(e?.message || e), limit = /limit|quota|neuron|429/i.test(msg);
      return fail(limit ? "today's free limit reached" : "ai error: " + msg.slice(0, 200), limit ? 429 : 502);
    }
  },
};
