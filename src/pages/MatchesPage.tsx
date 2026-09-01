import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Plus, ChevronRight, Calendar, MapPin, Play } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Match } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import Loading from '@/components/Loading';

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('matches')
      .select('*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)')
      .order('created_at', { ascending: false });
    setMatches((data as unknown as Match[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? matches : matches.filter((m) => m.status === filter);

  const filters = [
    { value: 'all', label: 'All' },
    { value: 'LIVE', label: 'Live' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'SETUP', label: 'Setup' },
    { value: 'PAUSED', label: 'Paused' },
  ];

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Matches"
        subtitle="All your cricket matches"
        icon={<Trophy className="h-5 w-5" />}
        action={
          <Link to="/start-match" className="btn btn-primary">
            <Plus className="h-4 w-4" /> New Match
          </Link>
        }
      />

      <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f.value
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-8 w-8" />}
          title="No matches found"
          description="Start a new match to see it here."
          action={
            <Link to="/start-match" className="btn btn-primary">
              <Plus className="h-4 w-4" /> Start Match
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((m) => (
            <Link key={m.id} to={`/match/${m.id}`} className="card group p-4 transition-all hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    {m.status === 'LIVE' && (
                      <span className="badge bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-300">
                        <span className="live-dot mr-1" /> LIVE
                      </span>
                    )}
                    {m.status === 'COMPLETED' && (
                      <span className="badge bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-300">
                        Completed
                      </span>
                    )}
                    {m.status === 'PAUSED' && (
                      <span className="badge bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-300">
                        Paused
                      </span>
                    )}
                    {m.status === 'SETUP' && (
                      <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        Setup
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{m.format}</span>
                  </div>
                  <p className="truncate font-bold">
                    {m.team_a?.name ?? 'Team A'} vs {m.team_b?.name ?? 'Team B'}
                  </p>
                  {m.result && (
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{m.result}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-400">
                    {m.match_date && <span className="flex items-center gap-0.5"><Calendar className="h-3 w-3" /> {m.match_date}</span>}
                    {m.venue && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" /> {m.venue}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {(m.status === 'LIVE' || m.status === 'PAUSED') && (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
                      <Play className="h-4 w-4 fill-current" />
                    </span>
                  )}
                  <ChevronRight className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
