import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FileText, ChevronRight, Calendar, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Match } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import Loading from '@/components/Loading';

export default function ScorecardsPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('matches')
      .select('*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)')
      .eq('status', 'COMPLETED')
      .order('created_at', { ascending: false });
    setMatches((data as unknown as Match[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Scorecards" subtitle="Completed match scorecards" icon={<FileText className="h-5 w-5" />} />

      {matches.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title="No completed matches"
          description="Once you finish a match, its full scorecard will appear here."
          action={<Link to="/start-match" className="btn btn-primary">Start a Match</Link>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {matches.map((m) => (
            <Link key={m.id} to={`/match/${m.id}`} className="card group p-4 transition-all hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">
                    {m.team_a?.name ?? 'Team A'} vs {m.team_b?.name ?? 'Team B'}
                  </p>
                  {m.result && (
                    <p className="mt-1 rounded-lg bg-success-50 px-2 py-1 text-xs font-semibold text-success-700 dark:bg-success-900/20 dark:text-success-300">
                      {m.result}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-400">
                    {m.match_date && <span className="flex items-center gap-0.5"><Calendar className="h-3 w-3" /> {m.match_date}</span>}
                    {m.venue && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" /> {m.venue}</span>}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
