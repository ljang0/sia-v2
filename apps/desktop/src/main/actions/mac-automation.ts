import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseActionArguments, type ActionExecutionResult } from '@sia/action-gateway';
const exec = promisify(execFile);

// Fixed JXA program, using Apple events as Notch does. All model/user strings
// arrive as JSON argv data; no interpolation into source, eval, or shell.
export const MAC_AUTOMATION_SCRIPT = `function run(argv) {
  var input = JSON.parse(argv[0]);
  var op = input.operation;
  function exact(items, id, property) {
    var found = items.filter(function(item) { return item[property || 'id']() === id; });
    if (found.length !== 1) throw new Error('Target changed. List the app again.');
    return found[0];
  }
  if (op === 'finder_selection') {
    return JSON.stringify(Application('com.apple.finder').selection().slice(0, 50).map(function(item) {
      return { name: item.name(), kind: item.kind() };
    }));
  }
  if (op.indexOf('calendar_') === 0) {
    var calendar = Application('com.apple.iCal');
    var calendars = calendar.calendars();
    if (op === 'calendar_list') return JSON.stringify(calendars.slice(0, 100).map(function(c) { return { id: c.calendarIdentifier(), name: c.name(), writable: c.writable() }; }));
    var target = exact(calendars, input.calendar, 'calendarIdentifier');
    var start = new Date(input.start), end = new Date(input.end);
    if (op === 'calendar_events') {
      return JSON.stringify(target.events.whose({startDate: {_greaterThanEquals: start, _lessThan: end}})().slice(0, 100).map(function(e) {
        return { id: e.uid(), title: e.summary(), start: e.startDate().toISOString(), end: e.endDate().toISOString() };
      }));
    }
    if (!target.writable()) throw new Error('Calendar is read-only.');
    var event = calendar.Event({summary: input.title, startDate: start, endDate: end});
    target.events.push(event);
    return JSON.stringify({ id: event.uid(), title: event.summary(), start: event.startDate().toISOString(), end: event.endDate().toISOString() });
  }
  var reminders = Application('com.apple.reminders');
  var lists = reminders.lists();
  if (op === 'reminders_lists') return JSON.stringify(lists.slice(0, 100).map(function(l) { return { id: l.id(), name: l.name() }; }));
  var list = exact(lists, input.list);
  if (op === 'reminders_list') return JSON.stringify(list.reminders.whose({completed: false})().slice(0, 100).map(function(r) { return { id: r.id(), title: r.name() }; }));
  var reminder = reminders.Reminder({name: input.title});
  list.reminders.push(reminder);
  return JSON.stringify({id: reminder.id(), title: reminder.name()});
}`;

export async function runMacAutomation(
  args: unknown,
  signal?: AbortSignal,
  run = async (input: string): Promise<string> => {
    const { stdout } = await exec(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', '-e', MAC_AUTOMATION_SCRIPT, input],
      { timeout: 30_000, maxBuffer: 256 * 1024, signal, env: { PATH: '/usr/bin:/bin' } },
    );
    return stdout;
  },
): Promise<ActionExecutionResult> {
  const input = parseActionArguments('mac_automation', args);
  if (signal?.aborted) throw new Error('Mac action cancelled.');
  try {
    const data: unknown = JSON.parse(await run(JSON.stringify(input)));
    return {
      outcome: 'verified',
      summary: `Completed ${input.operation.replaceAll('_', ' ')}.`,
      data,
      verification: { evidence: 'Read back the native app object through Apple events.' },
    };
  } catch {
    // osascript errors can contain input data. Never return the command or stderr.
    return {
      outcome: input.operation.endsWith('_create') ? 'accepted_unverified' : 'refused',
      summary:
        'The Mac app did not confirm the result. Check System Settings → Privacy & Security → Automation for Sia, if access is missing. The app may also be unavailable or the target may have changed. Read the app state before retrying. Do not repeat a create operation until you have checked whether it already happened.',
    };
  }
}
