// Browser side of account changes. Passwords and recovery codes never leave the device:
// only keys derived from them are sent, as at sign-up and login.
import { api } from "./api";
import { authKeyFor, deriveKeys, deriveRecoveryKeys, makeRecoveryBundle, randomSalt, rewrapIdentity, saveIdentity, unlockIdentity } from "@/lib/e2ee";

const salts = (username: string) => api<{ salt: string; recoverySalt: string }>(`/api/auth/salt?username=${encodeURIComponent(username)}`);

/** Proves the password to the server and returns the sealed key plus the key that opens it. */
async function unlock(username: string, password: string) {
  const { salt } = await salts(username);
  const { authKey, encKey } = await deriveKeys(password, username, salt);
  const { encPrivateKey } = await api<{ encPrivateKey: string }>("/api/account/unlock", { body: { authKey } });
  return { authKey, encKey, encPrivateKey };
}

export async function changeUsername(currentUsername: string, password: string, newUsername: string) {
  const username = newUsername.trim().replace(/^@/, "").toLowerCase();
  const [oldAuthKey, newAuthKey] = await Promise.all([authKeyFor(password, currentUsername), authKeyFor(password, username)]);
  return api<{ username: string }>("/api/account/username", { body: { username, oldAuthKey, newAuthKey } });
}

/** Same identity key, sealed under the new password with a fresh salt. Signs out other devices. */
export async function changePassword(username: string, oldPassword: string, newPassword: string) {
  const old = await unlock(username, oldPassword);
  const newKeySalt = randomSalt();
  const next = await deriveKeys(newPassword, username, newKeySalt);
  const newEncPrivateKey = await rewrapIdentity(old.encPrivateKey, old.encKey, next.encKey);
  return api<{ signedOut: number }>("/api/account/password", { body: { oldAuthKey: old.authKey, newAuthKey: next.authKey, newEncPrivateKey, newKeySalt } });
}

/** Makes and uploads a new recovery code (the old one stops working). Show the result once. */
export async function makeRecoveryCode(username: string, password: string) {
  const { authKey, encKey, encPrivateKey } = await unlock(username, password);
  const bundle = await makeRecoveryBundle(encPrivateKey, encKey);
  await api("/api/account/recovery", { body: { authKey, ...bundle.upload } });
  return bundle.code;
}

/**
 * Forgot password: the recovery code opens the second sealed copy of the identity key, which
 * is re-sealed under the new password. The used code is replaced by a new one in the same
 * step, returned here to show once. Leaves this browser signed in and unlocked.
 */
export async function recoverAccount(username: string, code: string, newPassword: string) {
  const uname = username.trim().replace(/^@/, "").toLowerCase();
  const { recoverySalt } = await salts(uname);
  const rk = await deriveRecoveryKeys(code, recoverySalt);
  const r = await api<{ username: string; ticket: string; encPrivateKeyRecovery: string }>("/api/auth/recover", { body: { username: uname, recoveryAuthKey: rk.authKey } });
  const newKeySalt = randomSalt();
  const next = await deriveKeys(newPassword, r.username, newKeySalt);
  const newEncPrivateKey = await rewrapIdentity(r.encPrivateKeyRecovery, rk.encKey, next.encKey);
  const fresh = await makeRecoveryBundle(r.encPrivateKeyRecovery, rk.encKey);
  const done = await api<{ id: number; username: string }>("/api/auth/recover/reset", {
    body: { ticket: r.ticket, newAuthKey: next.authKey, newEncPrivateKey, newKeySalt, recovery: fresh.upload },
  });
  const privateKey = await unlockIdentity(newEncPrivateKey, next.encKey);
  await saveIdentity(done.id, privateKey);
  return { id: done.id, username: done.username, privateKey, recoveryCode: fresh.code };
}

export async function deleteAccount(username: string, password: string, confirm: string) {
  return api("/api/account/delete", { body: { authKey: await authKeyFor(password, username), confirm } });
}
