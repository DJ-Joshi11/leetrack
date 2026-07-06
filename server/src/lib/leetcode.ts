type ProblemListEntry = {
  number: number;
  slug: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  paidOnly: boolean;
};

let problemListCache: Map<number, ProblemListEntry> | null = null;
let slugToNumberCache: Map<string, number> | null = null;
let problemListCachedAt = 0;
const PROBLEM_LIST_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

const DIFFICULTY_BY_LEVEL: Record<number, ProblemListEntry["difficulty"]> = {
  1: "Easy",
  2: "Medium",
  3: "Hard",
};

async function loadProblemList(): Promise<Map<number, ProblemListEntry>> {
  if (problemListCache && Date.now() - problemListCachedAt < PROBLEM_LIST_TTL_MS) {
    return problemListCache;
  }

  const res = await fetch("https://leetcode.com/api/problems/all/", {
    headers: { "User-Agent": "Mozilla/5.0 (leetrack personal study app)" },
  });
  if (!res.ok) throw new Error(`LeetCode problem list fetch failed: ${res.status}`);
  const data = (await res.json()) as { stat_status_pairs?: any[] };

  const map = new Map<number, ProblemListEntry>();
  for (const pair of data.stat_status_pairs ?? []) {
    const number = pair.stat.frontend_question_id as number;
    map.set(number, {
      number,
      slug: pair.stat.question__title_slug,
      title: pair.stat.question__title,
      difficulty: DIFFICULTY_BY_LEVEL[pair.difficulty.level] ?? "Medium",
      paidOnly: Boolean(pair.paid_only),
    });
  }

  problemListCache = map;
  slugToNumberCache = new Map([...map.values()].map((e) => [e.slug, e.number]));
  problemListCachedAt = Date.now();
  return map;
}

export async function lookupNumberBySlug(slug: string): Promise<number | null> {
  await loadProblemList();
  return slugToNumberCache?.get(slug) ?? null;
}

export type SimilarQuestion = { number: number | null; title: string; slug: string; difficulty: string };

export type LeetCodeQuestionDetail = {
  number: number;
  title: string;
  slug: string;
  difficulty: "Easy" | "Medium" | "Hard";
  topics: string[];
  url: string;
  content: string;
  acceptanceRate: string | null;
  hints: string[];
  similarQuestions: SimilarQuestion[];
};

export async function lookupQuestionByNumber(number: number): Promise<LeetCodeQuestionDetail> {
  const list = await loadProblemList();
  const entry = list.get(number);
  if (!entry) throw new Error(`No LeetCode question found with number ${number}`);
  if (entry.paidOnly) throw new Error(`Question ${number} (${entry.title}) is LeetCode Premium-only`);

  const query = `
    query questionDetail($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionFrontendId
        title
        difficulty
        content
        topicTags { name }
        stats
        hints
        similarQuestions
      }
    }
  `;

  const res = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (leetrack personal study app)",
      Referer: `https://leetcode.com/problems/${entry.slug}/`,
    },
    body: JSON.stringify({ query, variables: { titleSlug: entry.slug } }),
  });
  if (!res.ok) throw new Error(`LeetCode GraphQL fetch failed: ${res.status}`);
  const json = (await res.json()) as { data?: { question?: any } };
  const q = json.data?.question;
  if (!q) throw new Error(`LeetCode GraphQL returned no data for ${entry.slug}`);

  let acceptanceRate: string | null = null;
  try {
    const stats = JSON.parse(q.stats ?? "{}");
    acceptanceRate = stats.acRate ?? null;
  } catch {
    // malformed stats payload — leave acceptanceRate null
  }

  let rawSimilar: Array<{ title: string; titleSlug: string; difficulty: string }> = [];
  try {
    rawSimilar = JSON.parse(q.similarQuestions ?? "[]");
  } catch {
    // malformed similarQuestions payload — leave empty
  }
  const similarQuestions: SimilarQuestion[] = await Promise.all(
    rawSimilar.map(async (s) => ({
      number: await lookupNumberBySlug(s.titleSlug),
      title: s.title,
      slug: s.titleSlug,
      difficulty: s.difficulty,
    }))
  );

  return {
    number,
    title: q.title,
    slug: entry.slug,
    difficulty: q.difficulty,
    topics: (q.topicTags ?? []).map((t: { name: string }) => t.name),
    url: `https://leetcode.com/problems/${entry.slug}/`,
    content: stripHtml(q.content ?? ""),
    acceptanceRate,
    hints: Array.isArray(q.hints) ? q.hints.map((h: string) => stripHtml(h)) : [],
    similarQuestions,
  };
}

export type LeetCodeProfile = {
  username: string;
  totalSolved: { all: number; easy: number; medium: number; hard: number };
  streak: number;
  totalActiveDays: number;
  calendar: Array<{ date: string; count: number }>;
  recentSubmissions: Array<{ number: number | null; title: string; slug: string; date: string }>;
};

// LeetCode's own streak/calendar/daily-reset always runs on a fixed 00:00 UTC boundary —
// confirmed on LeetCode's own discuss/feedback threads — regardless of the user's timezone
// (for IST that's a 5:30am reset, not midnight). To keep our tracking consistent with what
// LeetCode itself reports, submission dates are bucketed by plain UTC day, not local calendar
// day. Do NOT "fix" this to IST local time — that was tried and made our dates disagree with
// LeetCode's.
function unixDayToIso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

export async function fetchUserProfile(username: string): Promise<LeetCodeProfile> {
  const now = new Date();
  const yearA = now.getUTCFullYear();
  const yearB = yearA - 1;

  const query = `
    query profile($username: String!, $limit: Int!, $yearA: Int!, $yearB: Int!) {
      matchedUser(username: $username) {
        username
        submitStats {
          acSubmissionNum { difficulty count }
        }
        calA: userCalendar(year: $yearA) { streak totalActiveDays submissionCalendar }
        calB: userCalendar(year: $yearB) { submissionCalendar }
      }
      recentAcSubmissionList(username: $username, limit: $limit) {
        title
        titleSlug
        timestamp
      }
    }
  `;

  const res = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (leetrack personal study app)",
      Referer: `https://leetcode.com/u/${username}/`,
    },
    body: JSON.stringify({ query, variables: { username, limit: 50, yearA, yearB } }),
  });
  if (!res.ok) throw new Error(`LeetCode GraphQL fetch failed: ${res.status}`);
  const json = (await res.json()) as { data?: { matchedUser?: any; recentAcSubmissionList?: any[] } };

  const user = json.data?.matchedUser;
  if (!user) throw new Error(`No LeetCode user found with username "${username}"`);

  const counts: Record<string, number> = {};
  for (const s of user.submitStats?.acSubmissionNum ?? []) counts[s.difficulty] = s.count;

  const calendarMap = new Map<string, number>();
  for (const cal of [user.calA, user.calB]) {
    if (!cal?.submissionCalendar) continue;
    const parsed = JSON.parse(cal.submissionCalendar) as Record<string, number>;
    for (const [unixSeconds, count] of Object.entries(parsed)) {
      calendarMap.set(unixDayToIso(Number(unixSeconds)), count);
    }
  }

  const trailingDays = 365;
  const calendar: Array<{ date: string; count: number }> = [];
  for (let i = trailingDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    calendar.push({ date: iso, count: calendarMap.get(iso) ?? 0 });
  }

  const recentSubmissions = await Promise.all(
    (json.data?.recentAcSubmissionList ?? []).map(async (s) => ({
      number: await lookupNumberBySlug(s.titleSlug),
      title: s.title as string,
      slug: s.titleSlug as string,
      date: unixDayToIso(Number(s.timestamp)),
    }))
  );

  return {
    username: user.username,
    totalSolved: {
      all: counts.All ?? 0,
      easy: counts.Easy ?? 0,
      medium: counts.Medium ?? 0,
      hard: counts.Hard ?? 0,
    },
    streak: user.calA?.streak ?? 0,
    totalActiveDays: user.calA?.totalActiveDays ?? 0,
    calendar,
    recentSubmissions,
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
