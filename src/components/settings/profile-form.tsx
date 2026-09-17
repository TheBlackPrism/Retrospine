"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/settings/form-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateProfileAction } from "@/lib/actions/settings";
import { idleState } from "@/lib/actions/state";
import { AUTOMATIC_LANGUAGE, LANGUAGES, languageLabel } from "@/lib/languages";

export function ProfileForm({
  name,
  username,
  email,
  preferredLanguage,
  browserLanguage,
}: {
  name: string;
  username: string | null;
  email: string;
  /** ISO 639-1 code chosen by the reader, or null to follow the browser. */
  preferredLanguage: string | null;
  /** What the browser currently asks for, shown next to the automatic option. */
  browserLanguage: string | null;
}) {
  const [state, action, pending] = useActionState(updateProfileAction, idleState);
  const browserLabel = languageLabel(browserLanguage);
  return (
    <form action={action} className="space-y-4">
      <FormStatus state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="profile-name">Name</Label>
          <Input id="profile-name" name="name" defaultValue={name} required className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-username">Username</Label>
          <Input
            id="profile-username"
            name="username"
            defaultValue={username ?? ""}
            autoCapitalize="none"
            autoCorrect="off"
            required
            className="h-11"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-email">E-mail</Label>
        <Input id="profile-email" value={email} readOnly disabled className="h-11" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-language">Preferred language</Label>
        <Select name="preferredLanguage" defaultValue={preferredLanguage ?? AUTOMATIC_LANGUAGE}>
          <SelectTrigger id="profile-language" className="h-11 w-full">
            <SelectValue placeholder="Choose a language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AUTOMATIC_LANGUAGE}>
              {browserLabel ? `Follow my browser (${browserLabel})` : "Follow my browser"}
            </SelectItem>
            {LANGUAGES.map((language) => (
              <SelectItem key={language.code} value={language.code}>
                {language.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          When a search finds several editions of a book, the one in this language is shown.
        </p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
