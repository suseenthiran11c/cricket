-- Add missing FK constraint on toss_winner_team_id so the join in MatchDetailPage resolves
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'matches_toss_winner_team_id_fkey'
  ) THEN
    ALTER TABLE matches
      ADD CONSTRAINT matches_toss_winner_team_id_fkey
      FOREIGN KEY (toss_winner_team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
END $$;
