import type { Fetch } from './oauth.js';
import { ConnectorRequestError, jsonRequest } from './http.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
export const MICROSOFT_AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
/** Delegated Graph scopes. Mail.ReadWrite covers drafts, moves, and flags; Mail.Send sends. */
export const MICROSOFT_SCOPES = ['offline_access', 'User.Read', 'Mail.ReadWrite', 'Mail.Send'];

const MESSAGE_FIELDS =
  'id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,isRead,flag,bodyPreview,webLink,parentFolderId';

type Input = Record<string, unknown>;

export async function outlookAccount(fetchImpl: Fetch, token: string): Promise<string> {
  const me = await jsonRequest(fetchImpl, `${GRAPH}/me?$select=mail,userPrincipalName`, token);
  const account = (me as Input).mail ?? (me as Input).userPrincipalName;
  if (typeof account !== 'string' || !account) {
    throw new Error('Microsoft did not return an email address for this account.');
  }
  return account;
}

export async function runOutlookTool(
  fetchImpl: Fetch,
  token: string,
  tool: string,
  input: Input,
  signal?: AbortSignal,
): Promise<unknown> {
  const request = (path: string, init: { method?: string; body?: unknown } = {}) =>
    jsonRequest(fetchImpl, `${GRAPH}${path}`, token, {
      ...init,
      headers: { Prefer: 'outlook.body-content-type="text"' },
      ...(signal ? { signal } : {}),
    });
  const id = (value: unknown) => encodeURIComponent(String(value));
  switch (tool) {
    case 'outlook_search': {
      const params = new URLSearchParams({
        $top: String(input.limit ?? 20),
        $select: MESSAGE_FIELDS,
      });
      const query = typeof input.query === 'string' ? input.query : undefined;
      // Graph does not allow $search with $orderby or $filter; search results are relevance-ranked.
      if (query) params.set('$search', `"${query.replaceAll('"', '')}"`);
      else {
        params.set('$orderby', 'receivedDateTime desc');
        // Graph requires the $orderby property to lead the $filter for messages.
        if (input.unread_only) {
          params.set('$filter', 'receivedDateTime ge 1900-01-01T00:00:00Z and isRead eq false');
        }
      }
      const folder =
        typeof input.folder === 'string' ? input.folder : query ? undefined : 'inbox';
      const path = folder ? `/me/mailFolders/${folder}/messages` : '/me/messages';
      const body = (await request(`${path}?${params}`)) as { value?: Input[] };
      const messages = (body.value ?? []).map(summarizeMessage);
      return {
        messages:
          query && input.unread_only ? messages.filter((message) => !message.isRead) : messages,
      };
    }
    case 'outlook_read': {
      const message = (await request(
        `/me/messages/${id(input.resource_id)}?$select=${MESSAGE_FIELDS},body`,
      )) as Input;
      const body = message.body as { content?: string } | undefined;
      return { ...summarizeMessage(message), body: truncate(body?.content ?? '', 100_000) };
    }
    case 'outlook_create_draft': {
      const draft = (await request('/me/messages', {
        method: 'POST',
        body: outgoingMessage(input),
      })) as Input;
      return { id: draft.id, webLink: draft.webLink };
    }
    case 'outlook_send':
      await request('/me/sendMail', {
        method: 'POST',
        body: { message: outgoingMessage(input), saveToSentItems: true },
      });
      return { sent: true };
    case 'outlook_reply':
      await request(
        `/me/messages/${id(input.resource_id)}/${input.reply_all ? 'replyAll' : 'reply'}`,
        {
          method: 'POST',
          body: { comment: input.body },
        },
      );
      return { sent: true };
    case 'outlook_move': {
      const moved = (await request(`/me/messages/${id(input.resource_id)}/move`, {
        method: 'POST',
        body: { destinationId: input.destination },
      })) as Input;
      return { id: moved.id, folder: input.destination };
    }
    case 'outlook_mark': {
      const patch: Input = {};
      if (typeof input.read === 'boolean') patch.isRead = input.read;
      if (typeof input.flagged === 'boolean') {
        patch.flag = { flagStatus: input.flagged ? 'flagged' : 'notFlagged' };
      }
      await request(`/me/messages/${id(input.resource_id)}`, { method: 'PATCH', body: patch });
      return { updated: true };
    }
    default:
      throw new ConnectorRequestError(400, `Unknown Outlook tool ${tool}.`);
  }
}

function outgoingMessage(input: Input): Input {
  const recipients = (value: unknown) =>
    Array.isArray(value) ? value.map((address) => ({ emailAddress: { address } })) : [];
  return {
    subject: input.subject,
    body: { contentType: 'Text', content: input.body },
    toRecipients: recipients(input.to),
    ...(Array.isArray(input.cc) && input.cc.length
      ? { ccRecipients: recipients(input.cc) }
      : {}),
  };
}

function summarizeMessage(message: Input) {
  const address = (value: unknown) => {
    const email = (value as { emailAddress?: { name?: string; address?: string } } | undefined)
      ?.emailAddress;
    return email
      ? email.name
        ? `${email.name} <${email.address}>`
        : email.address
      : undefined;
  };
  const list = (value: unknown) => (Array.isArray(value) ? value.map(address) : []);
  return {
    id: message.id as string,
    conversationId: message.conversationId,
    subject: message.subject,
    from: address(message.from),
    to: list(message.toRecipients),
    cc: list(message.ccRecipients),
    received: message.receivedDateTime,
    isRead: message.isRead === true,
    flagged: (message.flag as { flagStatus?: string } | undefined)?.flagStatus === 'flagged',
    preview: message.bodyPreview,
    webLink: message.webLink,
  };
}

export function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}\n…[truncated]` : value;
}
