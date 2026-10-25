import { NextRequest, NextResponse } from "next/server";
import { REFERRAL_CODE, REF_COOKIE } from "@/lib/referrals";
import { keepDevice } from "@/lib/sessions";

// A friend's invite link: remember whose it is for the sign-up, then show the normal sign-up screen.
// Someone already signed in just lands in the app; an invite only counts for a brand-new account.
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const res = NextResponse.redirect(new URL("/", req.url));
  if (REFERRAL_CODE.test(code)) {
    res.cookies.set(REF_COOKIE, code, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 7 * 86_400,
    });
  }
  keepDevice(req, res);
  return res;
}
