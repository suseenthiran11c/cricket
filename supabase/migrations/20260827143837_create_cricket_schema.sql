/*
# Cricket Scoring Schema (single-tenant, no auth)

## Overview
Creates the full data model for a cricket scoring application: teams, players,
matches, innings, balls, and computed batting/bowling aggregates.

## Tables

1. **teams** — a cricket team with a squad of players.
   - id (uuid PK)
   - name (text)
   - logo_url (text, nullable)
   - color (text, nullable accent color)
   - created_at (timestamptz)

2. **players** — players belong to a team.
   - id (uuid PK)
   - team_id (uuid FK -> teams)
   - name (text)
   - role (text, nullable: Batsman / Bowler / All-rounder / Wicketkeeper)
   - created_at (timestamptz)

3. **matches** — a cricket match (two teams, config, state, result).
   - id (uuid PK)
   - name (text)
   - tournament (text, nullable)
   - venue (text, nullable)
   - match_date (date, nullable)
   - start_time (text, nullable)
   - format (text: T20 / ODI / TEST / CUSTOM)
   - overs_limit (int)
   - innings_count (int, default 2)
   - ball_type (text, nullable)
   - pitch_type (text, nullable)
   - team_a_id (uuid FK -> teams)
   - team_b_id (uuid FK -> teams)
   - status (text: SETUP / TOSS / LIVE / INNINGS_BREAK / COMPLETED / PAUSED)
   - toss_winner_team_id (uuid, nullable)
   - toss_decision (text, nullable: BAT / BOWL)
   - current_innings (int, default 0)
   - result (text, nullable)
   - player_of_match_id (uuid, nullable FK -> players)
   - created_at (timestamptz)

4. **match_players** — playing XI for a team in a match, with captain/wk flags.
   - id (uuid PK)
   - match_id (uuid FK -> matches)
   - player_id (uuid FK -> players)
   - team_id (uuid FK -> teams)
   - is_captain (bool)
   - is_wicketkeeper (bool)

5. **innings** — one innings of a match.
   - id (uuid PK)
   - match_id (uuid FK -> matches)
   - innings_number (int)
   - batting_team_id (uuid FK -> teams)
   - bowling_team_id (uuid FK -> teams)
   - total_runs (int, default 0)
   - total_wickets (int, default 0)
   - balls_bowled (int, default 0)
   - extras (int, default 0)
   - is_complete (bool, default false)
   - target (int, nullable, for 2nd innings)

6. **balls** — every recorded delivery (the source of truth).
   - id (uuid PK)
   - match_id (uuid FK -> matches)
   - innings_id (uuid FK -> innings)
   - over_number (int)
   - ball_number (int, legal ball index within over)
   - striker_id (uuid FK -> players)
   - non_striker_id (uuid FK -> players)
   - bowler_id (uuid FK -> players)
   - runs_scored (int, runs off the bat)
   - extra_type (text, nullable: WD / NB / BYE / LEG_BYE)
   - extra_runs (int, default 0)
   - is_wicket (bool, default false)
   - wicket_type (text, nullable)
   - dismissed_player_id (uuid, nullable FK -> players)
   - created_at (timestamptz)

## Security
- Single-tenant app (no sign-in). RLS enabled on every table.
- All CRUD allowed to anon + authenticated (data intentionally shared).
*/

CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  color text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tournament text,
  venue text,
  match_date date,
  start_time text,
  format text NOT NULL DEFAULT 'T20',
  overs_limit int NOT NULL DEFAULT 20,
  innings_count int NOT NULL DEFAULT 2,
  ball_type text,
  pitch_type text,
  team_a_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  team_b_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'SETUP',
  toss_winner_team_id uuid,
  toss_decision text,
  current_innings int NOT NULL DEFAULT 0,
  result text,
  player_of_match_id uuid REFERENCES players(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  is_captain boolean NOT NULL DEFAULT false,
  is_wicketkeeper boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS innings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  innings_number int NOT NULL,
  batting_team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  bowling_team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  total_runs int NOT NULL DEFAULT 0,
  total_wickets int NOT NULL DEFAULT 0,
  balls_bowled int NOT NULL DEFAULT 0,
  extras int NOT NULL DEFAULT 0,
  is_complete boolean NOT NULL DEFAULT false,
  target int
);

CREATE TABLE IF NOT EXISTS balls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  innings_id uuid NOT NULL REFERENCES innings(id) ON DELETE CASCADE,
  over_number int NOT NULL,
  ball_number int NOT NULL,
  striker_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  non_striker_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  bowler_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  runs_scored int NOT NULL DEFAULT 0,
  extra_type text,
  extra_runs int NOT NULL DEFAULT 0,
  is_wicket boolean NOT NULL DEFAULT false,
  wicket_type text,
  dismissed_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_matches_teams ON matches(team_a_id, team_b_id);
CREATE INDEX IF NOT EXISTS idx_match_players_match ON match_players(match_id);
CREATE INDEX IF NOT EXISTS idx_innings_match ON innings(match_id);
CREATE INDEX IF NOT EXISTS idx_balls_innings ON balls(innings_id);
CREATE INDEX IF NOT EXISTS idx_balls_match ON balls(match_id);

-- Enable RLS on all tables
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE innings ENABLE ROW LEVEL SECURITY;
ALTER TABLE balls ENABLE ROW LEVEL SECURITY;

-- Single-tenant: anon + authenticated have full CRUD (intentionally shared data)

-- teams
DROP POLICY IF EXISTS "anon_select_teams" ON teams;
CREATE POLICY "anon_select_teams" ON teams FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_teams" ON teams;
CREATE POLICY "anon_insert_teams" ON teams FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_teams" ON teams;
CREATE POLICY "anon_update_teams" ON teams FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_teams" ON teams;
CREATE POLICY "anon_delete_teams" ON teams FOR DELETE TO anon, authenticated USING (true);

-- players
DROP POLICY IF EXISTS "anon_select_players" ON players;
CREATE POLICY "anon_select_players" ON players FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_players" ON players;
CREATE POLICY "anon_insert_players" ON players FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_players" ON players;
CREATE POLICY "anon_update_players" ON players FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_players" ON players;
CREATE POLICY "anon_delete_players" ON players FOR DELETE TO anon, authenticated USING (true);

-- matches
DROP POLICY IF EXISTS "anon_select_matches" ON matches;
CREATE POLICY "anon_select_matches" ON matches FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_matches" ON matches;
CREATE POLICY "anon_insert_matches" ON matches FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_matches" ON matches;
CREATE POLICY "anon_update_matches" ON matches FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_matches" ON matches;
CREATE POLICY "anon_delete_matches" ON matches FOR DELETE TO anon, authenticated USING (true);

-- match_players
DROP POLICY IF EXISTS "anon_select_match_players" ON match_players;
CREATE POLICY "anon_select_match_players" ON match_players FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_match_players" ON match_players;
CREATE POLICY "anon_insert_match_players" ON match_players FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_match_players" ON match_players;
CREATE POLICY "anon_update_match_players" ON match_players FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_match_players" ON match_players;
CREATE POLICY "anon_delete_match_players" ON match_players FOR DELETE TO anon, authenticated USING (true);

-- innings
DROP POLICY IF EXISTS "anon_select_innings" ON innings;
CREATE POLICY "anon_select_innings" ON innings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_innings" ON innings;
CREATE POLICY "anon_insert_innings" ON innings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_innings" ON innings;
CREATE POLICY "anon_update_innings" ON innings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_innings" ON innings;
CREATE POLICY "anon_delete_innings" ON innings FOR DELETE TO anon, authenticated USING (true);

-- balls
DROP POLICY IF EXISTS "anon_select_balls" ON balls;
CREATE POLICY "anon_select_balls" ON balls FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_balls" ON balls;
CREATE POLICY "anon_insert_balls" ON balls FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_balls" ON balls;
CREATE POLICY "anon_update_balls" ON balls FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_balls" ON balls;
CREATE POLICY "anon_delete_balls" ON balls FOR DELETE TO anon, authenticated USING (true);