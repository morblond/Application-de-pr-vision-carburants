// @ts-nocheck
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Papa from 'papaparse';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import './App.css';

export default function App() {
  const [allStations, setAllStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStation, setSelectedStation] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const apiRes = await axios.get('https://www.data.gouv.fr/api/1/datasets/previsions-des-prix-du-carburants-de-1-a-31-jours-france/');
        const csvResource = apiRes.data.resources.find((r: any) => r.format === 'csv' && r.title.includes('previsions-par-station'));
        
        if (!csvResource) throw new Error("Fichier introuvable");

        const csvRes = await axios.get(csvResource.url);
        const parsedData = Papa.parse(csvRes.data, {
          header: true,
          skipEmptyLines: true,
          transformHeader: header => header.trim().toLowerCase()
        });

        setAllStations(parsedData.data);
        setLoading(false);
      } catch (error) {
        console.error("Erreur:", error);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Filtrer les stations selon la recherche
  const filteredStations = allStations.filter((station: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (station.ville && station.ville.toLowerCase().includes(q)) ||
      (station.code_postal && String(station.code_postal).includes(q)) ||
      (station.marque && station.marque.toLowerCase().includes(q))
    );
  }).slice(0, 50); // Limite à 50 résultats pour ne pas faire planter le navigateur

  // Préparation des données pour le graphique basé sur la structure exacte
  const prepareChartData = (station: any) => {
    if (!station) return [];
    const data = [];
    
    if (station.prix_actuel) {
      data.push({ jour: "Auj.", prix: parseFloat(station.prix_actuel) });
    }
    if (station.prix_predit_j7) {
      data.push({ jour: "J+7", prix: parseFloat(station.prix_predit_j7) });
    }
    if (station.prix_predit_j14) {
      data.push({ jour: "J+14", prix: parseFloat(station.prix_predit_j14) });
    }
    
    return data;
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
        <h1>Forecast Carburant 🚗</h1>
      </header>
      
      <div className="search-container">
        <input 
          type="text" 
          className="search-input"
          placeholder="🔎 Ville, code postal, marque..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="content-wrapper">
        <div className="list-wrapper">
          {filteredStations.length === 0 && (
            <p className="empty-text">Aucune station trouvée.</p>
          )}
          {filteredStations.map((station: any, index: number) => (
            <div 
              key={index} 
              className={`station-card ${selectedStation === station ? 'active' : ''}`}
              onClick={() => setSelectedStation(station)}
            >
              <div className="station-info">
                <span className="station-brand">{station.marque || 'Station'}</span>
                <span className="station-city">{station.ville} ({station.code_postal})</span>
              </div>
              <div className="station-price">
                <span className="fuel-type">{station.type_carburant}</span>
                <span className="price">{station.prix_actuel} €</span>
              </div>
            </div>
          ))}
        </div>

        <div className="chart-wrapper">
          {selectedStation ? (
            <>
              <h2>{selectedStation.marque || 'Station'}</h2>
              <h3>{selectedStation.ville} - {selectedStation.type_carburant}</h3>
              <ResponsiveContainer width="100%" height="70%">
                <LineChart data={prepareChartData(selectedStation)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="jour" tick={{ fontSize: 12 }} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => `${value} €`} />
                  <Line type="monotone" dataKey="prix" stroke="#ff7300" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </>
          ) : (
            <div className="placeholder">
              👆 Cliquez sur une station dans la liste pour voir l'évolution des prix.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}