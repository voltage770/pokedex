import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import HomePage from './pages/HomePage';
import PokemonPage from './pages/PokemonPage';
import './index.css';

export default function App() {
  return (
    <BrowserRouter basename="/pokedex">
      <header className="site-header">
        <Link to="/" className="site-logo">Pokédex</Link>
      </header>

      <Routes>
        <Route path="/"           element={<HomePage />} />
        <Route path="/pokemon/:id" element={<PokemonPage />} />
      </Routes>
    </BrowserRouter>
  );
}
