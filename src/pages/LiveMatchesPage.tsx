import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Radio, ChevronRight, Eye } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Match, Innings, Ball } from '@/lib/types';
import { computeInnings, oversToString, runRate } from '@/lib/cricketEngine';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import Loading from '@/components/Loading';

export default function LiveMatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [inningsMap, setInningsMap] = useState<Record<string, Innings[]>>({});
  const [ballsMap, setBallsMap] = useState<Record<string, Ball[]>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('matches')
      .select('*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)')
      .in('status', ['LIVE', 'PAUSED'])
      .order('created_at', { ascending: false });
    const liveMatches = (data as unknown as Match[]) ?? [];
    setMatches(liveMatches);

    for (const m of liveMatches) {
      const [iRes, bRes] = await Promise.all([
        supabase.from('innings').select('*').eq('match_id', m.id).order('innings_number'),
        supabase.from('balls').select('*').eq('match_id', m.id).order('created_at'),
      ]);
      setInningsMap((prev) => ({ ...prev, [m.id]: (iRes.data as Innings[]) ?? [] }));
      setBallsMap((prev) => ({ ...prev, [m.id]: (bRes.data as Ball[]) ?? [] }));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Live Matches" subtitle="Currently ongoing matches" icon={<Radio className="h-5 w-5" />} />

      {matches.length === 0 ? (
        <EmptyState
          icon={<Radio className="h-8 w-8" />}
          title="No live matches"
          description="There are no ongoing matches right now. Start a new match to see it live here."
          action={<Link to="/start-match" className="btn btn-primary">Start a Match</Link>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {matches.map((m) => {
            const currentInn = inningsMap[m.id]?.find((i) => i.innings_number === m.current_innings);
            const innBalls = currentInn ? (ballsMap[m.id] ?? []).filter((b) => b.innings_id === currentInn.id) : [];
            const computed = currentInn && innBalls.length > 0 ? computeInnings(currentInn, innBalls, {}) : null;
            const totalRuns = computed?.totalRuns ?? currentInn?.total_runs ?? 0;
            const totalWkts = computed?.totalWickets ?? currentInn?.total_wickets ?? 0;
            const ballsBowled = computed?.ballsBowled ?? currentInn?.balls_bowled ?? 0;
            const battingTeam = currentInn?.batting_team_id === m.team_a_id ? m.team_a : m.team_b;
            const bowlingTeam = currentInn?.batting_team_id === m.team_a_id ? m.team_b : m.team_a;

            return (
              <div key={m.id} className="card overflow-hidden">
                <div className="bg-gradient-to-r from-primary-700 to-primary-600 px-4 py-3 text-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="live-dot" />
                      <span className="text-xs font-bold uppercase">Live</span>
                    </div>
                    <span className="text-xs text-white/70">{m.format} · Inns {m.current_innings}</span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <div>
                      <p className="font-bold">{battingTeam?.name ?? 'Batting'}</p>
                      <p className="text-xs text-white/70">vs {bowlingTeam?.name ?? 'Bowling'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-extrabold tabular-nums">{totalRuns}/{totalWkts}</p>
                      <p className="text-xs text-white/70">{oversToString(ballsBowled)} ov · CRR {runRate(ballsBowled, totalRuns).toFixed(2)}</p>
                    </div>
                  </div>
                  {currentInn?.target && (
                    <div className="mt-2 rounded bg-white/15 px-2 py-1 text-xs backdrop-blur-sm">
                      Target: {currentInn.target} · Need {currentInn.target - totalRuns} from {m.overs_limit * 6 - ballsBowled} balls
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between p-3">
                  <div className="flex gap-2">
                    <Link to={`/match/${m.id}`} className="btn btn-secondary !py-2">
                      <Eye className="h-4 w-4" /> View
                    </Link>
                    <Link to={`/score/${m.id}`} className="btn btn-primary !py-2">
                      Score
                    </Link>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
