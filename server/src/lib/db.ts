import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

export const sql = postgres(connectionString, {
  ssl: "require",
});

const NOW_TEXT = `to_char(now(), 'YYYY-MM-DD HH24:MI:SS')`;
export const nowText = () => new Date().toISOString().slice(0, 19).replace("T", " ");

export async function initSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      number INTEGER NOT NULL UNIQUE,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      topics TEXT NOT NULL DEFAULT '[]',
      leetcode_url TEXT NOT NULL,
      optimal_time_complexity TEXT,
      optimal_space_complexity TEXT,
      ai_pattern_summary TEXT,
      created_at TEXT NOT NULL DEFAULT ${sql.unsafe(NOW_TEXT)},
      fetched_at TEXT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS attempts (
      id SERIAL PRIMARY KEY,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      confidence INTEGER NOT NULL DEFAULT 3,
      notes TEXT,
      code TEXT,
      ai_code_analysis TEXT,
      time_taken_sec INTEGER,
      created_at TEXT NOT NULL DEFAULT ${sql.unsafe(NOW_TEXT)}
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS test_sessions (
      id SERIAL PRIMARY KEY,
      started_at TEXT NOT NULL DEFAULT ${sql.unsafe(NOW_TEXT)},
      ended_at TEXT,
      config TEXT NOT NULL DEFAULT '{}'
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS test_session_questions (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL,
      time_spent_sec INTEGER,
      result TEXT,
      answered_at TEXT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS insights_reports (
      id SERIAL PRIMARY KEY,
      generated_at TEXT NOT NULL DEFAULT ${sql.unsafe(NOW_TEXT)},
      summary TEXT NOT NULL,
      stats_snapshot TEXT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS analysis_reports (
      id SERIAL PRIMARY KEY,
      generated_at TEXT NOT NULL DEFAULT ${sql.unsafe(NOW_TEXT)},
      data TEXT NOT NULL
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_attempts_question_id ON attempts(question_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tsq_session_id ON test_session_questions(session_id)`;
}
