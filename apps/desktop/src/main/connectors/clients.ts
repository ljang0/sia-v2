/**
 * Public OAuth client ids for the apps Sia signs in to from this Mac. These are public-client
 * identifiers (PKCE or device flow, no client secret), so they are safe to ship in the app.
 * Leave a value empty until its app registration exists; that app then shows as unavailable.
 */
export const LOCAL_CONNECTOR_CLIENT_IDS = {
  /** Microsoft Entra app: "Accounts in any organizational directory and personal Microsoft accounts", public client, redirect http://localhost. */
  microsoft: '',
  /** GitHub OAuth app with Device Flow enabled. */
  github: '',
} as const;

export interface LocalConnectorClients {
  microsoft?: string;
  github?: string;
}

/** Development builds may supply registrations through the environment. */
export function localConnectorClients(options: {
  packaged: boolean;
  environment: { SIA_MICROSOFT_CLIENT_ID?: string; SIA_GITHUB_CLIENT_ID?: string };
}): LocalConnectorClients {
  const valid = (value: string | undefined) =>
    value && /^[A-Za-z0-9._-]{8,128}$/.test(value) ? value : undefined;
  const microsoft =
    valid(LOCAL_CONNECTOR_CLIENT_IDS.microsoft) ??
    (options.packaged ? undefined : valid(options.environment.SIA_MICROSOFT_CLIENT_ID));
  const github =
    valid(LOCAL_CONNECTOR_CLIENT_IDS.github) ??
    (options.packaged ? undefined : valid(options.environment.SIA_GITHUB_CLIENT_ID));
  return { ...(microsoft ? { microsoft } : {}), ...(github ? { github } : {}) };
}
