const MODELS = {
  translate: {
    latin: "Bakhteyar/Balochi-Model",
    arabic: "Bakhteyar/mbart-en-to-bal-19k"
  },
  tts: {
    latin: "facebook/mms-tts-bcc-script_latin",
    arabic: "facebook/mms-tts-bcc-script_arabic"
  }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return handleOptions();
    }

    if (url.pathname === "/api/health") {
      return jsonResponse({
        ok: true,
        service: "Bakhteyar AI Cloudflare Backend"
      });
    }

    if (url.pathname === "/api/translate" && request.method === "POST") {
      return handleTranslate(request, env);
    }

    if (url.pathname === "/api/tts" && request.method === "POST") {
      return handleTTS(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};

function getToken(env) {
  return env.HF_API_TOKEN;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }
  });
}

function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function callHuggingFace(modelId, token, payload) {
  const response = await fetch(
    `https://api-inference.huggingface.co/models/${modelId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    const errorText = await response.text();

    return {
      ok: false,
      status: response.status,
      error: errorText
    };
  }

  if (contentType.includes("application/json")) {
    return {
      ok: true,
      type: "json",
      data: await response.json()
    };
  }

  return {
    ok: true,
    type: "binary",
    data: await response.arrayBuffer(),
    contentType
  };
}

async function handleTranslate(request, env) {
  const body = await readJson(request);

  if (!body) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const text = String(body.text || "").trim();
  const script = String(body.script || "arabic").toLowerCase();

  if (!text) {
    return jsonResponse({ error: "Text is required" }, 400);
  }

  if (!MODELS.translate[script]) {
    return jsonResponse({
      error: "Invalid script. Use 'latin' or 'arabic'."
    }, 400);
  }

  const token = getToken(env);

  if (!token) {
    return jsonResponse({
      error: "HF_API_TOKEN is missing",
      details: "Run: npx wrangler secret put HF_API_TOKEN"
    }, 500);
  }

  const modelId = MODELS.translate[script];

  const result = await callHuggingFace(modelId, token, {
    inputs: text,
    options: {
      wait_for_model: true
    }
  });

  if (!result.ok) {
    return jsonResponse({
      error: "Hugging Face translation failed",
      model: modelId,
      status: result.status,
      details: result.error
    }, 502);
  }

  let translation = "";

  const data = result.data;

  if (Array.isArray(data)) {
    translation =
      data[0]?.translation_text ||
      data[0]?.generated_text ||
      data[0]?.summary_text ||
      "";
  } else if (typeof data === "object" && data !== null) {
    translation =
      data.translation_text ||
      data.generated_text ||
      data.summary_text ||
      "";
  } else if (typeof data === "string") {
    translation = data;
  }

  if (!translation) {
    return jsonResponse({
      error: "No translation returned",
      raw: data
    }, 502);
  }

  return jsonResponse({
    ok: true,
    script,
    model: modelId,
    translation
  });
}

async function handleTTS(request, env) {
  const body = await readJson(request);

  if (!body) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const text = String(body.text || "").trim();
  const script = String(body.script || "arabic").toLowerCase();

  if (!text) {
    return jsonResponse({ error: "Text is required" }, 400);
  }

  if (!MODELS.tts[script]) {
    return jsonResponse({
      error: "Invalid script. Use 'latin' or 'arabic'."
    }, 400);
  }

  const token = getToken(env);

  if (!token) {
    return jsonResponse({
      error: "HF_API_TOKEN is missing",
      details: "Run: npx wrangler secret put HF_API_TOKEN"
    }, 500);
  }

  const modelId = MODELS.tts[script];

  const result = await callHuggingFace(modelId, token, {
    inputs: text,
    options: {
      wait_for_model: true
    }
  });

  if (!result.ok) {
    return jsonResponse({
      error: "Hugging Face TTS failed",
      model: modelId,
      status: result.status,
      details: result.error
    }, 502);
  }

  return new Response(result.data, {
    headers: {
      "Content-Type": result.contentType || "audio/flac",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
