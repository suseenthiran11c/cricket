import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Team, Player, Match, MatchPlayer } from '@/lib/types';
import { MATCH_FORMATS, BALL_TYPES, PITCH_TYPES, TOSS_DECISIONS } from '@/lib/constants';
import { determineBattingTeam } from '@/lib/cricketEngine';

const STEPS = ['Match Type', 'Match Details', 'Select Teams', 'Playing XI', 'Toss', 'Opening Players'];

export default function StartMatchPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1: Match type
  const [format, setFormat] = useState('T20');
  const [customOvers, setCustomOvers] = useState(20);

  // Step 2: Match details
  const [details, setDetails] = useState({
    name: '',
    tournament: '',
    venue: '',
    match_date: '',
    start_time: '',
    innings_count: 2,
    ball_type: 'Leather',
    pitch_type: 'Turf',
  });

  // Step 3: Teams
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamAId, setTeamAId] = useState('');
  const [teamBId, setTeamBId] = useState('');
  const [playersByTeam, setPlayersByTeam] = useState<Record<string, Player[]>>({});

  // Step 4: Playing XI
  const [selectedXI, setSelectedXI] = useState<Record<string, string[]>>({});
  const [captainMap, setCaptainMap] = useState<Record<string, string>>({});
  const [keeperMap, setKeeperMap] = useState<Record<string, string>>({});

  // Step 5: Toss
  const [tossWinnerId, setTossWinnerId] = useState('');
  const [tossDecision, setTossDecision] = useState('BAT');

  // Step 6: Opening players
  const [openingBatsman1, setOpeningBatsman1] = useState('');
  const [openingBatsman2, setOpeningBatsman2] = useState('');
  const [openingBowler, setOpeningBowler] = useState('');

  const oversLimit = format === 'CUSTOM' ? customOvers : MATCH_FORMATS.find((f) => f.value === format)?.overs ?? 20;

  const loadTeams = useCallback(async () => {
    const { data } = await supabase.from('teams').select('*').order('name');
    setTeams((data as Team[]) ?? []);
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const loadPlayersForTeam = useCallback(async (teamId: string) => {
    if (playersByTeam[teamId]) return;
    const { data } = await supabase
      .from('players')
      .select('*')
      .eq('team_id', teamId)
      .order('name');
    setPlayersByTeam((prev) => ({ ...prev, [teamId]: (data as Player[]) ?? [] }));
  }, [playersByTeam]);

  useEffect(() => {
    if (teamAId) loadPlayersForTeam(teamAId);
    if (teamBId) loadPlayersForTeam(teamBId);
  }, [teamAId, teamBId, loadPlayersForTeam]);

  const battingTeamId = determineBattingTeam(tossWinnerId, tossDecision, teamAId, teamBId);
  const bowlingTeamId = battingTeamId === teamAId ? teamBId : teamAId;
  const battingXI = selectedXI[battingTeamId] ?? [];
  const bowlingXI = selectedXI[bowlingTeamId] ?? [];

  function togglePlayer(teamId: string, playerId: string) {
    setSelectedXI((prev) => {
      const current = prev[teamId] ?? [];
      if (current.includes(playerId)) {
        return { ...prev, [teamId]: current.filter((id) => id !== playerId) };
      }
      if (current.length >= 11) return prev;
      return { ...prev, [teamId]: [...current, playerId] };
    });
  }

  function canProceed(): boolean {
    switch (step) {
      case 0: return true;
      case 1: return !!details.name.trim();
      case 2: return !!teamAId && !!teamBId && teamAId !== teamBId;
      case 3:
        return (selectedXI[teamAId]?.length === 11) && (selectedXI[teamBId]?.length === 11)
          && !!captainMap[teamAId] && !!captainMap[teamBId];
      case 4: return !!tossWinnerId && !!tossDecision;
      case 5:
        return !!openingBatsman1 && !!openingBatsman2 && !!openingBowler
          && openingBatsman1 !== openingBatsman2
          && battingXI.includes(openingBatsman1) && battingXI.includes(openingBatsman2)
          && bowlingXI.includes(openingBowler);
      default: return false;
    }
  }

  async function finish() {
    setSaving(true);
    const matchName = details.name.trim() || `${getTeamName(teamAId)} vs ${getTeamName(teamBId)}`;

    // 1. Create match
    const { data: matchData, error: matchErr } = await supabase
      .from('matches')
      .insert({
        name: matchName,
        tournament: details.tournament || null,
        venue: details.venue || null,
        match_date: details.match_date || null,
        start_time: details.start_time || null,
        format,
        overs_limit: oversLimit,
        innings_count: details.innings_count,
        ball_type: details.ball_type,
        pitch_type: details.pitch_type,
        team_a_id: teamAId,
        team_b_id: teamBId,
        status: 'LIVE',
        toss_winner_team_id: tossWinnerId,
        toss_decision: tossDecision,
        current_innings: 1,
      })
      .select()
      .single();

    if (matchErr || !matchData) {
      alert('Failed to create match: ' + (matchErr?.message ?? 'Unknown error'));
      setSaving(false);
      return;
    }

    const match = matchData as Match;

    // 2. Save playing XI
    const mpRows: Omit<MatchPlayer, 'id'>[] = [];
    for (const pid of selectedXI[teamAId] ?? []) {
      mpRows.push({
        match_id: match.id, player_id: pid, team_id: teamAId,
        is_captain: captainMap[teamAId] === pid,
        is_wicketkeeper: keeperMap[teamAId] === pid,
      } as Omit<MatchPlayer, 'id'>);
    }
    for (const pid of selectedXI[teamBId] ?? []) {
      mpRows.push({
        match_id: match.id, player_id: pid, team_id: teamBId,
        is_captain: captainMap[teamBId] === pid,
        is_wicketkeeper: keeperMap[teamBId] === pid,
      } as Omit<MatchPlayer, 'id'>);
    }
    await supabase.from('match_players').insert(mpRows);

    // 3. Create first innings
    await supabase.from('innings').insert({
      match_id: match.id,
      innings_number: 1,
      batting_team_id: battingTeamId,
      bowling_team_id: bowlingTeamId,
      total_runs: 0,
      total_wickets: 0,
      balls_bowled: 0,
      extras: 0,
      is_complete: false,
    });

    setSaving(false);
    navigate(`/score/${match.id}`);
  }

  function getTeamName(id: string): string {
    return teams.find((t) => t.id === id)?.name ?? 'Team';
  }

  function getPlayers(teamId: string): Player[] {
    return playersByTeam[teamId] ?? [];
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Stepper */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                  i < step
                    ? 'bg-primary-600 text-white'
                    : i === step
                    ? 'bg-primary-600 text-white ring-4 ring-primary-100 dark:ring-primary-900/30'
                    : 'bg-gray-200 text-gray-400 dark:bg-gray-800'
                }`}
              >
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`hidden text-center text-[11px] font-medium sm:block ${
                i <= step ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'
              }`}>
                {label}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
          <div
            className="h-full rounded-full bg-primary-600 transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="card animate-fade-in p-6">
        {/* Step 0: Match Type */}
        {step === 0 && (
          <div>
            <h2 className="mb-1 text-xl font-bold">Select Match Type</h2>
            <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">Choose the format for your match.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {MATCH_FORMATS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFormat(f.value)}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    format === f.value
                      ? 'border-primary-500 bg-primary-50 dark:border-primary-500 dark:bg-primary-900/20'
                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                  }`}
                >
                  <p className="font-bold">{f.label}</p>
                  {f.overs > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">{f.overs} overs</p>
                  )}
                </button>
              ))}
            </div>
            {format === 'CUSTOM' && (
              <div className="mt-4">
                <label className="label">Number of Overs</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  className="input"
                  value={customOvers}
                  onChange={(e) => setCustomOvers(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
            )}
          </div>
        )}

        {/* Step 1: Match Details */}
        {step === 1 && (
          <div>
            <h2 className="mb-1 text-xl font-bold">Match Details</h2>
            <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">Enter the basic match information.</p>
            <div className="space-y-4">
              <div>
                <label className="label">Match Name <span className="text-error-500">*</span></label>
                <input className="input" value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} placeholder="e.g. Chennai vs Coimbatore" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Tournament</label>
                  <input className="input" value={details.tournament} onChange={(e) => setDetails({ ...details, tournament: e.target.value })} placeholder="e.g. College Cricket Cup" />
                </div>
                <div>
                  <label className="label">Venue</label>
                  <input className="input" value={details.venue} onChange={(e) => setDetails({ ...details, venue: e.target.value })} placeholder="e.g. ABC Cricket Ground" />
                </div>
                <div>
                  <label className="label">Date</label>
                  <input type="date" className="input" value={details.match_date} onChange={(e) => setDetails({ ...details, match_date: e.target.value })} />
                </div>
                <div>
                  <label className="label">Start Time</label>
                  <input type="time" className="input" value={details.start_time} onChange={(e) => setDetails({ ...details, start_time: e.target.value })} />
                </div>
                <div>
                  <label className="label">Number of Innings</label>
                  <select className="input" value={details.innings_count} onChange={(e) => setDetails({ ...details, innings_count: parseInt(e.target.value) })}>
                    <option value={1}>1 Innings</option>
                    <option value={2}>2 Innings</option>
                    <option value={4}>4 Innings (Test)</option>
                  </select>
                </div>
                <div>
                  <label className="label">Ball Type</label>
                  <select className="input" value={details.ball_type} onChange={(e) => setDetails({ ...details, ball_type: e.target.value })}>
                    {BALL_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Pitch Type</label>
                  <select className="input" value={details.pitch_type} onChange={(e) => setDetails({ ...details, pitch_type: e.target.value })}>
                    {PITCH_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="rounded-xl bg-gray-50 p-3 text-sm dark:bg-gray-800/50">
                <span className="text-gray-500 dark:text-gray-400">Format: </span>
                <span className="font-semibold">{format === 'CUSTOM' ? `Custom (${customOvers} overs)` : format}</span>
                <span className="text-gray-500 dark:text-gray-400"> · Overs: </span>
                <span className="font-semibold">{oversLimit}</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Select Teams */}
        {step === 2 && (
          <div>
            <h2 className="mb-1 text-xl font-bold">Select Teams</h2>
            <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">Choose two teams for the match.</p>
            <div className="space-y-4">
              <TeamSelector label="Team A" teams={teams} value={teamAId} onChange={setTeamAId} excludeId={teamBId} />
              <div className="flex items-center justify-center">
                <span className="rounded-lg bg-gray-100 px-4 py-1.5 text-sm font-bold text-gray-500 dark:bg-gray-800 dark:text-gray-400">VS</span>
              </div>
              <TeamSelector label="Team B" teams={teams} value={teamBId} onChange={setTeamBId} excludeId={teamAId} />
            </div>
            {(teamAId || teamBId) && (
              <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                {(getPlayers(teamAId).length < 11 || getPlayers(teamBId).length < 11) && (
                  <p>Tip: Each team needs at least 11 players. Add players from the Teams page if needed.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Playing XI */}
        {step === 3 && (
          <div>
            <h2 className="mb-1 text-xl font-bold">Playing XI</h2>
            <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">Select 11 players and assign captain & wicketkeeper for each team.</p>
            <XISelector
              teamName={getTeamName(teamAId)}
              teamColor={teams.find((t) => t.id === teamAId)?.color}
              players={getPlayers(teamAId)}
              selected={selectedXI[teamAId] ?? []}
              onToggle={(pid) => togglePlayer(teamAId, pid)}
              captain={captainMap[teamAId] ?? ''}
              onCaptain={(pid) => setCaptainMap({ ...captainMap, [teamAId]: pid })}
              keeper={keeperMap[teamAId] ?? ''}
              onKeeper={(pid) => setKeeperMap({ ...keeperMap, [teamAId]: pid })}
            />
            <div className="my-6 h-px bg-gray-200 dark:bg-gray-800" />
            <XISelector
              teamName={getTeamName(teamBId)}
              teamColor={teams.find((t) => t.id === teamBId)?.color}
              players={getPlayers(teamBId)}
              selected={selectedXI[teamBId] ?? []}
              onToggle={(pid) => togglePlayer(teamBId, pid)}
              captain={captainMap[teamBId] ?? ''}
              onCaptain={(pid) => setCaptainMap({ ...captainMap, [teamBId]: pid })}
              keeper={keeperMap[teamBId] ?? ''}
              onKeeper={(pid) => setKeeperMap({ ...keeperMap, [teamBId]: pid })}
            />
          </div>
        )}

        {/* Step 4: Toss */}
        {step === 4 && (
          <div>
            <h2 className="mb-1 text-xl font-bold">Toss</h2>
            <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">Who won the toss and what did they choose?</p>
            <div className="mb-5 flex items-center justify-center gap-4">
              <span className="font-bold">{getTeamName(teamAId)}</span>
              <span className="text-sm text-gray-400">VS</span>
              <span className="font-bold">{getTeamName(teamBId)}</span>
            </div>
            <div className="mb-4">
              <label className="label">Who won the toss?</label>
              <div className="grid grid-cols-2 gap-3">
                {[teamAId, teamBId].map((tid) => (
                  <button
                    key={tid}
                    onClick={() => setTossWinnerId(tid)}
                    className={`rounded-xl border-2 p-4 font-semibold transition-all ${
                      tossWinnerId === tid
                        ? 'border-primary-500 bg-primary-50 dark:border-primary-500 dark:bg-primary-900/20'
                        : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'
                    }`}
                  >
                    {getTeamName(tid)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Choose decision</label>
              <div className="grid grid-cols-2 gap-3">
                {TOSS_DECISIONS.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setTossDecision(d.value)}
                    className={`rounded-xl border-2 p-4 font-semibold transition-all ${
                      tossDecision === d.value
                        ? 'border-primary-500 bg-primary-50 dark:border-primary-500 dark:bg-primary-900/20'
                        : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            {tossWinnerId && (
              <div className="mt-4 rounded-xl bg-primary-50 p-3 text-sm dark:bg-primary-900/20">
                <span className="font-semibold">{getTeamName(battingTeamId)}</span> will bat first.
              </div>
            )}
          </div>
        )}

        {/* Step 5: Opening Players */}
        {step === 5 && (
          <div>
            <h2 className="mb-1 text-xl font-bold">Opening Players</h2>
            <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
              Select the opening batsmen for <span className="font-semibold">{getTeamName(battingTeamId)}</span> and the opening bowler for <span className="font-semibold">{getTeamName(bowlingTeamId)}</span>.
            </p>
            <div className="space-y-4">
              <div>
                <label className="label">Opening Batsman 1</label>
                <select className="input" value={openingBatsman1} onChange={(e) => setOpeningBatsman1(e.target.value)}>
                  <option value="">Select player...</option>
                  {battingXI.map((pid) => {
                    const p = getPlayers(battingTeamId).find((x) => x.id === pid);
                    return <option key={pid} value={pid}>{p?.name}</option>;
                  })}
                </select>
              </div>
              <div>
                <label className="label">Opening Batsman 2</label>
                <select className="input" value={openingBatsman2} onChange={(e) => setOpeningBatsman2(e.target.value)}>
                  <option value="">Select player...</option>
                  {battingXI.filter((pid) => pid !== openingBatsman1).map((pid) => {
                    const p = getPlayers(battingTeamId).find((x) => x.id === pid);
                    return <option key={pid} value={pid}>{p?.name}</option>;
                  })}
                </select>
              </div>
              <div>
                <label className="label">Opening Bowler</label>
                <select className="input" value={openingBowler} onChange={(e) => setOpeningBowler(e.target.value)}>
                  <option value="">Select player...</option>
                  {bowlingXI.map((pid) => {
                    const p = getPlayers(bowlingTeamId).find((x) => x.id === pid);
                    return <option key={pid} value={pid}>{p?.name}</option>;
                  })}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={() => step === 0 ? navigate('/') : setStep(step - 1)}
            className="btn btn-secondary"
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">Step {step + 1} of {STEPS.length}</span>
            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canProceed()}
                className="btn btn-primary"
              >
                Continue
              </button>
            ) : (
              <button
                onClick={finish}
                disabled={!canProceed() || saving}
                className="btn btn-primary"
              >
                {saving ? 'Starting...' : 'Begin Scoring'}
              </button>
            )}
          </div>
        </div>

        {/* Validation messages */}
        {step === 3 && (selectedXI[teamAId]?.length !== 11 || selectedXI[teamBId]?.length !== 11) && (
          <p className="mt-3 text-center text-sm text-error-500">
            Select exactly 11 players for each team ({selectedXI[teamAId]?.length ?? 0}/11 and {selectedXI[teamBId]?.length ?? 0}/11)
          </p>
        )}
        {step === 5 && openingBatsman1 && openingBatsman2 && openingBatsman1 === openingBatsman2 && (
          <p className="mt-3 text-center text-sm text-error-500">Both opening batsmen must be different players.</p>
        )}
      </div>
    </div>
  );
}

function TeamSelector({ label, teams, value, onChange, excludeId }: {
  label: string;
  teams: Team[];
  value: string;
  onChange: (id: string) => void;
  excludeId: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select team...</option>
        {teams.filter((t) => t.id !== excludeId).map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      {value && (
        <div className="mt-2 flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: teams.find((t) => t.id === value)?.color ?? '#22a064' }} />
          <span className="text-sm text-gray-500 dark:text-gray-400">{teams.find((t) => t.id === value)?.name}</span>
        </div>
      )}
    </div>
  );
}

function XISelector({ teamName, teamColor, players, selected, onToggle, captain, onCaptain, keeper, onKeeper }: {
  teamName: string;
  teamColor?: string | null;
  players: Player[];
  selected: string[];
  onToggle: (id: string) => void;
  captain: string;
  onCaptain: (id: string) => void;
  keeper: string;
  onKeeper: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: teamColor ?? '#22a064' }} />
        <h3 className="font-bold text-lg">{teamName}</h3>
        <span className={`badge ${selected.length === 11 ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>
          {selected.length}/11
        </span>
      </div>
      {players.length === 0 ? (
        <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500 dark:bg-gray-800/50">No players in this team. Add players from the Teams page.</p>
      ) : (
        <div className="space-y-2">
          {players.map((p) => {
            const isSelected = selected.includes(p.id);
            return (
              <div
                key={p.id}
                className={`flex items-center justify-between rounded-lg border p-2.5 transition-colors ${
                  isSelected ? 'border-primary-300 bg-primary-50 dark:border-primary-700 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <button onClick={() => onToggle(p.id)} className="flex flex-1 items-center gap-2.5 text-left">
                  <div className={`flex h-5 w-5 items-center justify-center rounded border-2 ${
                    isSelected ? 'border-primary-500 bg-primary-500 text-white' : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {isSelected && <span className="text-xs">✓</span>}
                  </div>
                  <span className={`text-sm font-medium ${isSelected ? '' : 'text-gray-500 dark:text-gray-400'}`}>{p.name}</span>
                  {p.role && <span className="text-xs text-gray-400">· {p.role}</span>}
                </button>
                {isSelected && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => onCaptain(captain === p.id ? '' : p.id)}
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${
                        captain === p.id ? 'bg-secondary-500 text-white' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                      }`}
                    >
                      C
                    </button>
                    <button
                      onClick={() => onKeeper(keeper === p.id ? '' : p.id)}
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${
                        keeper === p.id ? 'bg-accent-500 text-white' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                      }`}
                    >
                      WK
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
