import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/context/ThemeContext';
import Layout from '@/components/Layout';
import HomePage from '@/pages/HomePage';
import MatchesPage from '@/pages/MatchesPage';
import TeamsPage from '@/pages/TeamsPage';
import PlayersPage from '@/pages/PlayersPage';
import StartMatchPage from '@/pages/StartMatchPage';
import LiveMatchesPage from '@/pages/LiveMatchesPage';
import ScorecardsPage from '@/pages/ScorecardsPage';
import ScorePage from '@/pages/ScorePage';
import MatchDetailPage from '@/pages/MatchDetailPage';
import ProfilePage from '@/pages/ProfilePage';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/matches" element={<MatchesPage />} />
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/players" element={<PlayersPage />} />
            <Route path="/start-match" element={<StartMatchPage />} />
            <Route path="/live" element={<LiveMatchesPage />} />
            <Route path="/scorecards" element={<ScorecardsPage />} />
            <Route path="/score/:matchId" element={<ScorePage />} />
            <Route path="/match/:matchId" element={<MatchDetailPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ThemeProvider>
  );
}
