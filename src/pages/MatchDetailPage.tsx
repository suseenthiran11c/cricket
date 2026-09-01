import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Match, Innings, Ball, Player, Team, MatchPlayer, BattingStat, BowlingStat } from '@/lib/types';
import { computeInnings, oversToString, labelBall, type ComputedInnings } from '@/lib/cricketEngine';
import { EXTRA_TYPES, WICKET_TYPES } from '@/lib/constants';
import PageHeader from '@/components/PageHeader';
import Loading from '@/components/Loading';
import { ArrowLeft, Trophy, MapPin, Calendar, Clock, Play, Pause, Trash2, Pencil, Star, Award, TrendingUp } from 'lucide-react';

export default function MatchDetailPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const [match, setMatch] = useState<Match | null>(null);
  const [innings, setInnings] = useState<Innings[]>([]);
  const [balls, setBalls] = useState<Ball[]>([]);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [matchPlayers, setMatchPlayers] = useState<MatchPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!matchId) return;
    const [mRes, iRes, bRes, mpRes] = await Promise.all([
      supabase.from('matches').select('*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*), toss_winner_team:teams!matches_toss_winner_team_id_fkey(*), player_of_match:players!matches_player_of_match_id_fkey(*)').eq('id', matchId).single(),
      supabase.from('innings').select('*, batting_team:teams!innings_batting_team_id_fkey(*), bowling_team:teams!innings_bowling_team_id_fkey(*)').eq('match_id', matchId).order('innings_number'),
      supabase.from('balls').select('*').eq('match_id', matchId).order('created_at'),
      supabase.from('match_players').select('*, player:players(*)').eq('match_id', matchId),
    ]);

    // If the main match query fails, retry without the toss_winner join
    let m = mRes.data as unknown as Match | null;
    if (mRes.error || !m) {
      const { data: fallback } = await supabase
        .from('matches')
        .select('*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)')
        .eq('id', matchId).single();
      m = fallback as unknown as Match;
    }
    setMatch(m);
    setInnings((iRes.data as Innings[]) ?? []);
    setBalls((bRes.data as Ball[]) ?? []);
    setMatchPlayers((mpRes.data as MatchPlayer[]) ?? []);

    const teamMap: Record<string, Team> = {};
    if (m?.team_a) teamMap[m.team_a.id] = m.team_a;
    if (m?.team_b) teamMap[m.team_b.id] = m.team_b;
    setTeams(teamMap);

    const pIds = new Set<string>();
    for (const b of (bRes.data as Ball[]) ?? []) {
      pIds.add(b.striker_id); pIds.add(b.non_striker_id); pIds.add(b.bowler_id);
      if (b.dismissed_player_id) pIds.add(b.dismissed_player_id);
    }
    for (const mp of (mpRes.data as MatchPlayer[]) ?? []) pIds.add(mp.player_id);
    if (m?.player_of_match_id) pIds.add(m.player_of_match_id);

    if (pIds.size > 0) {
      const { data: pData } = await supabase.from('players').select('*').in('id', Array.from(pIds));
      const pm: Record<string, Player> = {};
      for (const p of (pData as Player[]) ?? []) pm[p.id] = p;
      setPlayers(pm);
    }

    setLoading(false);
  }, [matchId]);

  useEffect(() => { load(); }, [load]);

  async function deleteMatch() {
    if (!match) return;
    if (!confirm(`Delete match "${match.name}"? This cannot be undone.`)) return;
    await supabase.from('matches').delete().eq('id', match.id);
    navigate('/matches');
  }

  if (loading || !match) return <Loading label="Loading match..." />;

  const isLive = match.status === 'LIVE' || match.status === 'PAUSED';
  const isCompleted = match.status === 'COMPLETED';

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-100">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Match header */}
      <div className="card overflow-hidden">
        <div className={`px-5 py-4 ${isCompleted ? 'bg-gradient-to-r from-gray-700 to-gray-600' : isLive ? 'bg-gradient-to-r from-primary-700 to-primary-600' : 'bg-gradient-to-r from-gray-600 to-gray-500'} text-white`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isLive && <span className="live-dot" />}
              <span className="text-xs font-bold uppercase tracking-wide">
                {match.status === 'LIVE' ? 'Live' : match.status === 'COMPLETED' ? 'Completed' : match.status === 'PAUSED' ? 'Paused' : match.status === 'SETUP' ? 'Setup' : match.status}
              </span>
              <span className="text-xs text-white/70">· {match.format}</span>
            </div>
            <span className="text-xs text-white/70">{match.overs_limit} overs</span>
          </div>
          <h1 className="mt-2 text-xl font-extrabold sm:text-2xl">{match.name}</h1>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-white/70">
            {match.venue && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {match.venue}</span>}
            {match.match_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {match.match_date}</span>}
            {match.start_time && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {match.start_time}</span>}
            {match.tournament && <span className="flex items-center gap-1"><Trophy className="h-3 w-3" /> {match.tournament}</span>}
          </div>
        </div>

        {/* Result + Highlights */}
        {isCompleted && match.result && (
          <>
            <div className="bg-success-50 px-5 py-4 text-center dark:bg-success-900/20">
              <p className="text-lg font-extrabold text-success-700 dark:text-success-300">{match.result}</p>
            </div>

            {(() => {
              // Compute combined stats across all innings
              const batMap = new Map<string, BattingStat>();
              const bowlMap = new Map<string, BowlingStat>();
              for (const inn of innings) {
                const innBalls = balls.filter((b) => b.innings_id === inn.id);
                if (innBalls.length === 0) continue;
                const c = computeInnings(inn, innBalls, players);
                for (const s of c.battingStats) {
                  const ex = batMap.get(s.player_id);
                  if (ex) {
                    ex.runs += s.runs; ex.balls += s.balls; ex.fours += s.fours; ex.sixes += s.sixes;
                    ex.strike_rate = ex.balls > 0 ? (ex.runs / ex.balls) * 100 : 0;
                  } else batMap.set(s.player_id, { ...s });
                }
                for (const s of c.bowlingStats) {
                  const ex = bowlMap.get(s.player_id);
                  if (ex) {
                    ex.balls += s.balls; ex.runs += s.runs; ex.wickets += s.wickets; ex.maidens += s.maidens;
                    ex.overs = oversToString(ex.balls);
                    ex.economy = ex.balls > 0 ? (ex.runs / ex.balls) * 6 : 0;
                  } else bowlMap.set(s.player_id, { ...s });
                }
              }
              const bestBatter = Array.from(batMap.values())
                .filter((b) => b.balls > 0)
                .sort((a, b) => b.runs - a.runs || b.strike_rate - a.strike_rate)[0];
              const bestBowler = Array.from(bowlMap.values())
                .filter((b) => b.balls > 0)
                .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)[0];
              const pomId = match.player_of_match_id;
              const pomPlayer = pomId ? players[pomId] : null;
              const pomTeam = pomPlayer ? teams[pomPlayer.team_id] : null;
              const batTeam = bestBatter ? teams[players[bestBatter.player_id]?.team_id ?? ''] : null;
              const bowlTeam = bestBowler ? teams[players[bestBowler.player_id]?.team_id ?? ''] : null;

              if (!pomPlayer && !bestBatter && !bestBowler) return null;

              return (
                <div className="grid grid-cols-1 gap-px bg-gray-200 sm:grid-cols-3 dark:bg-gray-800">
                  {/* Player of the Match */}
                  {pomPlayer && (
                    <div className="bg-gradient-to-br from-warning-50 to-warning-100/50 px-4 py-4 text-center dark:from-warning-900/20 dark:to-warning-900/5">
                      <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-warning-500 text-white shadow-lg shadow-warning-500/30">
                        <Trophy className="h-6 w-6" />
                      </div>
                      <p className="text-xs font-bold uppercase tracking-wide text-warning-700 dark:text-warning-300">Player of the Match</p>
                      <p className="mt-1 text-sm font-extrabold">{pomPlayer.name}</p>
                      {pomTeam && <p className="text-xs text-gray-500 dark:text-gray-400">{pomTeam.name}</p>}
                    </div>
                  )}

                  {/* Best Batsman */}
                  {bestBatter && (
                    <div className="bg-white px-4 py-4 text-center dark:bg-gray-900">
                      <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                        <TrendingUp className="h-6 w-6" />
                      </div>
                      <p className="text-xs font-bold uppercase tracking-wide text-primary-700 dark:text-primary-300">Best Batsman</p>
                      <p className="mt-1 text-sm font-extrabold">{bestBatter.player_name}</p>
                      {batTeam && <p className="text-xs text-gray-500 dark:text-gray-400">{batTeam.name}</p>}
                      <p className="mt-1 text-xs font-semibold tabular-nums text-gray-600 dark:text-gray-400">
                        {bestBatter.runs} ({bestBatter.balls}) · {bestBatter.fours}x4 {bestBatter.sixes}x6
                      </p>
                    </div>
                  )}

                  {/* Best Bowler */}
                  {bestBowler && (
                    <div className="bg-white px-4 py-4 text-center dark:bg-gray-900">
                      <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300">
                        <Award className="h-6 w-6" />
                      </div>
                      <p className="text-xs font-bold uppercase tracking-wide text-accent-700 dark:text-accent-300">Best Bowler</p>
                      <p className="mt-1 text-sm font-extrabold">{bestBowler.player_name}</p>
                      {bowlTeam && <p className="text-xs text-gray-500 dark:text-gray-400">{bowlTeam.name}</p>}
                      <p className="mt-1 text-xs font-semibold tabular-nums text-gray-600 dark:text-gray-400">
                        {bestBowler.wickets}/{bestBowler.runs} ({bestBowler.overs} ov)
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}

        {/* Toss info */}
        {match.toss_winner_team_id && (
          <div className="border-b border-gray-200 px-5 py-3 text-sm dark:border-gray-800">
            <span className="text-gray-500 dark:text-gray-400">Toss: </span>
            <span className="font-semibold">{teams[match.toss_winner_team_id]?.name ?? '—'}</span>
            <span className="text-gray-500 dark:text-gray-400"> won and chose to </span>
            <span className="font-semibold">{match.toss_decision?.toLowerCase()}</span>
          </div>
        )}

        {/* Actions */}
        {isLive && (
          <div className="flex gap-2 p-4">
            <Link to={`/score/${match.id}`} className="btn btn-primary flex-1">
              <Play className="h-4 w-4 fill-current" /> Continue Scoring
            </Link>
          </div>
        )}
        {!isCompleted && !isLive && (
          <div className="flex gap-2 p-4">
            <Link to={`/score/${match.id}`} className="btn btn-primary flex-1">
              <Play className="h-4 w-4 fill-current" /> Resume Scoring
            </Link>
          </div>
        )}
      </div>

      {/* Scorecards */}
      {innings.map((inn) => {
        const innBalls = balls.filter((b) => b.innings_id === inn.id);
        const computed = innBalls.length > 0 ? computeInnings(inn, innBalls, players) : null;
        return (
          <InningsScorecard
            key={inn.id}
            innings={inn}
            computed={computed}
            players={players}
            matchPlayers={matchPlayers}
            balls={innBalls}
            battingTeamName={teams[inn.batting_team_id]?.name ?? 'Batting'}
            bowlingTeamName={teams[inn.bowling_team_id]?.name ?? 'Bowling'}
          />
        );
      })}

      {/* Manage */}
      <div className="mt-6 flex justify-end gap-2">
        <button onClick={deleteMatch} className="btn btn-danger">
          <Trash2 className="h-4 w-4" /> Delete Match
        </button>
      </div>
    </div>
  );
}

function InningsScorecard({ innings, computed, players, matchPlayers, balls, battingTeamName, bowlingTeamName }: {
  innings: Innings;
  computed: ComputedInnings | null;
  players: Record<string, Player>;
  matchPlayers: MatchPlayer[];
  balls: Ball[];
  battingTeamName: string;
  bowlingTeamName: string;
}) {
  const battingXI = matchPlayers.filter((mp) => mp.team_id === innings.batting_team_id);

  // Build a merged list: all XI players, with stats from computed (or empty)
  const allBatters = battingXI.map((mp) => {
    const stat = computed?.battingStats.find((b) => b.player_id === mp.player_id);
    const isCaptain = mp.is_captain;
    const isKeeper = mp.is_wicketkeeper;
    return {
      player_id: mp.player_id,
      player_name: players[mp.player_id]?.name ?? 'Unknown',
      runs: stat?.runs ?? 0,
      balls: stat?.balls ?? 0,
      fours: stat?.fours ?? 0,
      sixes: stat?.sixes ?? 0,
      out: stat?.out ?? false,
      how_out: stat?.how_out ?? null,
      strike_rate: stat?.strike_rate ?? 0,
      isCaptain,
      isKeeper,
      hasBatted: (stat?.balls ?? 0) > 0 || (stat?.out ?? false),
    };
  });

  // Fall of wickets — compute running score up to each wicket ball
  const fallOfWickets: { score: number; overBall: string; playerName: string; wktNum: number }[] = [];
  let runningScore = 0;
  let wktCount = 0;
  for (const b of balls) {
    runningScore += b.runs_scored + b.extra_runs;
    if (b.is_wicket) {
      wktCount += 1;
      const dismissedName = players[b.dismissed_player_id ?? '']?.name ?? players[b.striker_id]?.name ?? 'Unknown';
      fallOfWickets.push({
        score: runningScore,
        overBall: `${b.over_number}.${b.ball_number}`,
        playerName: dismissedName,
        wktNum: wktCount,
      });
    }
  }

  return (
    <div className="card mt-4 overflow-hidden">
      {/* Innings header */}
      <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">{battingTeamName} Innings</h3>
          <span className="text-lg font-extrabold tabular-nums">
            {innings.total_runs}/{innings.total_wickets}
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          ({oversToString(innings.balls_bowled)} overs · Extras: {innings.extras})
        </p>
      </div>

      {computed && computed.battingStats.length > 0 ? (
        <>
          {/* Batting table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-400 dark:border-gray-800">
                  <th className="px-4 py-2 text-left font-semibold">Batter</th>
                  <th className="px-2 py-2 text-right font-semibold">R</th>
                  <th className="px-2 py-2 text-right font-semibold">B</th>
                  <th className="px-2 py-2 text-right font-semibold">4s</th>
                  <th className="px-2 py-2 text-right font-semibold">6s</th>
                  <th className="px-4 py-2 text-right font-semibold">SR</th>
                </tr>
              </thead>
              <tbody>
                {allBatters.map((b) => (
                  <tr key={b.player_id} className="border-b border-gray-100 last:border-0 dark:border-gray-800/50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5 font-medium">
                        {b.player_name}
                        {b.isCaptain && <span className="badge bg-secondary-100 text-secondary-700 dark:bg-secondary-900/30 dark:text-secondary-300 text-[10px]">(c)</span>}
                        {b.isKeeper && <span className="badge bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300 text-[10px]">(wk)</span>}
                      </div>
                      {b.how_out && (
                        <div className="text-xs text-gray-400">{b.how_out}</div>
                      )}
                      {!b.out && b.hasBatted && (
                        <div className="text-xs text-success-500">not out</div>
                      )}
                      {!b.hasBatted && (
                        <div className="text-xs text-gray-400">did not bat</div>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right font-bold tabular-nums">{b.runs}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-gray-500">{b.balls}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{b.fours}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{b.sixes}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{b.balls > 0 ? b.strike_rate.toFixed(1) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Extras */}
          <div className="flex justify-between border-b border-gray-100 px-4 py-2 text-sm dark:border-gray-800/50">
            <span className="text-gray-500 dark:text-gray-400">Extras</span>
            <span className="font-semibold tabular-nums">{innings.extras}</span>
          </div>

          {/* Fall of wickets */}
          {fallOfWickets.length > 0 && (
            <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800/50">
              <p className="mb-1.5 text-xs font-semibold text-gray-400">Fall of Wickets</p>
              <div className="flex flex-wrap gap-2">
                {fallOfWickets.map((fow) => (
                  <span key={fow.wktNum} className="inline-flex items-center gap-1 rounded-lg bg-gray-50 px-2.5 py-1 text-xs dark:bg-gray-800/50">
                    <span className="font-bold text-error-600 dark:text-error-400">{fow.wktNum}</span>
                    <span className="text-gray-500 dark:text-gray-400">{fow.score}</span>
                    <span className="text-gray-400">({fow.playerName}, {fow.overBall})</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Bowling table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-400 dark:border-gray-800">
                  <th className="px-4 py-2 text-left font-semibold">Bowler</th>
                  <th className="px-2 py-2 text-right font-semibold">O</th>
                  <th className="px-2 py-2 text-right font-semibold">M</th>
                  <th className="px-2 py-2 text-right font-semibold">R</th>
                  <th className="px-2 py-2 text-right font-semibold">W</th>
                  <th className="px-4 py-2 text-right font-semibold">Econ</th>
                </tr>
              </thead>
              <tbody>
                {computed.bowlingStats
                  .sort((a, b) => a.player_name.localeCompare(b.player_name))
                  .map((b) => (
                  <tr key={b.player_id} className="border-b border-gray-100 last:border-0 dark:border-gray-800/50">
                    <td className="px-4 py-2.5 font-medium">{b.player_name}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{b.overs}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{b.maidens}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{b.runs}</td>
                    <td className="px-2 py-2.5 text-right font-bold tabular-nums">{b.wickets}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{b.economy.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Ball-by-ball log */}
          {balls.length > 0 && (
            <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-800">
              <p className="mb-2 text-xs font-semibold text-gray-400">Ball-by-Ball</p>
              <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
                {[...balls].reverse().map((b, i) => {
                  const strikerName = players[b.striker_id]?.name ?? 'Unknown';
                  const bowlerName = players[b.bowler_id]?.name ?? 'Unknown';
                  const totalRuns = b.runs_scored + b.extra_runs;
                  let text: string;
                  if (b.is_wicket) {
                    const dismissedName = players[b.dismissed_player_id ?? '']?.name ?? strikerName;
                    const wktLabel = WICKET_TYPES.find((w) => w.value === b.wicket_type)?.label ?? 'Wicket';
                    text = `WICKET! ${dismissedName} (${wktLabel}) — ${bowlerName} to ${strikerName}`;
                  } else if (b.extra_type) {
                    const extraLabel = EXTRA_TYPES.find((e) => e.value === b.extra_type)?.label ?? b.extra_type;
                    text = `${totalRuns} ${extraLabel} — ${bowlerName} to ${strikerName}`;
                  } else {
                    text = `${b.runs_scored} run${b.runs_scored !== 1 ? 's' : ''} — ${bowlerName} to ${strikerName}`;
                  }
                  return (
                    <div key={b.id ?? i} className="flex items-center gap-2 rounded px-2 py-1 text-xs odd:bg-gray-50 dark:odd:bg-gray-800/30">
                      <span className="shrink-0 font-mono text-gray-400">{b.over_number}.{b.ball_number}</span>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 font-bold ${
                        b.is_wicket ? 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-300'
                        : b.extra_type ? 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-300'
                        : totalRuns === 4 || totalRuns === 6 ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                      }`}>{labelBall(b)}</span>
                      <span className="truncate text-gray-600 dark:text-gray-300">{text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
          No balls bowled yet.
        </div>
      )}
    </div>
  );
}
