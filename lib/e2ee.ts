// Browser-only end-to-end encryption, built on WebCrypto.
//
//  - Password → two PBKDF2 keys. The "auth" key is sent to log in; the "enc" key
//    never leaves the browser and encrypts your ECDH P-256 identity key, so the
//    server stores your private key but can't open it.
//  - Each group chat has a random AES-256-GCM key. It's wrapped separately for each
//    member with ECDH(wrapper's private key, member's public key) → HKDF → AES-GCM.
//  - Messages are AES-GCM encrypted with the group key. The server sees ciphertext,
//    sender and time only.
// Not (yet) in this prototype: forward secrecy / ratcheting (Signal's Double Ratchet,
// Matrix's Megolm rotation) and key verification (safety numbers).

const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

export const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s);
};
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");

const ITER = 210_000;

async function pbkdf2(password: string, salt: string, bits = 256) {
  const base = await subtle().importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return subtle().deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: ITER, hash: "SHA-256" }, base, bits);
}

export async function deriveKeys(password: string, username: string, keySalt: string) {
  const [authKey, encKey] = await Promise.all([authKeyFor(password, username), encKeyFor(password, `friend-stocks:enc:${keySalt}`)]);
  return { authKey, encKey };
}

/** The login key alone. It depends on the username, so a rename needs a new one. */
export async function authKeyFor(password: string, username: string) {
  return hex(await pbkdf2(password, `friend-stocks:auth:${username.toLowerCase()}`));
}

async function encKeyFor(secret: string, salt: string) {
  return subtle().importKey("raw", await pbkdf2(secret, salt), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function aesEncrypt(key: CryptoKey, data: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: "AES-GCM", iv }, key, data as BufferSource);
  return { iv: b64(iv), ct: b64(ct) };
}
async function aesDecrypt(key: CryptoKey, iv: string, ct: string) {
  return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: unb64(iv) as BufferSource }, key, unb64(ct) as BufferSource));
}

const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;

export async function createIdentity(encKey: CryptoKey) {
  const kp = await subtle().generateKey(ECDH, true, ["deriveBits"]);
  const pub = await subtle().exportKey("spki", kp.publicKey);
  const priv = await subtle().exportKey("pkcs8", kp.privateKey);
  const sealed = await aesEncrypt(encKey, new Uint8Array(priv));
  const privateKey = await importPrivate(new Uint8Array(priv));
  return { publicKey: b64(pub), encPrivateKey: `${sealed.iv}.${sealed.ct}`, privateKey };
}

const importPrivate = (pkcs8: Uint8Array) => subtle().importKey("pkcs8", pkcs8 as BufferSource, ECDH, false, ["deriveBits"]);
const importPublic = (spkiB64: string) => subtle().importKey("spki", unb64(spkiB64) as BufferSource, ECDH, false, []);

export async function unlockIdentity(encPrivateKey: string, encKey: CryptoKey) {
  const [iv, ct] = encPrivateKey.split(".");
  return importPrivate(await aesDecrypt(encKey, iv, ct));
}

/**
 * Re-seals the sealed identity key under a different key (new password, or a recovery code).
 * The raw key only exists inside this function, and is checked to be a real key before re-sealing.
 */
export async function rewrapIdentity(encPrivateKey: string, oldEncKey: CryptoKey, newEncKey: CryptoKey) {
  const [iv, ct] = encPrivateKey.split(".");
  const raw = await aesDecrypt(oldEncKey, iv, ct);
  try {
    await importPrivate(raw);
    const s = await aesEncrypt(newEncKey, raw);
    return `${s.iv}.${s.ct}`;
  } finally {
    raw.fill(0);
  }
}

// Recovery codes: 20 characters from a 32-letter alphabet with no 0/O or 1/I (100 bits),
// shown as five groups of four. Two keys come from it, like a password: one to prove it,
// one that seals a second copy of the identity key.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const chars = [...bytes].map((b) => CODE_ALPHABET[b & 31]).join("");
  return chars.match(/.{4}/g)!.join("-");
}
/** Upper-cases and drops spaces and dashes; null unless it could be a code. */
export function normaliseRecoveryCode(input: string) {
  const c = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length === 20 && [...c].every((ch) => CODE_ALPHABET.includes(ch)) ? c : null;
}
export async function deriveRecoveryKeys(code: string, recoverySalt: string) {
  const c = normaliseRecoveryCode(code);
  if (!c) throw new Error("A recovery code is 20 letters and numbers, like ABCD-EFGH-JKLM-NPQR-STUV");
  const [authBits, encKey] = await Promise.all([pbkdf2(c, `friend-stocks:recovery-auth:${recoverySalt}`), encKeyFor(c, `friend-stocks:recovery-enc:${recoverySalt}`)]);
  return { authKey: hex(authBits), encKey };
}

/** A fresh recovery code and what the server stores for it, from a sealed identity key. */
export async function makeRecoveryBundle(encPrivateKey: string, encKey: CryptoKey) {
  const code = newRecoveryCode();
  const recoverySalt = randomSalt();
  const r = await deriveRecoveryKeys(code, recoverySalt);
  return {
    code,
    upload: { recoveryAuthKey: r.authKey, recoverySalt, encPrivateKeyRecovery: await rewrapIdentity(encPrivateKey, encKey, r.encKey) },
  };
}

/**
 * Everything a new account needs, made in the browser: keys from the password, a new
 * identity, and a recovery code. POST `body` to /api/auth/signup, then save `privateKey`
 * with saveIdentity(id) and show `recoveryCode` once.
 */
export async function prepareSignup({ username, displayName, password }: { username: string; displayName: string; password: string }) {
  const uname = username.trim().replace(/^@/, "").toLowerCase();
  const keySalt = randomSalt();
  const { authKey, encKey } = await deriveKeys(password, uname, keySalt);
  const id = await createIdentity(encKey);
  const recovery = await makeRecoveryBundle(id.encPrivateKey, encKey);
  return {
    body: { username: uname, displayName: displayName.trim() || uname, authKey, publicKey: id.publicKey, encPrivateKey: id.encPrivateKey, keySalt, ...recovery.upload },
    privateKey: id.privateKey,
    recoveryCode: recovery.code,
  };
}

async function pairKey(myPrivate: CryptoKey, theirPublicB64: string) {
  const bits = await subtle().deriveBits({ name: "ECDH", public: await importPublic(theirPublicB64) }, myPrivate, 256);
  const hk = await subtle().importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("friend-stocks:group-key-wrap"), info: new Uint8Array() },
    hk,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export const newGroupKey = () => crypto.getRandomValues(new Uint8Array(32));

export async function wrapGroupKey(raw: Uint8Array, myPrivate: CryptoKey, theirPublicB64: string) {
  const s = await aesEncrypt(await pairKey(myPrivate, theirPublicB64), raw);
  return `${s.iv}.${s.ct}`;
}

export async function unwrapGroupKey(wrapped: string, myPrivate: CryptoKey, wrapperPublicB64: string) {
  const [iv, ct] = wrapped.split(".");
  return aesDecrypt(await pairKey(myPrivate, wrapperPublicB64), iv, ct);
}

export const importGroupKey = (raw: Uint8Array) => subtle().importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);

export async function encryptMessage(groupKey: CryptoKey, text: string) {
  const s = await aesEncrypt(groupKey, enc.encode(JSON.stringify({ t: text })));
  return { iv: s.iv, ciphertext: s.ct };
}

export async function decryptMessage(groupKey: CryptoKey, iv: string, ciphertext: string) {
  try {
    return (JSON.parse(dec.decode(await aesDecrypt(groupKey, iv, ciphertext))) as { t: string }).t;
  } catch {
    return null;
  }
}

// The unlocked private key lives in IndexedDB as a non-extractable CryptoKey.
const DB = "friend-stocks-keys";
function idb() {
  return new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("keys");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function saveIdentity(userId: number, key: CryptoKey) {
  const db = await idb();
  await new Promise((res, rej) => {
    const tx = db.transaction("keys", "readwrite");
    tx.objectStore("keys").put(key, `identity:${userId}`);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}
export async function loadIdentity(userId: number): Promise<CryptoKey | null> {
  try {
    const db = await idb();
    return await new Promise((res) => {
      const r = db.transaction("keys").objectStore("keys").get(`identity:${userId}`);
      r.onsuccess = () => res((r.result as CryptoKey) ?? null);
      r.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}
export async function forgetIdentities() {
  try {
    const db = await idb();
    db.transaction("keys", "readwrite").objectStore("keys").clear();
  } catch {}
}

export const randomSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));
