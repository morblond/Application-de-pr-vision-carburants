// @ts-nocheck
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Papa from 'papaparse';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import './App.css';

// Configuration de l'icône
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

// Composant pour déplacer la carte automatiquement
function ChangeMapView({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, 12); // Zoom niveau 12 sur la ville
    }
  }, [center]);
  return null;
}

export default function App() {
  const [allStations, setAllStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [mapCenter, setMapCenter] = useState([46.603354, 1.888334]); // Centre de la France par défaut
  const [selectedStation, setSelectedStation] = useState(null);

  // 1. Récupérer les données du fichier CSV
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
        setLoading(false);
      } catch (error) {
        console.error("Erreur:", error);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 2. Filtrer et Géolocaliser dès qu'on tape une recherche
  useEffect(() => {
    if (searchQuery.length < 3) {
      setSearchResults([]);
      return;
    }

    const q = searchQuery.toLowerCase();
    // Filtrer les stations
    const matched = allStations.filter(s => 
      (s.ville && s.ville.toLowerCase().includes(q)) ||
      (s.code_postal && String(s.code_postal).includes(q))
    ).slice(0, 30); // Limite à 30 résultats pour la performance

    setSearchResults(matched);

    // Trouver les coordonnées GPS de la ville via l'API gouvernementale
    if (matched.length > 0 && matched[0].code_postal) {
      const cp = matched[0].code_postal;
      axios.get(`https://geo.api.gouv.fr/communes?codePostal=${cp}&fields=centre&format=geojson`)
        .then(res => {
          if (res.data && res.data.features && res.data.features.length > 0) {
            const coords = res.data.features[0].geometry.coordinates;
            // L'API renvoie [longitude, latitude], Leaflet veut [latitude, longitude]
            setMapCenter([coords[1], coords[0]]);
          }
        })
        .catch(err => console.error("Erreur géoloc:", err));
    }
  }, [searchQuery, allStations]);

  // 3. Préparer les données pour le graphique
  const prepareChartData = (station) => {
    if (!station) return [];
    const data = [];
    if (station.prix_actuel) data.push({ jour: "Auj.", prix: parseFloat(station.prix_actuel) });
    if (station.prix_predit_j7) data.push({ jour: "J+7", prix: parseFloat(station.prix_predit_j7) });
    if (station.prix_predit_j14) data.push({ jour: "J+14", prix: parseFloat(station.prix_predit_j14) });
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
          placeholder="🔎 Tapez un code postal ou une ville..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="map-wrapper">
        <MapContainer center={mapCenter} zoom={6} style={{ height: '100%', width: '100%' }}>
          <ChangeMapView center={mapCenter} />
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {searchResults.map((station, index) => {
            // On place les marqueurs autour du centre de la ville avec un léger décalage aléatoire pour qu'ils ne se chevauchent pas tous
            const offsetLat = (Math.random() - 0.5) * 0.02; 
            const offsetLng = (Math.random() - 0.5) * 0.02;
            return (
              <Marker 
                key={index} 
                position={[mapCenter[0] + offsetLat, mapCenter[1] + offsetLng]}
                icon={DefaultIcon}
                eventHandlers={{ click: () => setSelectedStation(station) }}
              >
                <Popup>
                  <strong>{station.marque}</strong><br />
                  {station.ville} ({station.code_postal})<br />
                  {station.type_carburant}: {station.prix_actuel} €
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      <div className="bottom-panel">
        {selectedStation ? (
          <div className="station-details">
            <button className="back-btn" onClick={() => setSelectedStation(null)}>← Retour à la liste</button>
            <h2>{selectedStation.marque}</h2>
            <h3>{selectedStation.adresse || ''} {selectedStation.ville} ({selectedStation.code_postal})</h3>
            
            <div className="text-forecast">
              <div className="forecast-row">
                <span>Prix actuel</span>
                <strong>{selectedStation.prix_actuel} €</strong>
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

            <h4>Évolution graphique</h4>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={prepareChartData(selectedStation)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="jour" tick={{ fontSize: 12 }} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => `${value} €`} />
                <Line type="monotone" dataKey="prix" stroke="#007bff" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="list-wrapper">
            {searchResults.length === 0 && searchQuery.length >= 3 && (
              <p className="empty-text">Aucune station trouvée pour cette recherche.</p>
            )}
            {searchResults.length === 0 && searchQuery.length < 3 && (
              <p className="empty-text">🔎 Commencez à taper pour voir les stations.</p>
            )}
            {searchResults.map((station, index) => (
              <div 
                key={index} 
                className="station-card"
                onClick={() => setSelectedStation(station)}
              >
                <div className="station-info">
                  <span className="station-brand">{station.marque}</span>
                  <span className="station-city">{station.ville} ({station.code_postal})</span>
                </div>
                <div className="station-price">
                  <span className="fuel-type">{station.type_carburant}</span>
                  <span className="price">{station.prix_actuel} €</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}