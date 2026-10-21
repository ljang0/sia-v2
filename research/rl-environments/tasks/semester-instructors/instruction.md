The campus portal is open at `http://portal:8000/`. Find the **current Fall 2026 instructors** for every course on the current Courses page. Check each course's own People or Syllabus page. The calendar may omit courses or contain old names; archived courses are not current.

Write `/workspace/answer.json` as UTF-8 JSON with exactly this shape:

```json
{
  "term": "Fall 2026",
  "courses": [
    {
      "code": "COURSE-CODE",
      "instructors": ["Dr. Full Name"],
      "source_path": "/courses/course-code/people"
    }
  ]
}
```

Include every current course once. Include all professors and co-instructors, but no TAs, department contacts, or names from an older term. `source_path` must be the current course page that supports that course's instructor list. The order of courses and names does not matter. Do not change any portal data.
