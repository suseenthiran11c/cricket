import { useEffect, useState, useCallback } from 'react';
import { User, Plus, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Player, Team } from '@/lib/types';
import { PLAYER_ROLES } from '@/lib/constants';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import EmptyState from '@/components/EmptyState';
import Loading from '@/components/Loading';

export default function PlayersPage() {
  const [players, setPlayers] = useState<(Player & { team_name: string })[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Player | null>(null);
  const [filterTeam, setFilterTeam] = useState<string>('all');
  const [form, setForm] = useState({ name: '', role: 'Batsman', team_id: '' });

  const load = useCallback(async () => {
    const [pRes, tRes] = await Promise.all([
      supabase.from('players').select('*, team:teams(*)').order('name'),
      supabase.from('teams').select('*').order('name'),
    ]);
    setPlayers(
      ((pRes.data as (Player & { team: Team })[]) ?? []).map((p) => ({
        ...p,
        team_name: p.team?.name ?? 'Unknown',
      }))
    );
    setTeams((tRes.data as Team[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!form.name.trim() || !form.team_id) return;
    if (editing) {
      await supabase
        .from('players')
        .update({ name: form.name, role: form.role, team_id: form.team_id })
        .eq('id', editing.id);
    } else {
      await supabase.from('players').insert({
        name: form.name,
        role: form.role,
        team_id: form.team_id,
      });
    }
    setForm({ name: '', role: 'Batsman', team_id: '' });
    setEditing(null);
    setShowModal(false);
    load();
  }

  async function remove(player: Player) {
    if (!confirm(`Delete player "${player.name}"?`)) return;
    await supabase.from('players').delete().eq('id', player.id);
    load();
  }

  const filtered = filterTeam === 'all' ? players : players.filter((p) => p.team_id === filterTeam);

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Players"
        subtitle="Manage players across all teams"
        icon={<User className="h-5 w-5" />}
        action={
          <button
            onClick={() => {
              setEditing(null);
              setForm({ name: '', role: 'Batsman', team_id: teams[0]?.id ?? '' });
              setShowModal(true);
            }}
            className="btn btn-primary"
            disabled={teams.length === 0}
          >
            <Plus className="h-4 w-4" /> Add Player
          </button>
        }
      />

      {teams.length === 0 ? (
        <EmptyState
          icon={<User className="h-8 w-8" />}
          title="No teams exist yet"
          description="Create a team first before adding players."
        />
      ) : (
        <>
          {/* Team filter */}
          <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setFilterTeam('all')}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                filterTeam === 'all'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              All Teams
            </button>
            {teams.map((t) => (
              <button
                key={t.id}
                onClick={() => setFilterTeam(t.id)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  filterTeam === t.id
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<User className="h-8 w-8" />}
              title="No players found"
              description="Add players to start building your squads."
              action={
                <button onClick={() => setShowModal(true)} className="btn btn-primary">
                  <Plus className="h-4 w-4" /> Add Player
                </button>
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((p) => (
                <div key={p.id} className="card flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        {p.role && (
                          <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            {p.role}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">{p.team_name}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        setEditing(p);
                        setForm({ name: p.name, role: p.role ?? 'Batsman', team_id: p.team_id });
                        setShowModal(true);
                      }}
                      className="btn btn-ghost !p-2"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => remove(p)} className="btn btn-ghost !p-2 text-error-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setEditing(null); }}
        title={editing ? 'Edit Player' : 'Add Player'}
        footer={
          <>
            <button onClick={() => { setShowModal(false); setEditing(null); }} className="btn btn-secondary">Cancel</button>
            <button onClick={save} className="btn btn-primary">{editing ? 'Save' : 'Add'}</button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Player Name</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Arun Kumar"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Team</label>
            <select
              className="input"
              value={form.team_id}
              onChange={(e) => setForm({ ...form, team_id: e.target.value })}
            >
              <option value="">Select team...</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Role</label>
            <select
              className="input"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {PLAYER_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
