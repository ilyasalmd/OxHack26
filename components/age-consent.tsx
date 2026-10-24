"use client";
import Link from "next/link";

/**
 * The required 18+ box for sign-up. Place it in any sign-up form, keep the create button disabled until
 * `checked`, and send `ageConfirmed: true` in the request body.
 */
export function AgeConsent({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-left text-sm text-mute">
      <input type="checkbox" required checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-white" />
      <span>
        I&apos;m 18 or over and I understand coins are play money with no cash value. I agree to the{" "}
        <Link href="/terms" target="_blank" className="text-white underline underline-offset-2">Terms</Link> and{" "}
        <Link href="/privacy" target="_blank" className="text-white underline underline-offset-2">Privacy notice</Link>.
      </span>
    </label>
  );
}
