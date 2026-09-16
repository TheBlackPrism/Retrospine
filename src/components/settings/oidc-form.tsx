"use client";

import { Copy } from "lucide-react";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { FormStatus } from "@/components/settings/form-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveOidcSettingsAction } from "@/lib/actions/settings";
import { idleState } from "@/lib/actions/state";

export type OidcFormValues = {
  enabled: boolean;
  label: string;
  issuer: string;
  clientId: string;
  scopes: string;
  pkce: boolean;
  allowSignup: boolean;
  hasSecret: boolean;
};

function SwitchRow({
  id,
  name,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  name: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border/70 bg-background/60 p-4">
      <div>
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <input type="hidden" name={name} value={checked ? "on" : "off"} />
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function OidcForm({
  values,
  redirectUri,
}: {
  values: OidcFormValues;
  redirectUri: string;
}) {
  const [state, action, pending] = useActionState(saveOidcSettingsAction, idleState);
  const [enabled, setEnabled] = useState(values.enabled);
  const [pkce, setPkce] = useState(values.pkce);
  const [allowSignup, setAllowSignup] = useState(values.allowSignup);

  async function copyRedirect() {
    try {
      await navigator.clipboard.writeText(redirectUri);
      toast.success("Redirect URI copied");
    } catch {
      toast.error("Could not copy. Select the text instead.");
    }
  }

  return (
    <form action={action} className="space-y-5">
      <FormStatus state={state} />

      <SwitchRow
        id="oidc-enabled"
        name="enabled"
        label="Enable single sign-on"
        description="Shows a sign-in button for your identity provider on the login page."
        checked={enabled}
        onCheckedChange={setEnabled}
      />

      <div className="space-y-1.5">
        <Label htmlFor="oidc-label">Button label</Label>
        <Input
          id="oidc-label"
          name="label"
          defaultValue={values.label}
          placeholder="e.g. Authentik, Keycloak, Company login"
          maxLength={60}
          className="h-11"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="oidc-issuer">Issuer URL</Label>
        <Input
          id="oidc-issuer"
          name="issuer"
          type="url"
          inputMode="url"
          defaultValue={values.issuer}
          placeholder="https://id.example.com/application/o/retrospine/"
          className="h-11"
        />
        <p className="text-xs text-muted-foreground">
          The discovery document is loaded from
          <code className="mx-1 rounded bg-muted px-1 py-0.5">
            {"<issuer>"}/.well-known/openid-configuration
          </code>
          when you save.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="oidc-client-id">Client ID</Label>
          <Input
            id="oidc-client-id"
            name="clientId"
            defaultValue={values.clientId}
            autoComplete="off"
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="oidc-client-secret">Client secret</Label>
          <Input
            id="oidc-client-secret"
            name="clientSecret"
            type="password"
            autoComplete="new-password"
            placeholder={values.hasSecret ? "•••••••• (stored, leave empty to keep)" : ""}
            className="h-11"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="oidc-scopes">Scopes</Label>
        <Input
          id="oidc-scopes"
          name="scopes"
          defaultValue={values.scopes}
          placeholder="openid profile email"
          className="h-11"
        />
      </div>

      <SwitchRow
        id="oidc-pkce"
        name="pkce"
        label="Use PKCE"
        description="Recommended. Disable only if your provider rejects code challenges."
        checked={pkce}
        onCheckedChange={setPkce}
      />

      <SwitchRow
        id="oidc-allow-signup"
        name="allowSignup"
        label="Allow new accounts via SSO"
        description="When off, only identities already connected to an account (or matching a verified e-mail) can sign in."
        checked={allowSignup}
        onCheckedChange={setAllowSignup}
      />

      <div className="rounded-xl border border-border/70 bg-background/60 p-4">
        <p className="text-sm font-medium">Redirect URI for your provider</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-xs">
            {redirectUri}
          </code>
          <Button type="button" size="icon-sm" variant="outline" aria-label="Copy redirect URI" onClick={copyRedirect}>
            <Copy />
          </Button>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
