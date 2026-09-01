import { useEffect, useState, useCallback } from 'react';
import { Users, Plus, Pencil, Trash2, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Team, Player } from '@/lib/types';
import { PLAYER_ROLES } from '@/lib/constants';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import EmptyState from '@/components/EmptyState';
import Loading from '@/components/Loading';

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);

  const [teamForm, setTeamForm] = useState({ name: '', color: '#22a064' });
  const [playerForm, setPlayerForm] = useState({ name: '', role: 'Batsman' });

  const loadTeams = useCallback(async () => {
    const { data } = await supabase.from('teams').select('*').order('name');
    setTeams((data as Team[]) ?? []);
    setLoading(false);
  }, []);

  const loadPlayers = useCallback(async (teamId: string) => {
    const { data } = await supabase
      .from('players')
      .select('*')
      .eq('team_id', teamId)
      .order('name');
    setPlayers((data as Player[]) ?? []);
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    if (selectedTeam) loadPlayers(selectedTeam.id);
  }, [selectedTeam, loadPlayers]);

  async function saveTeam() {
    if (!teamForm.name.trim()) return;
    if (editingTeam) {
      await supabase
        .from('teams')
        .update({ name: teamForm.name, color: teamForm.color })
        .eq('id', editingTeam.id);
    } else {
      const { data } = await supabase
        .from('teams')
        .insert({ name: teamForm.name, color: teamForm.color })
        .select()
        .single();
      if (data) setSelectedTeam(data as Team);
    }
    setTeamForm({ name: '', color: '#22a064' });
    setEditingTeam(null);
    setShowTeamModal(false);
    loadTeams();
  }

  async function savePlayer() {
    if (!playerForm.name.trim() || !selectedTeam) return;
    if (editingPlayer) {
      await supabase
        .from('players')
        .update({ name: playerForm.name, role: playerForm.role })
        .eq('id', editingPlayer.id);
    } else {
      await supabase.from('players').insert({
        name: playerForm.name,
        role: playerForm.role,
        team_id: selectedTeam.id,
      });
    }
    setPlayerForm({ name: '', role: 'Batsman' });
    setEditingPlayer(null);
    setShowPlayerModal(false);
    loadPlayers(selectedTeam.id);
    loadTeams();
  }

  async function deleteTeam(team: Team) {
    if (!confirm(`Delete team "${team.name}" and all its players?`)) return;
    await supabase.from('teams').delete().eq('id', team.id);
    if (selectedTeam?.id === team.id) setSelectedTeam(null);
    loadTeams();
  }

  async function deletePlayer(player: Player) {
    if (!confirm(`Delete player "${player.name}"?`)) return;
    await supabase.from('players').delete().eq('id', player.id);
    if (selectedTeam) loadPlayers(selectedTeam.id);
  }

  if (loading) return <Loading />;

  if (selectedTeam) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedTeam(null)}
              className="btn btn-ghost !px-3"
            >
              <ChevronRight className="h-5 w-5 rotate-180" />
            </button>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <span
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: selectedTeam.color ?? '#22a064' }}
                />
                {selectedTeam.name}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {players.length} player{players.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setEditingTeam(selectedTeam);
                setTeamForm({ name: selectedTeam.name, color: selectedTeam.color ?? '#22a064' });
                setShowTeamModal(true);
              }}
              className="btn btn-secondary !px-3"
            >
              <Pencil className="h-4 w-4" /> Edit
            </button>
            <button
              onClick={() => setShowPlayerModal(true)}
              className="btn btn-primary"
            >
              <Plus className="h-4 w-4" /> Add Player
            </button>
          </div>
        </div>

        {players.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title="No players yet"
            description="Add players to build your squad for matches."
            action={
              <button onClick={() => setShowPlayerModal(true)} className="btn btn-primary">
                <Plus className="h-4 w-4" /> Add Player
              </button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {players.map((p) => (
              <div key={p.id} className="card flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold">{p.name}</p>
                    {p.role && (
                      <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        {p.role}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setEditingPlayer(p);
                      setPlayerForm({ name: p.name, role: p.role ?? 'Batsman' });
                      setShowPlayerModal(true);
                    }}
                    className="btn btn-ghost !p-2"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => deletePlayer(p)} className="btn btn-ghost !p-2 text-error-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <TeamModal
          open={showTeamModal}
          onClose={() => { setShowTeamModal(false); setEditingTeam(null); }}
          form={teamForm}
          setForm={setTeamForm}
          onSave={saveTeam}
          editing={!!editingTeam}
        />
        <PlayerModal
          open={showPlayerModal}
          onClose={() => { setShowPlayerModal(false); setEditingPlayer(null); }}
          form={playerForm}
          setForm={setPlayerForm}
          onSave={savePlayer}
          editing={!!editingPlayer}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Teams"
        subtitle="Manage your cricket teams and squads"
        icon={<Users className="h-5 w-5" />}
        action={
          <button
            onClick={() => {
              setEditingTeam(null);
              setTeamForm({ name: '', color: '#22a064' });
              setShowTeamModal(true);
            }}
            className="btn btn-primary"
          >
            <Plus className="h-4 w-4" /> New Team
          </button>
        }
      />

      {teams.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No teams yet"
          description="Create your first team to start organizing players and matches."
          action={
            <button onClick={() => setShowTeamModal(true)} className="btn btn-primary">
              <Plus className="h-4 w-4" /> Create Team
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <div key={team.id} className="card group p-5">
              <div className="flex items-start justify-between">
                <button
                  onClick={() => setSelectedTeam(team)}
                  className="flex-1 text-left"
                >
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold text-white shadow-md"
                    style={{ backgroundColor: team.color ?? '#22a064' }}>
                    {team.name.charAt(0).toUpperCase()}
                  </div>
                  <h3 className="font-bold text-lg group-hover:text-primary-600 dark:group-hover:text-primary-400">{team.name}</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Tap to view squad</p>
                </button>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setEditingTeam(team);
                      setTeamForm({ name: team.name, color: team.color ?? '#22a064' });
                      setShowTeamModal(true);
                    }}
                    className="btn btn-ghost !p-2"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => deleteTeam(team)} className="btn btn-ghost !p-2 text-error-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <TeamModal
        open={showTeamModal}
        onClose={() => { setShowTeamModal(false); setEditingTeam(null); }}
        form={teamForm}
        setForm={setTeamForm}
        onSave={saveTeam}
        editing={!!editingTeam}
      />
    </div>
  );
}

function TeamModal({ open, onClose, form, setForm, onSave, editing }: {
  open: boolean;
  onClose: () => void;
  form: { name: string; color: string };
  setForm: (f: { name: string; color: string }) => void;
  onSave: () => void;
  editing: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Team' : 'New Team'}
      footer={
        <>
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button onClick={onSave} className="btn btn-primary">{editing ? 'Save' : 'Create'}</button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Team Name</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Chennai Super Kings"
            autoFocus
          />
        </div>
        <div>
          <label className="label">Team Color</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="h-10 w-16 cursor-pointer rounded-lg border border-gray-300 dark:border-gray-700"
            />
            <span className="text-sm text-gray-500">{form.color}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function PlayerModal({ open, onClose, form, setForm, onSave, editing }: {
  open: boolean;
  onClose: () => void;
  form: { name: string; role: string };
  setForm: (f: { name: string; role: string }) => void;
  onSave: () => void;
  editing: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Player' : 'Add Player'}
      footer={
        <>
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button onClick={onSave} className="btn btn-primary">{editing ? 'Save' : 'Add'}</button>
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
  );
}
