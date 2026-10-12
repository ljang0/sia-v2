import type { Fetch } from './oauth.js';
import { ConnectorRequestError, jsonRequest } from './http.js';
import { truncate } from './outlook.js';

const API = 'https://api.github.com';
export const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
export const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
/** `repo` is GitHub's only OAuth scope that reaches private repositories, issues, and PRs. */
export const GITHUB_SCOPES = ['repo', 'read:user'];

type Input = Record<string, unknown>;

const headers = { 'x-github-api-version': '2022-11-28' };

export async function githubAccount(fetchImpl: Fetch, token: string): Promise<string> {
  const user = (await jsonRequest(fetchImpl, `${API}/user`, token, { headers })) as Input;
  if (typeof user.login !== 'string') throw new Error('GitHub did not return an account.');
  return user.login;
}

export async function runGithubTool(
  fetchImpl: Fetch,
  token: string,
  tool: string,
  input: Input,
  signal?: AbortSignal,
): Promise<unknown> {
  const request = (path: string, init: { method?: string; body?: unknown } = {}) =>
    jsonRequest(fetchImpl, `${API}${path}`, token, {
      ...init,
      headers,
      ...(signal ? { signal } : {}),
    });
  const repo = String(input.repo ?? '');
  const number = Number(input.number);
  switch (tool) {
    case 'github_search': {
      const kind = input.kind as 'code' | 'issues' | 'repositories';
      const params = new URLSearchParams({
        q: String(input.query),
        per_page: String(input.limit ?? 20),
      });
      const body = (await request(`/search/${kind}?${params}`)) as {
        total_count?: number;
        items?: Input[];
      };
      const items = (body.items ?? []).map((item) =>
        kind === 'code'
          ? {
              repo: (item.repository as Input | undefined)?.full_name,
              path: item.path,
              url: item.html_url,
            }
          : kind === 'issues'
            ? {
                repo: String(item.repository_url ?? '').replace(`${API}/repos/`, ''),
                number: item.number,
                title: item.title,
                state: item.state,
                pullRequest: Boolean(item.pull_request),
                author: (item.user as Input | undefined)?.login,
                updated: item.updated_at,
                url: item.html_url,
              }
            : {
                repo: item.full_name,
                description: item.description,
                private: item.private,
                defaultBranch: item.default_branch,
                url: item.html_url,
              },
      );
      return { total: body.total_count, items };
    }
    case 'github_read_file': {
      const path = String(input.path ?? '')
        .split('/')
        .filter(Boolean)
        .map(encodeURIComponent)
        .join('/');
      const ref = typeof input.ref === 'string' ? `?ref=${encodeURIComponent(input.ref)}` : '';
      const body = await request(`/repos/${repo}/contents/${path}${ref}`);
      if (Array.isArray(body)) {
        return {
          entries: body.map((entry: Input) => ({
            name: entry.name,
            type: entry.type,
            path: entry.path,
          })),
        };
      }
      const file = body as Input;
      if (file.type !== 'file' || typeof file.content !== 'string') {
        return { path: file.path, type: file.type, url: file.html_url };
      }
      const content = Buffer.from(file.content, 'base64');
      if (content.includes(0)) {
        return { path: file.path, size: file.size, binary: true, url: file.html_url };
      }
      return {
        path: file.path,
        url: file.html_url,
        content: truncate(content.toString('utf8'), 200_000),
      };
    }
    case 'github_read_issue': {
      const issue = (await request(`/repos/${repo}/issues/${number}`)) as Input;
      const comments = (await request(
        `/repos/${repo}/issues/${number}/comments?per_page=50`,
      )) as Input[];
      const summary = {
        number: issue.number,
        title: issue.title,
        state: issue.state,
        author: (issue.user as Input | undefined)?.login,
        labels: ((issue.labels as Input[] | undefined) ?? []).map((label) => label.name),
        body: truncate(String(issue.body ?? ''), 50_000),
        url: issue.html_url,
        comments: comments.map((comment) => ({
          author: (comment.user as Input | undefined)?.login,
          created: comment.created_at,
          body: truncate(String(comment.body ?? ''), 10_000),
        })),
      };
      if (!issue.pull_request) return summary;
      const pull = (await request(`/repos/${repo}/pulls/${number}`)) as Input;
      const files = (await request(
        `/repos/${repo}/pulls/${number}/files?per_page=100`,
      )) as Input[];
      return {
        ...summary,
        pullRequest: {
          head: (pull.head as Input | undefined)?.label,
          base: (pull.base as Input | undefined)?.ref,
          draft: pull.draft,
          merged: pull.merged,
          mergeable: pull.mergeable,
          files: files.map((file) => ({
            path: file.filename,
            status: file.status,
            additions: file.additions,
            deletions: file.deletions,
          })),
        },
      };
    }
    case 'github_create_issue': {
      const issue = (await request(`/repos/${repo}/issues`, {
        method: 'POST',
        body: {
          title: input.title,
          ...(input.body === undefined ? {} : { body: input.body }),
          ...(input.labels === undefined ? {} : { labels: input.labels }),
        },
      })) as Input;
      return { number: issue.number, url: issue.html_url };
    }
    case 'github_comment': {
      const comment = (await request(`/repos/${repo}/issues/${number}/comments`, {
        method: 'POST',
        body: { body: input.body },
      })) as Input;
      return { url: comment.html_url };
    }
    case 'github_create_pull_request': {
      const pull = (await request(`/repos/${repo}/pulls`, {
        method: 'POST',
        body: {
          title: input.title,
          head: input.head,
          base: input.base,
          ...(input.body === undefined ? {} : { body: input.body }),
          ...(input.draft === undefined ? {} : { draft: input.draft }),
        },
      })) as Input;
      return { number: pull.number, url: pull.html_url };
    }
    default:
      throw new ConnectorRequestError(400, `Unknown GitHub tool ${tool}.`);
  }
}
