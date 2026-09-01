import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trophy, Users, User, FileText, Radio, Play, ChevronRight, Activity } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Match, Team } from '@/lib/types';
import { oversToString } from '@/lib/cricketEngine';
import PageHeader from '@/components/PageHeader';

export default function HomePage() {
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);
  const [teamCount, setTeamCount] = useState(0);
  const [playerCount, setPlayerCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [live, recent, teams, players] = await Promise.all([
        supabase
          .from('matches')
          .select('*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)')
          .eq('status', 'LIVE')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('matches')
          .select('*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)')
          .eq('status', 'COMPLETED')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase.from('teams').select('id', { count: 'exact', head: true }),
        supabase.from('players').select('id', { count: 'exact', head: true }),
      ]);

      setLiveMatches((live.data as unknown as Match[]) ?? []);
      setRecentMatches((recent.data as unknown as Match[]) ?? []);
      setTeamCount(teams.count ?? 0);
      setPlayerCount(players.count ?? 0);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800 px-6 py-12 text-white shadow-xl sm:px-10 sm:py-16">
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-48 w-48 rounded-full bg-secondary-400/20 blur-3xl" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
            <Activity className="h-3.5 w-3.5" />
            Cricket Scoring Platform
          </div>
          <h1 className="mt-4 max-w-xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Score every ball.<br />Track every match.
          </h1>
          <p className="mt-3 max-w-md text-sm text-primary-50/90 sm:text-base">
            Create matches, manage teams, record ball-by-ball action, and generate professional scorecards — all in real time.
          </p>
          <Link
            to="/start-match"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-base font-bold text-primary-700 shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]"
          >
            <Plus className="h-5 w-5" />
            Start New Match
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={<Trophy className="h-5 w-5" />} label="Total Matches" value={loading ? null : liveMatches.length + recentMatches.length} color="primary" />
        <StatCard icon={<Radio className="h-5 w-5" />} label="Live Now" value={loading ? null : liveMatches.length} color="error" />
        <StatCard icon={<Users className="h-5 w-5" />} label="Teams" value={loading ? null : teamCount} color="accent" />
        <StatCard icon={<User className="h-5 w-5" />} label="Players" value={loading ? null : playerCount} color="secondary" />
      </section>

      {/* Live Matches */}
      <section className="mt-8">
        <SectionHeader title="Live Matches" icon={<Radio className="h-5 w-5" />} link="/live" />
        {loading ? (
          <div className="card p-8 text-center text-sm text-gray-500">Loading matches…</div>
        ) : liveMatches.length === 0 ? (
          <div className="card p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No live matches right now. Start one to see it here.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {liveMatches.map((m) => (
              <LiveMatchCard key={m.id} match={m} />
            ))}
          </div>
        )}
      </section>

      {/* Recent Matches */}
      <section className="mt-8">
        <SectionHeader title="Recent Matches" icon={<Trophy className="h-5 w-5" />} link="/matches" />
        {loading ? (
          <div className="card p-8 text-center text-sm text-gray-500">Loading matches…</div>
        ) : recentMatches.length === 0 ? (
          <div className="card p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No completed matches yet.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {recentMatches.map((m) => (
              <RecentMatchRow key={m.id} match={m} />
            ))}
          </div>
        )}
      </section>

      {/* Quick Actions */}
      <section className="mt-8">
        <SectionHeader title="Quick Actions" icon={<Play className="h-5 w-5" />} link="/start-match" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <QuickAction to="/start-match" icon={<Plus className="h-6 w-6" />} label="Start Match" />
          <QuickAction to="/teams" icon={<Users className="h-6 w-6" />} label="My Teams" />
          <QuickAction to="/players" icon={<User className="h-6 w-6" />} label="Players" />
          <QuickAction to="/scorecards" icon={<FileText className="h-6 w-6" />} label="Scorecards" />
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | null; color: string }) {
  const colorMap: Record<string, string> = {
    primary: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
    error: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-300',
    accent: 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300',
    secondary: 'bg-secondary-100 text-secondary-700 dark:bg-secondary-900/30 dark:text-secondary-300',
  };
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colorMap[color]}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-extrabold leading-none tabular-nums">{value === null ? '—' : value}</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}

function SectionHeader({ title, icon, link }: { title: string; icon: React.ReactNode; link: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-primary-600 dark:text-primary-400">{icon}</span>
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <Link to={link} className="flex items-center gap-0.5 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
        View all <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function LiveMatchCard({ match }: { match: Match }) {
  return (
    <Link to={`/match/${match.id}`} className="card group block overflow-hidden p-5 transition-all hover:shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <span className="badge bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-300">
          <span className="live-dot mr-1.5" /> LIVE
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{match.format}</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{match.team_a?.name ?? 'Team A'}</div>
        <div className="text-xs text-gray-400">vs</div>
        <div className="text-sm font-semibold">{match.team_b?.name ?? 'Team B'}</div>
      </div>
      <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        {match.venue ?? 'Venue TBD'} · {match.tournament ?? 'Friendly'}
      </div>
    </Link>
  );
}

function RecentMatchRow({ match }: { match: Match }) {
  return (
    <Link to={`/match/${match.id}`} className="card group flex items-center justify-between p-4 transition-all hover:shadow-md">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">
          {match.team_a?.name ?? 'Team A'} vs {match.team_b?.name ?? 'Team B'}
        </p>
        <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
          {match.result ?? 'Result pending'}
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function QuickAction({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="card group flex flex-col items-center gap-3 p-5 text-center transition-all hover:shadow-md hover:border-primary-300 dark:hover:border-primary-700"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100 text-primary-700 transition-transform group-hover:scale-110 dark:bg-primary-900/30 dark:text-primary-300">
        {icon}
      </div>
      <span className="text-sm font-semibold">{label}</span>
    </Link>
  );
}
