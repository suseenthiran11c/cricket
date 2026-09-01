import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Match, Innings, Ball, Player, Team } from '@/lib/types';
import { EXTRA_TYPES, WICKET_TYPES } from '@/lib/constants';
import {
  computeInnings,
  nextBallPosition,
  shouldSwapStrike,
  oversToString,
  runRate,
  requiredRunRate,
  determineBattingTeam,
  computeResult,
  labelBall,
  type ComputedInnings,
} from '@/lib/cricketEngine';
import Modal from '@/components/Modal';
import Loading from '@/components/Loading';

type Mode = 'runs' | 'extras' | 'wicket';

export default function ScorePage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();

  const [match, setMatch] = useState<Match | null>(null);
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [innings, setInnings] = useState<Innings[]>([]);
  const [balls, setBalls] = useState<Ball[]>([]);
  const [matchPlayers, setMatchPlayers] = useState<{ player_id: string; team_id: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Live state
  const [strikerId, setStrikerId] = useState<string | null>(null);
  const [nonStrikerId, setNonStrikerId] = useState<string | null>(null);
  const [bowlerId, setBowlerId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('runs');
  const [showBowlerModal, setShowBowlerModal] = useState(false);
  const [showWicketModal, setShowWicketModal] = useState(false);
  const [showNewBatsmanModal, setShowNewBatsmanModal] = useState(false);
  const [showEndOverModal, setShowEndOverModal] = useState(false);
  const [showInningsBreakModal, setShowInningsBreakModal] = useState(false);
  const [paused, setPaused] = useState(false);
  const [computed, setComputed] = useState<ComputedInnings | null>(null);
  const [pendingWicket, setPendingWicket] = useState<{
    type: string;
    dismissedId: string;
  } | null>(null);
  const lastOverBowlerRef = useRef<string | null>(null);

  const currentInnings = innings.find((i) => i.innings_number === match?.current_innings) ?? null;

  const loadData = useCallback(async () => {
    if (!matchId) return;
    const [mRes, iRes, bRes, mpRes] = await Promise.all([
      supabase.from('matches').select('*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)').eq('id', matchId).single(),
      supabase.from('innings').select('*, batting_team:teams!innings_batting_team_id_fkey(*), bowling_team:teams!innings_bowling_team_id_fkey(*)').eq('match_id', matchId).order('innings_number'),
      supabase.from('balls').select('*, striker:players!balls_striker_id_fkey(*), non_striker:players!balls_non_striker_id_fkey(*), bowler:players!balls_bowler_id_fkey(*), dismissed_player:players!balls_dismissed_player_id_fkey(*)').eq('match_id', matchId).order('created_at'),
      supabase.from('match_players').select('player_id, team_id, is_captain, is_wicketkeeper').eq('match_id', matchId),
    ]);

    const m = mRes.data as unknown as Match;
    setMatch(m);
    setInnings((iRes.data as Innings[]) ?? []);
    setBalls((bRes.data as Ball[]) ?? []);
    setMatchPlayers((mpRes.data as { player_id: string; team_id: string; is_captain: boolean; is_wicketkeeper: boolean }[]) ?? []);

    // Build player and team maps
    const teamMap: Record<string, Team> = {};
    if (m.team_a) teamMap[m.team_a.id] = m.team_a;
    if (m.team_b) teamMap[m.team_b.id] = m.team_b;
    setTeams(teamMap);

    const playerIds = new Set<string>();
    for (const b of (bRes.data as Ball[]) ?? []) {
      playerIds.add(b.striker_id);
      playerIds.add(b.non_striker_id);
      playerIds.add(b.bowler_id);
      if (b.dismissed_player_id) playerIds.add(b.dismissed_player_id);
    }
    // Also load all match players
    for (const mp of (mpRes.data as { player_id: string }[]) ?? []) {
      playerIds.add(mp.player_id);
    }
    if (playerIds.size > 0) {
      const { data: pData } = await supabase
        .from('players')
        .select('*')
        .in('id', Array.from(playerIds));
      const pMap: Record<string, Player> = {};
      for (const p of (pData as Player[]) ?? []) {
        pMap[p.id] = p;
      }
      setPlayers(pMap);
    }

    setLoading(false);
  }, [matchId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute innings from balls
  useEffect(() => {
    if (!currentInnings || balls.length === 0) {
      setComputed(null);
      return;
    }
    const currentBalls = balls.filter((b) => b.innings_id === currentInnings.id);
    if (currentBalls.length === 0) {
      setComputed(null);
      return;
    }
    setComputed(computeInnings(currentInnings, currentBalls, players));
  }, [balls, currentInnings, players]);

  // Auto-show bowler modal when over is complete
  useEffect(() => {
    if (computed?.isOverComplete && !showWicketModal && !showNewBatsmanModal && !showInningsBreakModal) {
      setShowEndOverModal(true);
    }
  }, [computed?.isOverComplete]);

  // Initialize striker/non-striker/bowler on first load
  useEffect(() => {
    if (!match || !currentInnings || strikerId) return;
    // If there are balls, derive from last ball
    const currentBalls = balls.filter((b) => b.innings_id === currentInnings.id);
    if (currentBalls.length === 0) {
      // No balls yet — need to prompt for opening players
      setShowBowlerModal(true);
      return;
    }
  }, [match, currentInnings, balls, strikerId]);

  const battingTeamId = currentInnings?.batting_team_id ?? '';
  const bowlingTeamId = currentInnings?.bowling_team_id ?? '';

  const battingXI = matchPlayers.filter((mp) => mp.team_id === battingTeamId).map((mp) => mp.player_id);
  const bowlingXI = matchPlayers.filter((mp) => mp.team_id === bowlingTeamId).map((mp) => mp.player_id);

  const outBatters = new Set<string>();
  const currentBalls = currentInnings ? balls.filter((b) => b.innings_id === currentInnings.id) : [];
  for (const b of currentBalls) {
    if (b.is_wicket && b.dismissed_player_id) outBatters.add(b.dismissed_player_id);
  }

  const availableBatters = battingXI.filter(
    (id) => !outBatters.has(id) && id !== strikerId && id !== nonStrikerId
  );
  const availableBowlers = bowlingXI.filter((id) => id !== lastOverBowlerRef.current);

  // Determine if innings is complete
  const isInningsComplete = computed
    ? computed.totalWickets >= 10 ||
      computed.ballsBowled >= match!.overs_limit * 6 ||
      (currentInnings?.target && computed.totalRuns >= currentInnings.target)
    : false;

  function recordBall(params: {
    runs_scored: number;
    extra_type: string | null;
    extra_runs: number;
    is_wicket: boolean;
    wicket_type?: string;
    dismissed_player_id?: string;
  }) {
    if (!match || !currentInnings || !strikerId || !nonStrikerId || !bowlerId) return;

    const pos = nextBallPosition(currentBalls);
    const totalRuns = params.runs_scored + params.extra_runs;
    const legal = params.extra_type === null;
    const isOverEnd = legal && pos.ball_number >= 6;

    // Optimistic: immediately add ball to local state
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const optimisticBall: Ball = {
      id: tempId,
      match_id: match.id,
      innings_id: currentInnings.id,
      over_number: pos.over_number,
      ball_number: pos.ball_number,
      striker_id: strikerId,
      non_striker_id: nonStrikerId,
      bowler_id: bowlerId,
      runs_scored: params.runs_scored,
      extra_type: params.extra_type,
      extra_runs: params.extra_runs,
      is_wicket: params.is_wicket,
      wicket_type: params.wicket_type ?? null,
      dismissed_player_id: params.dismissed_player_id ?? null,
      created_at: new Date().toISOString(),
    };
    setBalls((prev) => [...prev, optimisticBall]);

    // Optimistic: update innings totals locally
    const newRuns = (currentInnings.total_runs ?? 0) + totalRuns;
    const newWickets = (currentInnings.total_wickets ?? 0) + (params.is_wicket ? 1 : 0);
    const newBallsBowled = (currentInnings.balls_bowled ?? 0) + (legal ? 1 : 0);
    const newExtras = (currentInnings.extras ?? 0) + (params.extra_type ? params.extra_runs : 0);
    const updatedInnings = { ...currentInnings, total_runs: newRuns, total_wickets: newWickets, balls_bowled: newBallsBowled, extras: newExtras };
    setInnings((prev) => prev.map((i) => i.id === currentInnings.id ? updatedInnings : i));

    // Strike rotation
    const swap = shouldSwapStrike(params.runs_scored, params.extra_type, params.extra_runs, isOverEnd);
    if (swap) {
      setStrikerId(nonStrikerId);
      setNonStrikerId(strikerId);
    }

    // If wicket, prompt for new batsman
    if (params.is_wicket) {
      setShowNewBatsmanModal(true);
    }

    // If over end, prompt for new bowler
    if (isOverEnd) {
      lastOverBowlerRef.current = bowlerId;
      setShowEndOverModal(true);
    }

    // Fire DB writes in the background (no await, no blocking)
    supabase.from('balls').insert({
      match_id: match.id,
      innings_id: currentInnings.id,
      over_number: pos.over_number,
      ball_number: pos.ball_number,
      striker_id: strikerId,
      non_striker_id: nonStrikerId,
      bowler_id: bowlerId,
      runs_scored: params.runs_scored,
      extra_type: params.extra_type,
      extra_runs: params.extra_runs,
      is_wicket: params.is_wicket,
      wicket_type: params.wicket_type ?? null,
      dismissed_player_id: params.dismissed_player_id ?? null,
    }).then(({ data }) => {
      // Replace temp ball with real DB row so undo works correctly
      if (data && (data as Ball[]).length > 0) {
        const realBall = (data as Ball[])[0];
        setBalls((prev) => prev.map((b) => b.id === tempId ? realBall : b));
      }
    });

    supabase.from('innings').update({
      total_runs: newRuns,
      total_wickets: newWickets,
      balls_bowled: newBallsBowled,
      extras: newExtras,
    }).eq('id', currentInnings.id);
  }

  function undoLastBall() {
    if (!match || !currentInnings || currentBalls.length === 0) return;
    if (!confirm('Undo the last ball? This will restore the previous score and all stats.')) return;

    const lastBall = currentBalls[currentBalls.length - 1];
    const totalRuns = lastBall.runs_scored + lastBall.extra_runs;
    const legal = lastBall.extra_type === null;

    // Optimistic: remove ball from local state immediately
    setBalls((prev) => prev.filter((b) => b.id !== lastBall.id));

    // Optimistic: revert innings totals locally
    const newRuns = currentInnings.total_runs - totalRuns;
    const newWickets = currentInnings.total_wickets - (lastBall.is_wicket ? 1 : 0);
    const newBallsBowled = Math.max(0, currentInnings.balls_bowled - (legal ? 1 : 0));
    const newExtras = currentInnings.extras - (lastBall.extra_type ? lastBall.extra_runs : 0);
    const updatedInnings = { ...currentInnings, total_runs: newRuns, total_wickets: newWickets, balls_bowled: newBallsBowled, extras: newExtras };
    setInnings((prev) => prev.map((i) => i.id === currentInnings.id ? updatedInnings : i));

    // Restore strike position
    const prevBalls = currentBalls.slice(0, -1);
    if (prevBalls.length > 0) {
      const prevLast = prevBalls[prevBalls.length - 1];
      const prevRuns = prevLast.runs_scored;
      const prevLegal = prevLast.extra_type === null;
      const prevOverEnd = prevLegal && prevLast.ball_number >= 6;
      const prevSwap = shouldSwapStrike(prevRuns, prevLast.extra_type, prevLast.extra_runs, prevOverEnd);
      if (prevSwap) {
        setStrikerId(prevLast.non_striker_id);
        setNonStrikerId(prevLast.striker_id);
      } else {
        setStrikerId(prevLast.striker_id);
        setNonStrikerId(prevLast.non_striker_id);
      }
      setBowlerId(prevLast.bowler_id);
    } else {
      setStrikerId(null);
      setNonStrikerId(null);
      setBowlerId(null);
      setShowBowlerModal(true);
    }

    setShowNewBatsmanModal(false);
    setShowEndOverModal(false);

    // Fire DB writes in the background
    if (!lastBall.id.startsWith('temp-')) {
      supabase.from('balls').delete().eq('id', lastBall.id);
    }
    supabase.from('innings').update({
      total_runs: newRuns,
      total_wickets: newWickets,
      balls_bowled: newBallsBowled,
      extras: newExtras,
    }).eq('id', currentInnings.id);
  }

  async function startNextInnings() {
    if (!match || !currentInnings) return;

    // Mark current innings complete
    await supabase.from('innings').update({ is_complete: true }).eq('id', currentInnings.id);

    // If first innings of a 2-innings match, compute target
    const isFirstInnings = currentInnings.innings_number === 1;
    const nextInningsNumber = currentInnings.innings_number + 1;
    const target = isFirstInnings ? currentInnings.total_runs + 1 : null;

    // Determine next batting/bowling teams (swap)
    const nextBattingTeamId = currentInnings.bowling_team_id;
    const nextBowlingTeamId = currentInnings.batting_team_id;

    const { data: newInnings } = await supabase.from('innings').insert({
      match_id: match.id,
      innings_number: nextInningsNumber,
      batting_team_id: nextBattingTeamId,
      bowling_team_id: nextBowlingTeamId,
      total_runs: 0,
      total_wickets: 0,
      balls_bowled: 0,
      extras: 0,
      is_complete: false,
      target,
    }).select().single();

    await supabase.from('matches').update({
      current_innings: nextInningsNumber,
      status: 'LIVE',
    }).eq('id', match.id);

    // Reset live state
    setStrikerId(null);
    setNonStrikerId(null);
    setBowlerId(null);
    setShowInningsBreakModal(false);
    setShowBowlerModal(true);

    // Optimistic: update local state immediately
    setMatch((prev) => prev ? { ...prev, current_innings: nextInningsNumber, status: 'LIVE' } : prev);
    if (newInnings) {
      setInnings((prev) => [...prev, newInnings as Innings]);
    }
    setBalls([]);
    setStrikerId(null);
    setNonStrikerId(null);
    setBowlerId(null);
  }

  async function finishMatch() {
    if (!match || innings.length < 2) return;
    const i1 = innings.find((i) => i.innings_number === 1);
    const i2 = innings.find((i) => i.innings_number === 2);
    if (!i1 || !i2) return;

    const teamMap: Record<string, string> = {};
    Object.values(teams).forEach((t) => { teamMap[t.id] = t.name; });

    const result = computeResult(
      i1.total_runs,
      i2.total_runs,
      i1.batting_team_id,
      i2.batting_team_id,
      teamMap,
      i2.total_wickets
    );

    await supabase.from('matches').update({
      status: 'COMPLETED',
      result,
    }).eq('id', match.id);

    await supabase.from('innings').update({ is_complete: true }).eq('id', i2.id);

    setMatch((prev) => prev ? { ...prev, status: 'COMPLETED', result } : prev);
    setInnings((prev) => prev.map((i) => i.id === i2.id ? { ...i, is_complete: true } : i));

    navigate(`/match/${match.id}`);
  }

  async function togglePause() {
    if (!match) return;
    const newStatus = paused ? 'LIVE' : 'PAUSED';
    await supabase.from('matches').update({ status: newStatus }).eq('id', match.id);
    setPaused(!paused);
  }

  // Handle innings complete
  useEffect(() => {
    if (isInningsComplete && match && currentInnings && !showInningsBreakModal) {
      if (match.innings_count > 1 && currentInnings.innings_number < match.innings_count) {
        setShowInningsBreakModal(true);
      } else {
        // Match finished
        finishMatch();
      }
    }
  }, [isInningsComplete]);

  if (loading || !match) return <Loading label="Loading match..." />;

  const battingTeam = teams[battingTeamId];
  const bowlingTeam = teams[bowlingTeamId];
  const striker = strikerId ? players[strikerId] : null;
  const nonStriker = nonStrikerId ? players[nonStrikerId] : null;
  const bowler = bowlerId ? players[bowlerId] : null;

  const totalRuns = Math.max(0, computed?.totalRuns ?? currentInnings?.total_runs ?? 0);
  const totalWickets = Math.max(0, computed?.totalWickets ?? currentInnings?.total_wickets ?? 0);
  const ballsBowled = Math.max(0, computed?.ballsBowled ?? currentInnings?.balls_bowled ?? 0);
  const target = currentInnings?.target;
  const runsNeeded = target ? target - totalRuns : null;
  const ballsLeft = match.overs_limit * 6 - ballsBowled;
  const rrr = target && ballsLeft > 0 ? requiredRunRate(runsNeeded!, ballsLeft) : null;

  // Get striker and non-striker stats from computed
  const strikerStats = computed?.battingStats.find((b) => b.player_id === strikerId);
  const nonStrikerStats = computed?.battingStats.find((b) => b.player_id === nonStrikerId);
  const bowlerStats = computed?.bowlingStats.find((b) => b.player_id === bowlerId);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Score header */}
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-primary-700 to-primary-600 px-5 py-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="live-dot" />
              <span className="text-xs font-bold uppercase tracking-wide">Live Scoring</span>
            </div>
            <div className="flex gap-2">
              <Link to={`/match/${match.id}`} className="rounded-lg bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur-sm hover:bg-white/25">
                View
              </Link>
              <button onClick={togglePause} className="rounded-lg bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur-sm hover:bg-white/25">
                {paused ? 'Resume' : 'Pause'}
              </button>
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <h2 className="text-2xl font-extrabold">{battingTeam?.name ?? 'Batting'}</h2>
              <p className="text-sm text-primary-50/80">Innings {match.current_innings}</p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-extrabold tabular-nums">
                {totalRuns}/{totalWickets}
              </p>
              <p className="text-sm text-primary-50/80">{oversToString(ballsBowled)} overs · CRR {runRate(ballsBowled, totalRuns).toFixed(2)}</p>
            </div>
          </div>
          {target && (
            <div className="mt-3 rounded-lg bg-white/15 px-3 py-2 text-sm backdrop-blur-sm">
              {runsNeeded! > 0 ? (
                <>Target: <span className="font-bold">{target}</span> · Need <span className="font-bold">{runsNeeded}</span> runs from <span className="font-bold">{ballsLeft}</span> balls · RRR: <span className="font-bold">{rrr?.toFixed(2)}</span></>
              ) : (
                <span className="font-bold">Target achieved!</span>
              )}
            </div>
          )}
        </div>

        {/* Batters */}
        <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-800">
          <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-400">
            <div className="col-span-5">Batter</div>
            <div className="col-span-2 text-right">R (B)</div>
            <div className="col-span-2 text-right">4s/6s</div>
            <div className="col-span-3 text-right">SR</div>
          </div>
          <BatterRow name={striker?.name ?? '—'} stats={strikerStats} isStriker />
          <BatterRow name={nonStriker?.name ?? '—'} stats={nonStrikerStats} />
        </div>

        {/* Bowler */}
        <div className="px-5 py-3">
          <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-400">
            <div className="col-span-5">Bowler</div>
            <div className="col-span-4 text-right">O-M-R-W</div>
            <div className="col-span-3 text-right">Econ</div>
          </div>
          <div className="mt-1 grid grid-cols-12 gap-2 text-sm">
            <div className="col-span-5 font-semibold">{bowler?.name ?? '—'}</div>
            <div className="col-span-4 text-right tabular-nums">
              {bowlerStats ? `${bowlerStats.overs}-${bowlerStats.maidens}-${bowlerStats.runs}-${bowlerStats.wickets}` : '—'}
            </div>
            <div className="col-span-3 text-right tabular-nums">{bowlerStats ? bowlerStats.economy.toFixed(2) : '—'}</div>
          </div>
        </div>
      </div>

      {/* Current over */}
      {computed && computed.currentOverBalls.length > 0 && (
        <div className="card mt-3 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold">Over {computed.isOverComplete ? computed.overNumber - 1 : computed.overNumber}</span>
            <span className="text-xs text-gray-400">This over</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {computed.currentOverBalls.map((b, i) => (
              <span
                key={i}
                className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${
                  b.is_wicket
                    ? 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-300'
                    : b.is_extra
                    ? 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-300'
                    : b.label === '4' || b.label === '6'
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                }`}
              >
                {b.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recent overs */}
      {computed && computed.recentOvers.length > 0 && (
        <div className="card mt-3 p-4">
          <div className="mb-2 text-sm font-bold">Last {computed.recentOvers.length} Overs</div>
          <div className="space-y-1.5">
            {computed.recentOvers.map((o) => (
              <div key={o.over_number} className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Over {o.over_number}</span>
                <div className="flex items-center gap-1.5">
                  {o.balls.map((b, i) => (
                    <span key={i} className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                      b.is_wicket ? 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-300'
                      : b.is_extra ? 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                    }`}>{b.label}</span>
                  ))}
                  <span className="ml-2 font-semibold tabular-nums">{o.runs} runs{o.wickets > 0 ? `, ${o.wickets} wkt` : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ball-by-ball commentary log */}
      {currentBalls.length > 0 && (
        <div className="card mt-3 p-4">
          <div className="mb-2 text-sm font-bold">Ball-by-Ball</div>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {[...currentBalls].reverse().map((b, i) => {
              const strikerName = players[b.striker_id]?.name ?? 'Unknown';
              const bowlerName = players[b.bowler_id]?.name ?? 'Unknown';
              const totalRuns = b.runs_scored + b.extra_runs;
              let text: string;
              if (b.is_wicket) {
                const dismissedName = players[b.dismissed_player_id ?? '']?.name ?? strikerName;
                const wktLabel = WICKET_TYPES.find((w) => w.value === b.wicket_type)?.label ?? 'Wicket';
                text = `WICKET! ${dismissedName} (${wktLabel}) — ${bowlerName}`;
              } else if (b.extra_type) {
                const extraLabel = EXTRA_TYPES.find((e) => e.value === b.extra_type)?.label ?? b.extra_type;
                text = `${totalRuns} ${extraLabel} — ${bowlerName} to ${strikerName}`;
              } else {
                text = `${b.runs_scored} run${b.runs_scored !== 1 ? 's' : ''} — ${bowlerName} to ${strikerName}`;
              }
              return (
                <div key={b.id ?? i} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs odd:bg-gray-50 dark:odd:bg-gray-800/30">
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

      {/* Scoring controls */}
      <div className="card mt-3 p-4">
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={() => setMode('runs')}
            className={`flex-1 rounded-lg py-2 text-sm font-bold transition-colors ${mode === 'runs' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}
          >Runs</button>
          <button
            onClick={() => setMode('extras')}
            className={`flex-1 rounded-lg py-2 text-sm font-bold transition-colors ${mode === 'extras' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}
          >Extras</button>
          <button
            onClick={() => setMode('wicket')}
            className={`flex-1 rounded-lg py-2 text-sm font-bold transition-colors ${mode === 'wicket' ? 'bg-error-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}
          >Wicket</button>
        </div>

        {mode === 'runs' && (
          <div className="grid grid-cols-4 gap-2.5">
            {[0, 1, 2, 3, 4, 5, 6].map((r) => (
              <button
                key={r}
                onClick={() => recordBall({ runs_scored: r, extra_type: null, extra_runs: 0, is_wicket: false })}
                className={`rounded-2xl py-5 text-xl font-extrabold transition-all active:scale-95 ${
                  r === 4 ? 'bg-primary-500 text-white hover:bg-primary-600'
                  : r === 6 ? 'bg-secondary-500 text-white hover:bg-secondary-600'
                  : r === 0 ? 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200'
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        )}

        {mode === 'extras' && (
          <div className="grid grid-cols-2 gap-2.5">
            {EXTRA_TYPES.map((e) => (
              <button
                key={e.value}
                onClick={() => recordBall({
                  runs_scored: 0,
                  extra_type: e.value,
                  extra_runs: e.value === 'WD' || e.value === 'NB' ? 1 : 1,
                  is_wicket: false,
                })}
                className="rounded-2xl bg-warning-100 py-4 text-base font-bold text-warning-700 transition-all hover:bg-warning-200 active:scale-95 dark:bg-warning-900/30 dark:text-warning-300"
              >
                {e.label}
              </button>
            ))}
            {/* Extra runs options for wide/noball */}
            <div className="col-span-2 flex gap-2">
              {[2, 3, 4, 5].map((r) => (
                <button
                  key={r}
                  onClick={() => recordBall({
                    runs_scored: r === 4 ? 4 : 0,
                    extra_type: r === 4 ? 'NB' : 'WD',
                    extra_runs: r === 4 ? 1 : r,
                    is_wicket: false,
                  })}
                  className="flex-1 rounded-xl bg-gray-100 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200"
                >
                  {r === 4 ? '4 (nb)' : `${r}wd`}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'wicket' && (
          <div className="space-y-2.5">
            <p className="text-sm text-gray-500 dark:text-gray-400">Select wicket type:</p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {WICKET_TYPES.map((w) => (
                <button
                  key={w.value}
                  onClick={() => {
                    setPendingWicket({ type: w.value, dismissedId: strikerId ?? '' });
                    setShowWicketModal(true);
                  }}
                  className="rounded-xl bg-error-100 py-3.5 text-sm font-bold text-error-700 transition-all hover:bg-error-200 active:scale-95 dark:bg-error-900/30 dark:text-error-300"
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Undo */}
        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Undo Last Ball</p>
              {computed?.lastBall && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Last: {computed.lastBall.is_wicket ? 'Wicket' : `${computed.lastBall.runs_scored + computed.lastBall.extra_runs} run${computed.lastBall.runs_scored + computed.lastBall.extra_runs !== 1 ? 's' : ''}`}
                </p>
              )}
            </div>
            <button
              onClick={undoLastBall}
              disabled={currentBalls.length === 0}
              className="btn btn-secondary"
            >
              Undo
            </button>
          </div>
        </div>
      </div>

      {/* Bowler selection modal */}
      <Modal
        open={showBowlerModal}
        onClose={() => {}}
        title={strikerId ? "Select Bowler" : "Select Opening Players"}
        size="md"
      >
        {!strikerId && (
          <div className="mb-4 space-y-3">
            <div>
              <label className="label">Opening Batsman 1</label>
              <select className="input" value={strikerId ?? ''} onChange={(e) => setStrikerId(e.target.value)}>
                <option value="">Select...</option>
                {battingXI.map((pid) => (
                  <option key={pid} value={pid}>{players[pid]?.name ?? pid}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Opening Batsman 2</label>
              <select className="input" value={nonStrikerId ?? ''} onChange={(e) => setNonStrikerId(e.target.value)}>
                <option value="">Select...</option>
                {battingXI.filter((pid) => pid !== strikerId).map((pid) => (
                  <option key={pid} value={pid}>{players[pid]?.name ?? pid}</option>
                ))}
              </select>
            </div>
          </div>
        )}
        <div>
          <label className="label">{strikerId ? 'Select Bowler' : 'Opening Bowler'}</label>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {bowlingXI.map((pid) => (
              <button
                key={pid}
                onClick={() => {
                  setBowlerId(pid);
                  setShowBowlerModal(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg border border-gray-200 p-3 text-left transition-colors hover:border-primary-300 dark:border-gray-700 dark:hover:border-primary-700"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-bold dark:bg-gray-800">
                  {players[pid]?.name.charAt(0).toUpperCase() ?? '?'}
                </div>
                <span className="text-sm font-medium">{players[pid]?.name ?? 'Unknown'}</span>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      {/* End of over modal */}
      <Modal
        open={showEndOverModal && !showNewBatsmanModal}
        onClose={() => setShowEndOverModal(false)}
        title={`End of Over ${(computed?.overNumber ?? 1) - 1}`}
      >
        <div className="mb-4 rounded-xl bg-primary-50 p-4 text-center dark:bg-primary-900/20">
          <p className="text-2xl font-extrabold">{totalRuns}/{totalWickets}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">CRR: {runRate(ballsBowled, totalRuns).toFixed(2)}</p>
        </div>
        <p className="mb-3 text-sm font-semibold">Select next bowler:</p>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {availableBowlers.map((pid) => (
            <button
              key={pid}
              onClick={() => {
                setBowlerId(pid);
                lastOverBowlerRef.current = bowlerId;
                setShowEndOverModal(false);
              }}
              className="flex w-full items-center gap-3 rounded-lg border border-gray-200 p-3 text-left transition-colors hover:border-primary-300 dark:border-gray-700"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-bold dark:bg-gray-800">
                {players[pid]?.name.charAt(0).toUpperCase() ?? '?'}
              </div>
              <span className="text-sm font-medium">{players[pid]?.name ?? 'Unknown'}</span>
            </button>
          ))}
        </div>
      </Modal>

      {/* Wicket modal */}
      <Modal
        open={showWicketModal}
        onClose={() => setShowWicketModal(false)}
        title="Wicket Details"
        footer={
          <>
            <button onClick={() => setShowWicketModal(false)} className="btn btn-secondary">Cancel</button>
            <button
              onClick={async () => {
                if (!pendingWicket) return;
                setShowWicketModal(false);
                recordBall({
                  runs_scored: 0,
                  extra_type: null,
                  extra_runs: 0,
                  is_wicket: true,
                  wicket_type: pendingWicket.type,
                  dismissed_player_id: pendingWicket.dismissedId,
                });
                setPendingWicket(null);
              }}
              className="btn btn-danger"
            >
              Confirm Wicket
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-semibold">Wicket Type: {WICKET_TYPES.find((w) => w.value === pendingWicket?.type)?.label}</p>
          </div>
          <div>
            <label className="label">Dismissed Player</label>
            <select
              className="input"
              value={pendingWicket?.dismissedId ?? ''}
              onChange={(e) => setPendingWicket({ ...pendingWicket!, dismissedId: e.target.value })}
            >
              {battingXI.map((pid) => (
                <option key={pid} value={pid}>{players[pid]?.name ?? 'Unknown'}</option>
              ))}
            </select>
          </div>
          {pendingWicket?.type === 'RUN_OUT' && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              The dismissed player can be either batsman. Select the correct one.
            </p>
          )}
        </div>
      </Modal>

      {/* New batsman modal */}
      <Modal
        open={showNewBatsmanModal}
        onClose={() => {}}
        title="New Batsman"
      >
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Select the new batsman to replace the dismissed player.
        </p>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {availableBatters.map((pid) => (
            <button
              key={pid}
              onClick={() => {
                if (pendingWicket?.dismissedId === strikerId) {
                  setStrikerId(pid);
                } else {
                  setNonStrikerId(pid);
                }
                setShowNewBatsmanModal(false);
              }}
              className="flex w-full items-center gap-3 rounded-lg border border-gray-200 p-3 text-left transition-colors hover:border-primary-300 dark:border-gray-700"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                {players[pid]?.name.charAt(0).toUpperCase() ?? '?'}
              </div>
              <span className="text-sm font-medium">{players[pid]?.name ?? 'Unknown'}</span>
            </button>
          ))}
        </div>
        {availableBatters.length === 0 && (
          <p className="text-center text-sm text-gray-500 py-4">No more batsmen available. Innings will end.</p>
        )}
      </Modal>

      {/* Innings break modal */}
      <Modal
        open={showInningsBreakModal}
        onClose={() => {}}
        title="Innings Break"
        footer={
          <button onClick={startNextInnings} className="btn btn-primary">Start 2nd Innings</button>
        }
      >
        {currentInnings && (
          <div className="space-y-4">
            <div className="rounded-xl bg-gradient-to-r from-primary-700 to-primary-600 p-5 text-white">
              <p className="text-sm text-primary-50/80">Innings {currentInnings.innings_number}</p>
              <p className="text-2xl font-extrabold">{battingTeam?.name}: {currentInnings.total_runs}/{currentInnings.total_wickets}</p>
              <p className="text-sm text-primary-50/80">({oversToString(currentInnings.balls_bowled)} overs)</p>
            </div>
            {currentInnings.innings_number === 1 && (
              <div className="rounded-xl bg-secondary-50 p-4 text-center dark:bg-secondary-900/20">
                <p className="text-sm text-secondary-700 dark:text-secondary-300">Target for {bowlingTeam?.name}</p>
                <p className="text-3xl font-extrabold text-secondary-700 dark:text-secondary-300">{currentInnings.total_runs + 1}</p>
              </div>
            )}
            {computed && (
              <div>
                <p className="mb-1 text-xs font-semibold text-gray-400">Top Scorer</p>
                {computed.battingStats.filter((b) => b.balls > 0).sort((a, b) => b.runs - a.runs)[0] && (
                  <p className="text-sm font-semibold">
                    {computed.battingStats.filter((b) => b.balls > 0).sort((a, b) => b.runs - a.runs)[0].player_name} — {computed.battingStats.filter((b) => b.balls > 0).sort((a, b) => b.runs - a.runs)[0].runs} ({computed.battingStats.filter((b) => b.balls > 0).sort((a, b) => b.runs - a.runs)[0].balls})
                  </p>
                )}
                <p className="mb-1 mt-3 text-xs font-semibold text-gray-400">Best Bowler</p>
                {computed.bowlingStats.filter((b) => b.balls > 0).sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)[0] && (
                  <p className="text-sm font-semibold">
                    {computed.bowlingStats.filter((b) => b.balls > 0).sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)[0].player_name} — {computed.bowlingStats.filter((b) => b.balls > 0).sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)[0].wickets}/{computed.bowlingStats.filter((b) => b.balls > 0).sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)[0].runs}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function BatterRow({ name, stats, isStriker }: { name: string; stats?: { runs: number; balls: number; fours: number; sixes: number; strike_rate: number } | undefined; isStriker?: boolean }) {
  return (
    <div className="mt-1 grid grid-cols-12 gap-2 text-sm">
      <div className="col-span-5 flex items-center gap-1.5 font-semibold truncate">
        {isStriker && <span className="text-primary-500">*</span>}
        <span className="truncate">{name}</span>
      </div>
      <div className="col-span-2 text-right tabular-nums">{stats ? `${stats.runs} (${stats.balls})` : '0 (0)'}</div>
      <div className="col-span-2 text-right tabular-nums">{stats ? `${stats.fours}/${stats.sixes}` : '0/0'}</div>
      <div className="col-span-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{stats ? stats.strike_rate.toFixed(1) : '0.0'}</div>
    </div>
  );
}
