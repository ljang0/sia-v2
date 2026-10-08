"""Synthetic, read-only course portal for a computer-use evaluation task."""

from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse


CURRENT = {
    "cs-122": {
        "code": "CS-122",
        "title": "Principles of Computation",
        "people": [
            ("Dr. Mira Solis", "Professor"),
            ("Alex Kim", "Teaching Assistant"),
        ],
        "syllabus": "Course policies and assessment details. See People for the instructor.",
    },
    "math-241": {
        "code": "MATH-241",
        "title": "Discrete Structures",
        "people": [("Riley Chen", "Teaching Assistant")],
        "syllabus": "Instructor: Dr. Elias Rowan. Office hours: Thursdays by appointment.",
    },
    "stat-219": {
        "code": "STAT-219",
        "title": "Statistical Modeling",
        "people": [
            ("Dr. Priya Nair", "Co-instructor"),
            ("Dr. Theo Mercer", "Co-instructor"),
            ("Jordan Bell", "Teaching Assistant"),
        ],
        "syllabus": "The teaching team is listed on People.",
    },
}


def page(title: str, content: str) -> bytes:
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)} · Alder Campus</title>
<style>body{{font:17px system-ui;line-height:1.5;max-width:820px;margin:3rem auto;padding:0 1rem;color:#202638}}
nav a{{margin-right:1rem}}a{{color:#145d82}}.card{{padding:1rem;margin:1rem 0;border:1px solid #ccd5df;border-radius:12px}}
small{{color:#586779}}li{{margin:.5rem 0}}</style></head><body>
<nav><a href="/">Dashboard</a><a href="/courses">Courses</a><a href="/calendar">Calendar</a></nav>
<main><h1>{escape(title)}</h1>{content}</main></body></html>""".encode("utf-8")


def current_courses() -> str:
    cards = "".join(
        f'<div class="card"><h2><a href="/courses/{slug}">{entry["code"]}: {escape(entry["title"])}</a></h2>'
        '<small>Fall 2026 · Active</small></div>'
        for slug, entry in CURRENT.items()
    )
    return '<p>Current term: Fall 2026. Open each course for its teaching team.</p>' + cards + (
        '<p><a href="/archive/spring-2026">Past terms and archived courses</a></p>'
    )


def course_page(slug: str, subpage: str) -> tuple[str, str] | None:
    entry = CURRENT.get(slug)
    if entry is None:
        return None
    title = f'{entry["code"]}: {entry["title"]}'
    links = f'<p><a href="/courses/{slug}/people">People</a> · <a href="/courses/{slug}/syllabus">Syllabus</a></p>'
    if subpage == "":
        return title, '<p>Fall 2026 · Active course</p>' + links
    if subpage == "people":
        people = "".join(
            f'<li><strong>{escape(name)}</strong> — {escape(role)}</li>'
            for name, role in entry["people"]
        )
        return title + " · People", links + '<h2>Teaching team</h2><ul>' + people + "</ul>"
    if subpage == "syllabus":
        return title + " · Syllabus", links + f'<h2>Syllabus</h2><p>{escape(entry["syllabus"])}</p>'
    return None


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path == "/healthz":
            body, status, content_type = b"ok", 200, "text/plain"
        elif path == "/":
            body, status, content_type = page(
                "Dashboard",
                '<p>Welcome to Alder Campus. Your current courses are under <a href="/courses">Courses</a>.</p>'
                '<p>The calendar shows only scheduled events, not the full teaching team.</p>',
            ), 200, "text/html; charset=utf-8"
        elif path == "/courses":
            body, status, content_type = page("My Courses", current_courses()), 200, "text/html; charset=utf-8"
        elif path == "/calendar":
            body, status, content_type = page(
                "Calendar",
                '<p>Some events still show Dr. Dana Moss, who taught MATH-241 in Spring 2026.</p>'
                '<p>Only CS-122 and STAT-219 have calendar events this week.</p>',
            ), 200, "text/html; charset=utf-8"
        elif path == "/archive/spring-2026":
            body, status, content_type = page(
                "Spring 2026 archive",
                '<div class="card"><h2>CS-122</h2><p>Former instructor: Dr. Wren Hale</p></div>'
                '<div class="card"><h2>MATH-241</h2><p>Former instructor: Dr. Dana Moss</p></div>',
            ), 200, "text/html; charset=utf-8"
        elif path.startswith("/courses/"):
            parts = path.split("/")
            match = course_page(parts[2], parts[3] if len(parts) == 4 else "") if len(parts) in (3, 4) else None
            if match:
                body, status, content_type = page(*match), 200, "text/html; charset=utf-8"
            else:
                body, status, content_type = page("Not found", "<p>No current course exists here.</p>"), 404, "text/html; charset=utf-8"
        else:
            body, status, content_type = page("Not found", "<p>No page exists here.</p>"), 404, "text/html; charset=utf-8"
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
