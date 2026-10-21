// Reference solution for task validation. Harbor does not expose this to the evaluated agent.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const origin = process.env.SIA_RL_PORTAL_ORIGIN ?? 'http://portal:8000';
const answerPath = process.env.SIA_RL_ANSWER_PATH ?? '/workspace/answer.json';
const get = async (path) => {
  const response = await fetch(`${origin}${path}`);
  if (!response.ok) throw new Error(`Portal returned ${response.status} for ${path}`);
  return response.text();
};

const courseList = await get('/courses');
const slugs = [...courseList.matchAll(/href="\/courses\/([a-z]+-\d+)"/g)].map(
  (match) => match[1],
);
const courses = [];
for (const slug of new Set(slugs)) {
  const peoplePath = `/courses/${slug}/people`;
  const people = await get(peoplePath);
  const code = slug.toUpperCase();
  const listed = [
    ...people.matchAll(/<li><strong>([^<]+)<\/strong> — (Professor|Co-instructor)<\/li>/g),
  ].map((match) => match[1]);
  if (listed.length) {
    courses.push({ code, instructors: listed, source_path: peoplePath });
    continue;
  }
  const syllabusPath = `/courses/${slug}/syllabus`;
  const syllabus = await get(syllabusPath);
  const instructor = syllabus.match(/Instructor: (Dr\. [A-Za-z ]+)\./)?.[1];
  if (!instructor) throw new Error(`No instructor found for ${code}`);
  courses.push({ code, instructors: [instructor], source_path: syllabusPath });
}
await mkdir(dirname(answerPath), { recursive: true });
await writeFile(answerPath, JSON.stringify({ term: 'Fall 2026', courses }));
