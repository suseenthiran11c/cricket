export interface Team {
  id: string;
  name: string;
  logo_url: string | null;
  color: string | null;
  created_at: string;
}

export interface Player {
  id: string;
  team_id: string;
  name: string;
  role: string | null;
  created_at: string;
}

export interface MatchPlayer {
  id: string;
  match_id: string;
  player_id: string;
  team_id: string;
  is_captain: boolean;
  is_wicketkeeper: boolean;
  player?: Player;
}

export interface Match {
  id: string;
  name: string;
  tournament: string | null;
  venue: string | null;
  match_date: string | null;
  start_time: string | null;
  format: string;
  overs_limit: number;
  innings_count: number;
  ball_type: string | null;
  pitch_type: string | null;
  team_a_id: string | null;
  team_b_id: string | null;
  status: string;
  toss_winner_team_id: string | null;
  toss_decision: string | null;
  current_innings: number;
  result: string | null;
  player_of_match_id: string | null;
  created_at: string;
  team_a?: Team;
  team_b?: Team;
  toss_winner_team?: Team;
  player_of_match?: Player;
}

export interface Innings {
  id: string;
  match_id: string;
  innings_number: number;
  batting_team_id: string;
  bowling_team_id: string;
  total_runs: number;
  total_wickets: number;
  balls_bowled: number;
  extras: number;
  is_complete: boolean;
  target: number | null;
  batting_team?: Team;
  bowling_team?: Team;
}

export interface Ball {
  id: string;
  match_id: string;
  innings_id: string;
  over_number: number;
  ball_number: number;
  striker_id: string;
  non_striker_id: string;
  bowler_id: string;
  runs_scored: number;
  extra_type: string | null;
  extra_runs: number;
  is_wicket: boolean;
  wicket_type: string | null;
  dismissed_player_id: string | null;
  created_at: string;
  striker?: Player;
  non_striker?: Player;
  bowler?: Player;
  dismissed_player?: Player;
}

export interface BattingStat {
  player_id: string;
  player_name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  how_out: string | null;
  strike_rate: number;
}

export interface BowlingStat {
  player_id: string;
  player_name: string;
  overs: string;
  balls: number;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
}

export interface OverSummary {
  over_number: number;
  runs: number;
  wickets: number;
  balls: BallDisplay[];
}

export interface BallDisplay {
  label: string;
  is_wicket: boolean;
  is_extra: boolean;
}

export interface LiveScoreState {
  innings: Innings | null;
  striker: Player | null;
  non_striker: Player | null;
  bowler: Player | null;
  totalRuns: number;
  totalWickets: number;
  ballsBowled: number;
  extras: number;
  oversString: string;
  currentRunRate: number;
  target: number | null;
  runsNeeded: number | null;
  ballsRemaining: number | null;
  requiredRunRate: number | null;
  currentOver: BallDisplay[];
  recentOvers: OverSummary[];
  battingStats: BattingStat[];
  bowlingStats: BowlingStat[];
  strikerStats: BattingStat;
  nonStrikerStats: BattingStat;
  bowlerStats: BowlingStat;
  isOverComplete: boolean;
  isInningsComplete: boolean;
}
