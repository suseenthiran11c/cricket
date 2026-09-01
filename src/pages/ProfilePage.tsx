import { useEffect, useState, useCallback } from 'react';
import { User, Trophy, Users, FileText, Moon, Sun } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import PageHeader from '@/components/PageHeader';
import Loading from '@/components/Loading';

export default function ProfilePage() {
  const { theme, toggleTheme } = useTheme();
  const [stats, setStats] = useState({ matches: 0, completed: 0, live: 0, teams: 0, players: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [m, c, l, t, p] = await Promise.all([
      supabase.from('matches').select('id', { count: 'exact', head: true }),
      supabase.from('matches').select('id', { count: 'exact', head: true }).eq('status', 'COMPLETED'),
      supabase.from('matches').select('id', { count: 'exact', head: true }).in('status', ['LIVE', 'PAUSED']),
      supabase.from('teams').select('id', { count: 'exact', head: true }),
      supabase.from('players').select('id', { count: 'exact', head: true }),
    ]);
    setStats({
      matches: m.count ?? 0,
      completed: c.count ?? 0,
      live: l.count ?? 0,
      teams: t.count ?? 0,
      players: p.count ?? 0,
    });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Profile" subtitle="Your scoring activity" icon={<User className="h-5 w-5" />} />

      {/* Profile card */}
      <div className="card mb-6 p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-2xl font-extrabold text-white shadow-lg">
            CS
          </div>
          <div>
            <h2 className="text-xl font-bold">Cricketscorer Keezhakollai</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Local scorer account</p>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatBox icon={<Trophy className="h-5 w-5" />} label="Total Matches" value={stats.matches} />
        <StatBox icon={<FileText className="h-5 w-5" />} label="Completed" value={stats.completed} />
        <StatBox icon={<Trophy className="h-5 w-5" />} label="Live / Paused" value={stats.live} />
        <StatBox icon={<Users className="h-5 w-5" />} label="Teams" value={stats.teams} />
        <StatBox icon={<User className="h-5 w-5" />} label="Players" value={stats.players} />
      </div>

      {/* Settings */}
      <div className="card mt-6 p-5">
        <h3 className="mb-3 font-bold">Settings</h3>
        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
          <div className="flex items-center gap-3">
            {theme === 'dark' ? <Moon className="h-5 w-5 text-primary-400" /> : <Sun className="h-5 w-5 text-secondary-500" />}
            <div>
              <p className="text-sm font-semibold">Theme</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Currently in {theme} mode
              </p>
            </div>
          </div>
          <button onClick={toggleTheme} className="btn btn-secondary !py-2">
            Switch to {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-gray-400">
        Cricketscorer Keezhakollai · A scoring platform for grassroots cricket
      </p>
    </div>
  );
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
        {icon}
      </div>
      <p className="text-2xl font-extrabold tabular-nums">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}
