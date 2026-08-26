/**
 * toolAiSso.js - Tool AI -> Procurement SSO Contract Helper
 * ========================================================
 * Generates an HS256 JWT Token containing { "ma_nv": "<mã nhân viên>" }
 * signed with TOOL_AI_SSO_SECRET to authenticate directly with Procurement.
 */

export const TOOL_AI_SSO_SECRET = "DM6qyxmexfqAbBM43rfhVjN8PmYxokVM/OsGtdFOY4hVn9gIp1aRvzfes/1CEtQ9";

function base64UrlEncode(str) {
  return btoa(str)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return base64UrlEncode(binary);
}

export async function createToolAiJwt(maNv = "EZE0090", expiresInSeconds = 300) {
  try {
    const cleanMaNv = String(maNv || "EZE0090").trim() || "EZE0090";
    const now = Math.floor(Date.now() / 1000);

    const header = {
      alg: "HS256",
      typ: "JWT"
    };

    const payload = {
      ma_nv: cleanMaNv,
      iat: now,
      exp: now + expiresInSeconds
    };

    const headerB64 = base64UrlEncode(JSON.stringify(header));
    const payloadB64 = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${headerB64}.${payloadB64}`;

    if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
      const enc = new TextEncoder();
      const key = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(TOOL_AI_SSO_SECRET),
        { name: "HMAC", hash: { name: "SHA-256" } },
        false,
        ["sign"]
      );
      const signature = await window.crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
      const signatureB64 = bufferToBase64Url(signature);
      return `${signingInput}.${signatureB64}`;
    }
  } catch (err) {
    console.warn("[Tool AI SSO] Client-side JWT error:", err);
  }
  return null;
}
