"use client";
import { ProfilePhoto } from "@/components/profile-photo";
import { Section, SettingsPage } from "@/components/settings";

export default function PhotoPage() {
  return (
    <SettingsPage title="Photo">
      <Section note="Friends see it next to your messages, trades and on your profile link. Tap it to pick a new one.">
        <ProfilePhoto size={72} withHelp />
      </Section>
    </SettingsPage>
  );
}
