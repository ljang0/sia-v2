import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

/** Disposable account/session fixture. No real logins or credentials are used. */
export async function startBackgroundCampus() {
  const cookie = `sia_fixture_${randomUUID().replaceAll('-', '')}`;
  const session = randomUUID();
  const visited: string[] = [];
  const events: {
    title: string;
    date: string;
    time: string;
    minutes: number;
    account: string;
  }[] = [];
  const monday = new Date();
  monday.setUTCHours(12, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const day = (offset: number) => {
    const value = new Date(monday);
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  };
  const assignments = [
    { course: 'COMP-141', title: 'Graph lab', due: day(2), status: 'Not submitted' },
    { course: 'COMP-141', title: 'Proof exercise', due: day(4), status: 'Submitted' },
    { course: 'STAT-208', title: 'Sampling notebook', due: day(5), status: 'Not submitted' },
  ];
  const instructors = [
    { course: 'COMP-141', names: ['Dr. Lena Hart'] },
    { course: 'STAT-208', names: ['Dr. Owen Vale', 'Dr. Sora Chen'] },
  ];
  const server = createServer(async (request, response) => {
    const path = new URL(request.url!, 'http://fixture').pathname;
    if (path === '/prepare') {
      response.writeHead(302, {
        'Set-Cookie': `${cookie}=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800`,
        Location: '/work',
      });
      response.end();
      return;
    }
    if (path === '/cleanup') {
      response.writeHead(200, {
        'Set-Cookie': `${cookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
      });
      response.end('Disposable session ended.');
      return;
    }
    const signedIn = request.headers.cookie?.split('; ').includes(`${cookie}=${session}`);
    const personal = path.startsWith('/personal');
    const account = personal
      ? 'Personal · Meadow Club'
      : 'Alder University · Student work account';
    if (request.method === 'POST') {
      if (!signedIn || path !== '/work/calendar') {
        response.writeHead(403).end('No authorized test session.');
        return;
      }
      let body = '';
      for await (const chunk of request) {
        body += String(chunk);
        if (body.length > 8192) {
          response.writeHead(413).end();
          return;
        }
      }
      const fields = new URLSearchParams(body);
      const title = fields.get('title') ?? '';
      const date = fields.get('date') ?? '';
      const time = fields.get('time') ?? '';
      const minutes = Number(fields.get('minutes'));
      if (
        !title ||
        title.length > 120 ||
        /[<>\r\n]/.test(title) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !/^\d{2}:\d{2}$/.test(time) ||
        !Number.isInteger(minutes) ||
        minutes < 5 ||
        minutes > 240
      ) {
        response.writeHead(422).end('Invalid event.');
        return;
      }
      events.push({ title, date, time, minutes, account: 'Student work' });
      response.writeHead(303, { Location: '/work/calendar' }).end();
      return;
    }
    let content: string;
    if (!signedIn) {
      content =
        '<h1>Sign in required</h1><p>This browser has no disposable test session. Do not attempt to sign in.</p>';
    } else {
      visited.push(path);
      if (path === '/accounts') {
        content =
          '<h1>Your accounts</h1><p><a href="/work">Alder University · Student work account</a></p><p><a href="/personal">Meadow Club · Personal</a></p>';
      } else if (personal) {
        content =
          '<h1>Home</h1><p>Meadow Club courses: GARDEN-101. Instructor: Dr. Rowan Oldfield.</p><p>No university coursework is available in this account.</p>';
      } else if (path === '/work' || path === '/') {
        content =
          '<h1>Home</h1><p>Fall 2026 · Alder University</p><p>Overview: only calendar events appear here.</p><a href="/work/courses">Current courses</a>';
      } else if (path === '/work/courses') {
        content =
          '<h1>All current courses · Fall 2026</h1><p><a href="/work/courses/comp-141">COMP-141 · Computation</a></p><p><a href="/work/courses/stat-208">STAT-208 · Statistics</a></p><p><a href="/work/archive">Earlier terms</a></p>';
      } else if (path === '/work/calendar') {
        content = `<h1>Calendar · Student work</h1><p>Only scheduled events appear here; course modules may contain additional work.</p><p>Graph lab · ${day(2)} · COMP-141</p><p>Old course instructor: Dr. Rowan Oldfield (Spring 2026).</p><a href="/work/calendar/new">Add event</a><h2>Saved events</h2>${events.length ? events.map((event) => `<p>${event.title} · ${event.date} · ${event.time} UTC · ${event.minutes} minutes · Student work</p>`).join('') : '<p>No saved events.</p>'}`;
      } else if (path === '/work/calendar/new') {
        content =
          '<h1>New event · Student work</h1><form method="post" action="/work/calendar"><p><label>Event title <input name="title" required></label></p><p><label>Date (YYYY-MM-DD) <input name="date" required></label></p><p><label>Time (HH:MM, UTC) <input name="time" required></label></p><p><label>Duration in minutes <input name="minutes" value="30" required></label></p><button type="submit">Create event</button></form>';
      } else if (path === '/work/archive') {
        content = '<h1>Spring 2026 archive</h1><p>COMP-141 instructor: Dr. Rowan Oldfield</p>';
      } else if (/^\/work\/courses\/(comp-141|stat-208)(?:\/[^/]+)?$/.test(path)) {
        const [, , , slug, section] = path.split('/');
        const code = slug === 'comp-141' ? 'COMP-141' : 'STAT-208';
        content = `<h1>${code} · Fall 2026</h1><nav><a href="/work/courses/${slug}/people">People</a> · <a href="/work/courses/${slug}/syllabus">Syllabus</a> · <a href="/work/courses/${slug}/assignments">Assignments</a> · <a href="/work/courses/${slug}/modules">Modules</a></nav>`;
        if (section === 'people')
          content +=
            slug === 'comp-141'
              ? '<h2>Teaching team</h2><p>Dr. Lena Hart · Professor</p><p>Alex Reed · Teaching Assistant</p>'
              : '<h2>Teaching team</h2><p>Jules Bell · Teaching Assistant</p><p>Current instructors are listed in the Syllabus.</p>';
        else if (section === 'syllabus')
          content +=
            slug === 'stat-208'
              ? '<h2>Syllabus</h2><p>Co-instructors: Dr. Owen Vale and Dr. Sora Chen.</p><p>Coursework is posted in Modules; the Assignments page may be empty.</p>'
              : '<h2>Syllabus</h2><p>Professor: Dr. Lena Hart. All required coursework is listed under Assignments.</p>';
        else if (section === 'assignments')
          content +=
            slug === 'comp-141'
              ? assignments
                  .filter((item) => item.course === code)
                  .map(
                    (item, index) =>
                      `<p><a href="/work/items/${index}">${item.title}</a> · Due ${item.due} · ${item.status}</p>`,
                  )
                  .join('')
              : '<p>No items in this view. See Modules for the weekly coursework.</p>';
        else if (section === 'modules')
          content +=
            slug === 'stat-208'
              ? `<h2>Weekly module</h2><p><a href="/work/items/2">Sampling notebook</a> · Due ${day(5)}</p>`
              : '<h2>Weekly module</h2><p>All required work is linked under Assignments.</p>';
      } else if (/^\/work\/items\/[0-2]$/.test(path)) {
        const item = assignments[Number(path.at(-1))]!;
        content = `<h1>${item.title}</h1><p>Course: ${item.course}</p><p>Due: ${item.due} at 12:00 UTC</p><p>Status: ${item.status}</p>`;
      } else {
        content = '<h1>Not found</h1><p>Use the actual navigation links.</p>';
      }
    }
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Home · Sia Background Lab</title><style>body{font:17px system-ui;max-width:760px;margin:36px auto;line-height:1.6;padding:0 24px}a{display:inline-block;margin:8px 12px 8px 0}header{border-bottom:1px solid #ccc;padding-bottom:12px}h1{font-size:26px}</style></head><body><header><strong>${signedIn ? account : 'Session unavailable'}</strong> · <a href="/accounts">Switch account</a></header><nav><a href="/work">Home</a><a href="/work/courses">Courses</a><a href="/work/calendar">Calendar</a></nav><main>${content}</main></body></html>`,
    );
  });
  await new Promise<void>((accept) => server.listen(0, '127.0.0.1', accept));
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    visited,
    events,
    instructors,
    assignments,
    week: { first: day(0), last: day(6) },
    close: () =>
      new Promise<void>((accept, reject) =>
        server.close((error) => (error ? reject(error) : accept())),
      ),
  };
}
