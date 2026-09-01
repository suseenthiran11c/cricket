import type {
  Ball,
  Innings,
  Player,
  BattingStat,
  BowlingStat,
  OverSummary,
  BallDisplay,
} from './types';

export function oversToString(ballsBowled: number): string {
  const safe = Math.max(0, ballsBowled);
  const overs = Math.floor(safe / 6);
  const balls = safe % 6;
  return balls === 0 ? `${overs}` : `${overs}.${balls}`;
}

export function runRate(ballsBowled: number, runs: number): number {
  const safeBalls = Math.max(0, ballsBowled);
  if (safeBalls === 0) return 0;
  return (Math.max(0, runs) / safeBalls) * 6;
}

export function requiredRunRate(
  runsNeeded: number,
  ballsRemaining: number
): number {
  const safeBalls = Math.max(0, ballsRemaining);
  if (safeBalls <= 0) return 0;
  return (Math.max(0, runsNeeded) / safeBalls) * 6;
}

export function isLegalBall(ball: Ball): boolean {
  return ball.extra_type === null;
}

export function labelBall(ball: Ball): string {
  if (ball.is_wicket) {
    if (ball.extra_type === 'NB') return 'W+nb';
    return 'W';
  }
  const runs = ball.runs_scored + ball.extra_runs;
  switch (ball.extra_type) {
    case 'WD':
      return `${runs}wd`;
    case 'NB':
      return ball.runs_scored > 0 ? `${runs}nb` : 'nb';
    case 'BYE':
      return `${ball.extra_runs}b`;
    case 'LEG_BYE':
      return `${ball.extra_runs}lb`;
    default:
      return String(ball.runs_scored);
  }
}

export function ballToDisplay(ball: Ball): BallDisplay {
  return {
    label: labelBall(ball),
    is_wicket: ball.is_wicket,
    is_extra: ball.extra_type !== null,
  };
}

export interface ComputedInnings {
  totalRuns: number;
  totalWickets: number;
  ballsBowled: number;
  extras: number;
  oversString: string;
  currentRunRate: number;
  battingStats: BattingStat[];
  bowlingStats: BowlingStat[];
  currentOverBalls: BallDisplay[];
  recentOvers: OverSummary[];
  lastBall: Ball | null;
  isOverComplete: boolean;
  overNumber: number;
  ballInOver: number;
}

export function computeInnings(
  innings: Innings,
  balls: Ball[],
  players: Record<string, Player>
): ComputedInnings {
  const battingMap = new Map<string, BattingStat>();
  const bowlingMap = new Map<string, BowlingStat>();

  let totalRuns = 0;
  let totalWickets = 0;
  let ballsBowled = 0;
  let extras = 0;

  const ensureBatter = (pid: string): BattingStat => {
    if (!battingMap.has(pid)) {
      battingMap.set(pid, {
        player_id: pid,
        player_name: players[pid]?.name ?? 'Unknown',
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        out: false,
        how_out: null,
        strike_rate: 0,
      });
    }
    return battingMap.get(pid)!;
  };

  const ensureBowler = (pid: string): BowlingStat => {
    if (!bowlingMap.has(pid)) {
      bowlingMap.set(pid, {
        player_id: pid,
        player_name: players[pid]?.name ?? 'Unknown',
        overs: '0',
        balls: 0,
        maidens: 0,
        runs: 0,
        wickets: 0,
        economy: 0,
      });
    }
    return bowlingMap.get(pid)!;
  };

  const overRunsMap = new Map<number, number>();
  const overBallsMap = new Map<number, Ball[]>();

  for (const ball of balls) {
    const legal = isLegalBall(ball);
    const totalBallRuns = ball.runs_scored + ball.extra_runs;

    totalRuns += totalBallRuns;
    if (legal) ballsBowled += 1;
    if (ball.extra_type) extras += ball.extra_runs;

    // Batting stats
    if (ball.extra_type === null) {
      const batter = ensureBatter(ball.striker_id);
      batter.runs += ball.runs_scored;
      batter.balls += 1;
      if (ball.runs_scored === 4) batter.fours += 1;
      if (ball.runs_scored === 6) batter.sixes += 1;
    } else if (ball.extra_type === 'BYE' || ball.extra_type === 'LEG_BYE') {
      const batter = ensureBatter(ball.striker_id);
      batter.balls += 1;
    }

    // Wicket
    if (ball.is_wicket) {
      totalWickets += 1;
      const dismissedId = ball.dismissed_player_id ?? ball.striker_id;
      const dismissed = ensureBatter(dismissedId);
      dismissed.out = true;
      dismissed.how_out = formatWicket(ball, players);
    }

    // Bowling stats
    const bowler = ensureBowler(ball.bowler_id);
    bowler.balls += legal ? 1 : 0;
    bowler.runs += totalBallRuns;
    if (ball.is_wicket && ball.wicket_type !== 'RUN_OUT') {
      bowler.wickets += 1;
    }

    // Over tracking
    const overNum = ball.over_number;
    if (!overRunsMap.has(overNum)) {
      overRunsMap.set(overNum, 0);
      overBallsMap.set(overNum, []);
    }
    overRunsMap.set(overNum, overRunsMap.get(overNum)! + totalBallRuns);
    overBallsMap.get(overNum)!.push(ball);
  }

  // Maidens
  for (const [overNum, runs] of overRunsMap) {
    if (runs === 0) {
      const ballsInOver = overBallsMap.get(overNum) ?? [];
      const bowlerId = ballsInOver[0]?.bowler_id;
      if (bowlerId && bowlingMap.has(bowlerId)) {
        bowlingMap.get(bowlerId)!.maidens += 1;
      }
    }
  }

  // Strike rates and economy
  for (const b of battingMap.values()) {
    b.strike_rate = b.balls > 0 ? (b.runs / b.balls) * 100 : 0;
  }
  for (const b of bowlingMap.values()) {
    b.overs = oversToString(b.balls);
    b.economy = b.balls > 0 ? (b.runs / b.balls) * 6 : 0;
  }

  // Over/ball position from legal balls
  const legalBalls = balls.filter(isLegalBall);
  const lastLegal = legalBalls[legalBalls.length - 1] ?? null;

  let overNumber = 1;
  let ballInOver = 1;
  let isOverComplete = false;

  if (lastLegal) {
    overNumber = lastLegal.over_number;
    ballInOver = lastLegal.ball_number;
    if (lastLegal.ball_number >= 6) {
      isOverComplete = true;
      overNumber = lastLegal.over_number + 1;
      ballInOver = 1;
    }
  }

  // Current over display
  const displayOverNumber = isOverComplete ? overNumber - 1 : overNumber;
  const currentOverBalls: BallDisplay[] = (overBallsMap.get(displayOverNumber) ?? []).map(ballToDisplay);

  // Recent overs (last 5 completed)
  const allOverNumbers = Array.from(overBallsMap.keys()).sort((a, b) => a - b);
  const recentSource = isOverComplete
    ? allOverNumbers.slice(-6, -1)
    : allOverNumbers.slice(0, -1).slice(-5);
  const recentOvers: OverSummary[] = recentSource.map((on) => ({
    over_number: on,
    runs: overRunsMap.get(on) ?? 0,
    wickets: (overBallsMap.get(on) ?? []).filter((b) => b.is_wicket).length,
    balls: (overBallsMap.get(on) ?? []).map(ballToDisplay),
  }));

  return {
    totalRuns,
    totalWickets,
    ballsBowled,
    extras,
    oversString: oversToString(ballsBowled),
    currentRunRate: runRate(ballsBowled, totalRuns),
    battingStats: Array.from(battingMap.values()),
    bowlingStats: Array.from(bowlingMap.values()),
    currentOverBalls,
    recentOvers,
    lastBall: balls[balls.length - 1] ?? null,
    isOverComplete,
    overNumber,
    ballInOver,
  };
}

function formatWicket(ball: Ball, players: Record<string, Player>): string {
  const bowlerName = players[ball.bowler_id]?.name ?? '';
  switch (ball.wicket_type) {
    case 'BOWLED':
      return `b ${bowlerName}`;
    case 'LBW':
      return `lbw b ${bowlerName}`;
    case 'CAUGHT':
      return `c & b ${bowlerName}`;
    case 'RUN_OUT':
      return 'run out';
    case 'STUMPED':
      return `st ${bowlerName}`;
    case 'HIT_WICKET':
      return `hit wkt b ${bowlerName}`;
    case 'RETIRED_OUT':
      return 'retired out';
    default:
      return 'out';
  }
}

export function nextBallPosition(
  balls: Ball[]
): { over_number: number; ball_number: number } {
  const legalBalls = balls.filter(isLegalBall);
  if (legalBalls.length === 0) {
    return { over_number: 1, ball_number: 1 };
  }
  const lastLegal = legalBalls[legalBalls.length - 1];
  if (lastLegal.ball_number >= 6) {
    return { over_number: lastLegal.over_number + 1, ball_number: 1 };
  }
  return {
    over_number: lastLegal.over_number,
    ball_number: lastLegal.ball_number + 1,
  };
}

export function shouldSwapStrike(
  runs: number,
  extraType: string | null,
  extraRuns: number,
  isOverEnd: boolean
): boolean {
  let swap = false;
  if (extraType === null) {
    swap = runs % 2 === 1;
  } else if (extraType === 'BYE' || extraType === 'LEG_BYE') {
    swap = extraRuns % 2 === 1;
  } else if (extraType === 'NB') {
    swap = runs % 2 === 1;
  }
  if (isOverEnd) swap = !swap;
  return swap;
}

export function determineBattingTeam(
  tossWinnerId: string,
  tossDecision: string,
  teamAId: string,
  teamBId: string
): string {
  if (tossDecision === 'BAT') return tossWinnerId;
  return tossWinnerId === teamAId ? teamBId : teamAId;
}

export function computeResult(
  innings1Runs: number,
  innings2Runs: number,
  innings1BattingTeamId: string,
  innings2BattingTeamId: string,
  teamMap: Record<string, string>,
  innings2Wickets: number
): string {
  const team1Name = teamMap[innings1BattingTeamId] ?? 'Team 1';
  const team2Name = teamMap[innings2BattingTeamId] ?? 'Team 2';

  if (innings2Runs > innings1Runs) {
    const wicketsLeft = 10 - innings2Wickets;
    return `${team2Name} won by ${wicketsLeft} wickets`;
  } else if (innings1Runs > innings2Runs) {
    const margin = innings1Runs - innings2Runs;
    return `${team1Name} won by ${margin} runs`;
  } else {
    return 'Match Tied';
  }
}
