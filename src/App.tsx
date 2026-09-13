// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import Papa from 'papaparse';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import './App.css';

export default function App() {
  const [allStations, setAllStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFuel, setSelectedFuel] = useState("");
  const [availableFuels, setAvailableFuels] = useState([]);
  const [selectedStation, setSelectedStation] = useState(null);

  // Récupération des données
  useEffect(() => {
    const fetchData = async () => {
      try {
        const apiRes = await axios.get('https://www.data.gouv.fr/api/1/datasets/previsions-des-prix-du-carburants-de-1-a-31-jours-france/');
        const csvResource = apiRes.data.resources.find(r => r.format === 'csv' && r.title.includes('previsions-par-station'));
        
        if (!csvResource) throw new Error("Fichier introuvable");

        const csvRes = await axios.get(csvResource.url);
        const parsedData = Papa.parse(csvRes.data, {
          header: true,
          skipEmptyLines: true,
          transformHeader: header => header.trim().toLowerCase()
        });

        setAllStations(parsedData.data);
        
        // Extraction automatique des types de carburants disponibles
        const fuels = [...new Set(parsedData.data.map(s => s.type_carburant).filter(Boolean))];
        setAvailableFuels(fuels);
        if (fuels.length > 0) setSelectedFuel(fuels[0]);
        
        setLoading(false);
      } catch (error) {
        console.error("Erreur:", error);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Filtrage et tri par prix croissant
  const filteredStations = useMemo(() => {
    let filtered = allStations.filter(s => s.type_carburant === selectedFuel);
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(s => 
        (s.ville && s.ville.toLowerCase().includes(q)) ||
        (s.code_postal && String(s.code_postal).includes(q))
      );
    }

    // Tri par prix actuel
    return filtered.sort((a, b) => {
      const pa = parseFloat(a.prix_actuel) || 9999;
      const pb = parseFloat(b.prix_actuel) || 9999;
      return pa - pb;
    }).slice(0, 50); // Limite à 50 résultats pour la performance
  }, [allStations, searchQuery, selectedFuel]);

  const prepareChartData = (station) => {
    if (!station) return [];
    const data = [];
    if (station.prix_actuel) data.push({ jour: "Auj.", prix: parseFloat(station.prix_actuel) });
    if (station.prix_predit_j7) data.push({ jour: "J+7", prix: parseFloat(station.prix_predit_j7) });
    if (station.prix_predit_j14) data.push({ jour: "J+14", prix: parseFloat(station.prix_predit_j14) });
    return data;
  };

  const getTrend = (station) => {
    if (!station || !station.prix_actuel || !station.prix_predit_j14) return null;
    const diff = parseFloat(station.prix_predit_j14) - parseFloat(station.prix_actuel);
    return diff;
  };

  // Génère le lien GPS pour iPhone (Apple Plans) ou Android
  const getNavLink = (station) => {
    const query = encodeURIComponent(`${station.marque} ${station.code_postal} ${station.ville}`);
    return `https://maps.apple.com/?q=${query}`;
  };

  if (loading) return (
    <div className="loader-container">
      <div className="loader"></div>
      <p>Récupération des données...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Forecast Carburant ⛽</h1>
      </header>
      
      {/* Contrôles fixes en haut */}
      <div className="controls-wrapper">
        <input 
          type="text" 
          className="search-input"
          placeholder="🔎 Ville ou code postal..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select 
          className="fuel-select"
          value={selectedFuel}
          onChange={(e) => setSelectedFuel(e.target.value)}
        >
          {availableFuels.map(fuel => (
            <option key={fuel} value={fuel}>{fuel}</option>
          ))}
        </select>
      </div>

      <div className="list-wrapper">
        {filteredStations.length === 0 && (
          <p className="empty-text">Aucune station trouvée. Essayez une autre ville.</p>
        )}
        
        {filteredStations.map((station, index) => {
          const trend = getTrend(station);
          const isBaisse = trend < 0;
          const isHausse = trend > 0;

          return (
            <div 
              key={index} 
              className="station-card"
              onClick={() => setSelectedStation(station)}
            >
              <div className="card-left">
                <span className="station-rank">#{index + 1}</span>
                <div className="station-info">
                  <span className="station-brand">{station.marque}</span>
                  <span className="station-city">{station.ville} ({station.code_postal})</span>
                </div>
              </div>
              <div className="card-right">
                <span className="price-main">{station.prix_actuel} €</span>
                {trend !== null && (
                  <span className={`trend-badge ${isBaisse ? 'baisse' : 'hausse'}`}>
                    {isBaisse ? '▼' : '▲'} {Math.abs(trend).toFixed(3)}€
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Panneau de détail qui slide depuis le bas */}
      {selectedStation && (
        <div className="detail-overlay" onClick={() => setSelectedStation(null)}>
          <div className="detail-panel" onClick={e => e.stopPropagation()}>
            <div className="detail-header">
              <button className="close-btn" onClick={() => setSelectedStation(null)}>✕</button>
              <h2>{selectedStation.marque}</h2>
              <h3>{selectedStation.ville} ({selectedStation.code_postal})</h3>
            </div>

            <div className="text-forecast">
              <div className="forecast-row">
                <span>Prix Actuel</span>
                <strong className="price-color">{selectedStation.prix_actuel} €</strong>
              </div>
              <div className="forecast-row">
                <span>Dans 7 jours</span>
                <strong>{selectedStation.prix_predit_j7} €</strong>
              </div>
              <div className="forecast-row highlight">
                <span>Dans 14 jours</span>
                <strong>{selectedStation.prix_predit_j14} €</strong>
              </div>
            </div>

            <h4>Évolution des prix</h4>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={prepareChartData(selectedStation)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="jour" tick={{ fontSize: 12 }} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => `${value} €`} />
                <Line type="monotone" dataKey="prix" stroke="#007bff" strokeWidth={3} dot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>

            <a href={getNavLink(selectedStation)} target="_blank" rel="noopener noreferrer" className="nav-btn">
              🧭 Y aller (Ouvrir dans Maps)
            </a>
          </div>
        </div>
      )}
    </div>
  );
}