#!/bin/bash
# skill: canvas-api
# description: Read active CMU Canvas courses with teachers, or one course's assignments, through a signed-in Safari tab. Use only when Canvas API reads are allowed; never for a UI-only request.
# Adapted from the user's Notch canvas-api.sh. It keeps the Safari-session fast path
# while limiting requests to the two read-only resources used by course research.
# Pages contain up to 100 records: request the next page until fewer than 100
# remain. Verify the relevant term, teaching role and course details in Canvas.
set -euo pipefail

usage() {
  echo 'Usage: canvas-api.sh courses [page] | assignments COURSE_ID [page]' >&2
  exit 2
}

case "${1:-}" in
  courses)
    [[ $# -le 2 ]] || usage
    page="${2:-1}"
    resource='/api/v1/courses?enrollment_state=active&include[]=teachers&include[]=term'
    ;;
  assignments)
    [[ $# -le 3 ]] || usage
    course_id="${2:-}"
    [[ "$course_id" =~ ^[1-9][0-9]{0,11}$ ]] || usage
    page="${3:-1}"
    resource="/api/v1/courses/$course_id/assignments?"
    ;;
  *) usage ;;
esac

[[ "$page" =~ ^[1-9][0-9]{0,3}$ ]] || usage
if [[ "$resource" == *'?' ]]; then
  endpoint="${resource}per_page=100&page=$page"
else
  endpoint="${resource}&per_page=100&page=$page"
fi

# Pass only fixed routes and validated numbers to AppleScript. Never interpolate
# a model-supplied URL or script into Safari's JavaScript context.
result=$(osascript - "$endpoint" <<'APPLESCRIPT'
on run argv
  set endpoint to item 1 of argv
  tell application "Safari"
    repeat with w in windows
      repeat with t in tabs of w
        set pageURL to URL of t
        if pageURL is "https://canvas.cmu.edu" or pageURL starts with "https://canvas.cmu.edu/" then
          set js to "(function(){var x=new XMLHttpRequest();x.open('GET','" & endpoint & "',false);x.send();if(x.status!==200)throw new Error('Canvas returned HTTP '+x.status);var body=x.responseText;if(body.indexOf('while(1);')===0)body=body.slice(9);return body;})()"
          return do JavaScript js in t
        end if
      end repeat
    end repeat
  end tell
  error "Open and sign in to canvas.cmu.edu in Safari first."
end run
APPLESCRIPT
)

# Fail closed on an authentication HTML page or unexpected response shape.
# Keep the body on stdout so the caller can inspect it or redirect it to a
# private report file; this script never opens a raw JSON browser page.
printf '%s' "$result" | node -e '
let body = "";
process.stdin.on("data", chunk => { body += chunk; if (body.length > 2_000_000) process.exit(3); });
process.stdin.on("end", () => {
  try {
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed)) throw new Error("Canvas returned an unexpected response");
    process.stdout.write(JSON.stringify(parsed) + "\n");
  } catch {
    process.stderr.write("Canvas did not return a course or assignment list.\n");
    process.exitCode = 1;
  }
});
'
