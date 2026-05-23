/**
 * ═══════════════════════════════════════════════════════════════════
 * 🌉 OH API DAY — FLASH PROXY
 * Cloud Function v1 HTTP qui proxy les appels IA vers tes providers
 *
 * Compatible avec :
 *   • Groq         (Llama, Whisper)
 *   • OpenAI       (GPT-4, DALL-E)
 *   • Anthropic    (Claude)
 *   • NVIDIA NIM   (FLUX, Llama 70B)
 *   • Custom       (n'importe quel endpoint OpenAI-compatible)
 *
 * Variables d'environnement (à définir dans Firebase Console > Functions) :
 *   GROQ_KEY       = ta clé Groq
 *   OPENAI_KEY     = ta clé OpenAI
 *   ANTHROPIC_KEY  = ta clé Anthropic
 *   NVIDIA_KEY     = ta clé NVIDIA NIM
 *
 * Pour ajouter une clé après déploiement :
 *   firebase functions:secrets:set GROQ_KEY
 *   → colle ta clé, puis firebase deploy --only functions
 *
 * ═══════════════════════════════════════════════════════════════════
 */

const functions = require('firebase-functions');

// CORS : autorise Oh API Day + localhost dev
const ALLOWED_ORIGINS = [
  'https://ohapiday.com',
  'https://pikadev2foly.gitlab.io',
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:5500'
];

function setCors(req, res){
  const origin = req.headers.origin || '';
  if(ALLOWED_ORIGINS.indexOf(origin) !== -1 || ALLOWED_ORIGINS.indexOf('*') !== -1){
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*'); // fallback large
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Max-Age', '86400');
}

// ─── Mapping provider → URL endpoint ────────────────────────
const PROVIDER_ENDPOINTS = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  'openai-image': 'https://api.openai.com/v1/images/generations',
  'openai-audio': 'https://api.openai.com/v1/audio/speech',
  'nvidia-flux': 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev',
  'groq-whisper': 'https://api.groq.com/openai/v1/audio/transcriptions'
};

// ─── Mapping provider → env var clé ─────────────────────────
const PROVIDER_KEYS = {
  groq: 'GROQ_KEY',
  openai: 'OPENAI_KEY',
  anthropic: 'ANTHROPIC_KEY',
  nvidia: 'NVIDIA_KEY',
  'openai-image': 'OPENAI_KEY',
  'openai-audio': 'OPENAI_KEY',
  'nvidia-flux': 'NVIDIA_KEY',
  'groq-whisper': 'GROQ_KEY'
};

// ─── Headers spéciaux par provider (Anthropic = x-api-key, autres = Bearer) ──
function buildAuthHeaders(provider, apiKey){
  if(provider === 'anthropic'){
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    };
  }
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
}

// ═════════════════════════════════════════════════════════════
// 🎯 ENDPOINT PRINCIPAL : /flash
// Body attendu : { provider, payload, customEndpoint?, customKey? }
// ═════════════════════════════════════════════════════════════
exports.flash = functions.https.onRequest(async (req, res) => {
  setCors(req, res);

  // Preflight
  if(req.method === 'OPTIONS') return res.status(204).send('');

  // GET → page de santé
  if(req.method === 'GET'){
    return res.status(200).json({
      ok: true,
      worker: 'oh-api-day-flash',
      providers: Object.keys(PROVIDER_ENDPOINTS),
      time: new Date().toISOString()
    });
  }

  if(req.method !== 'POST'){
    return res.status(405).json({ error: 'Méthode non autorisée — POST seulement' });
  }

  try {
    const { provider, payload, customEndpoint, customKey } = req.body || {};
    if(!provider){
      return res.status(400).json({ error: 'Champ "provider" manquant' });
    }
    if(!payload){
      return res.status(400).json({ error: 'Champ "payload" manquant' });
    }

    // ─── Mode CUSTOM : l'user fournit son endpoint et sa clé directement ──
    let endpoint, apiKey;
    if(provider === 'custom'){
      if(!customEndpoint || !customKey){
        return res.status(400).json({ error: 'Mode custom : customEndpoint et customKey requis' });
      }
      endpoint = customEndpoint;
      apiKey = customKey;
    } else {
      // Mode provider standard : on lit la clé depuis Firebase env vars
      endpoint = PROVIDER_ENDPOINTS[provider];
      if(!endpoint){
        return res.status(400).json({
          error: `Provider "${provider}" inconnu`,
          available: Object.keys(PROVIDER_ENDPOINTS).concat(['custom'])
        });
      }
      const keyVar = PROVIDER_KEYS[provider];
      apiKey = process.env[keyVar];
      if(!apiKey){
        return res.status(500).json({
          error: `Clé manquante pour ${provider}`,
          hint: `Ajoute ${keyVar} dans Firebase Console > Functions > Variables, puis redéploie.`
        });
      }
    }

    // ─── Appel au provider ──
    const baseProvider = provider.split('-')[0]; // 'openai-image' → 'openai'
    const headers = buildAuthHeaders(baseProvider, apiKey);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch(err){
    console.error('[flash] error:', err);
    return res.status(500).json({
      error: 'Erreur interne',
      message: err.message || 'Inconnue'
    });
  }
});

// ═════════════════════════════════════════════════════════════
// 🔍 ENDPOINT : /health (test sans auth provider)
// ═════════════════════════════════════════════════════════════
exports.health = functions.https.onRequest((req, res) => {
  setCors(req, res);
  if(req.method === 'OPTIONS') return res.status(204).send('');
  return res.status(200).json({
    ok: true,
    worker: 'oh-api-day-flash',
    time: new Date().toISOString(),
    providers_configured: Object.entries(PROVIDER_KEYS).reduce((acc, [p, k]) => {
      acc[p] = !!process.env[k];
      return acc;
    }, {})
  });
});
