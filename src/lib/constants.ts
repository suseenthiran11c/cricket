export const MATCH_FORMATS = [
  { value: 'T20', label: 'T20', overs: 20 },
  { value: 'ODI', label: 'ODI', overs: 50 },
  { value: 'TEST', label: 'Test', overs: 0 },
  { value: 'T10', label: '10 Overs', overs: 10 },
  { value: 'T15', label: '15 Overs', overs: 15 },
  { value: 'CUSTOM', label: 'Custom', overs: 0 },
] as const;

export const PLAYER_ROLES = [
  { value: 'Batsman', label: 'Batsman' },
  { value: 'Bowler', label: 'Bowler' },
  { value: 'All-rounder', label: 'All-rounder' },
  { value: 'Wicketkeeper', label: 'Wicketkeeper' },
] as const;

export const BALL_TYPES = ['Tennis', 'Leather', 'Tape'] as const;
export const PITCH_TYPES = ['Matting', 'Turf', 'Concrete'] as const;

export const EXTRA_TYPES = [
  { value: 'WD', label: 'Wide' },
  { value: 'NB', label: 'No Ball' },
  { value: 'BYE', label: 'Bye' },
  { value: 'LEG_BYE', label: 'Leg Bye' },
] as const;

export const WICKET_TYPES = [
  { value: 'BOWLED', label: 'Bowled' },
  { value: 'CAUGHT', label: 'Caught' },
  { value: 'LBW', label: 'LBW' },
  { value: 'RUN_OUT', label: 'Run Out' },
  { value: 'STUMPED', label: 'Stumped' },
  { value: 'HIT_WICKET', label: 'Hit Wicket' },
  { value: 'RETIRED_OUT', label: 'Retired Out' },
] as const;

export const MATCH_STATUS = {
  SETUP: 'SETUP',
  TOSS: 'TOSS',
  LIVE: 'LIVE',
  INNINGS_BREAK: 'INNINGS_BREAK',
  COMPLETED: 'COMPLETED',
  PAUSED: 'PAUSED',
} as const;

export const TOSS_DECISIONS = [
  { value: 'BAT', label: 'BAT' },
  { value: 'BOWL', label: 'BOWL' },
] as const;
