// @ts-nocheck
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Papa from 'papaparse';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import './App.css';

// Configuration de l'icône du marqueur
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

// Fonction robuste pour extraire et nettoyer les coordonnées
const getCoords = (station: any) => {
  let lat = station.latitude || station.lat;
  let lon = station.longitude || station.lon || station.lng;

  // Si les coordonnées sont dans un seul champ "geom" (format "lat,lon")
  if (!lat || !lon) {
    if (station.geom && typeof station.geom === 'string') {
      const parts = station.geom.split(',');
      lat = parts[0];
      lon = parts[1];
    }
  }

  // Remplace les virgules par des points pour le format numérique international
  const parsedLat = parseFloat(String(lat).replace(',', '.'));
  const parsedLon = parseFloat(String(lon).replace(',', '.'));

  // Vérifie que ce sont bien des nombres valides
  if (!isNaN(parsedLat) && !isNaN(parsedLon)) {
    return [parsedLat, parsedLon];
  }
  return null;
};

// Composant pour recentrer la carte automatiquement lors d'une recherche
const MapUpdater = ({ stations, searchQuery }: any) => {
  const map = useMap();
  useEffect(() => {
    if (searchQuery && stations.length > 0) {
      const bounds = L.latLngBounds(stations.map((s: any) => s._coords));
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (!searchQuery) {
      map.setView([46.603354, 1.888334], 6);
    }
  }, [stations, searchQuery]);
  return null;
};

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
          transformHeader: header => header.trim().toLowerCase() // Met tous les titres de colonnes en minuscules
        });

        const validStations = parsedData.data.map((s: any) => {
          const coords = getCoords(s);
          if (coords) return { ...s, _coords: coords };
          return null;
        }).filter(s => s !== null);

        setAllStations(validStations);
        setLoading(false);
      } catch (error) {
        console.error("Erreur:", error);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Filtrer les stations en fonction de la barre de recherche
  const filteredStations = allStations.filter((station: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (station.ville && station.ville.toLowerCase().includes(q)) ||
      (station.cp && String(station.cp).includes(q)) ||
      (station.adresse && station.adresse.toLowerCase().includes(q)) ||
      (station.nom_station && station.nom_station.toLowerCase().includes(q))
    );
  });

  // Préparation des données pour le graphique (recherche toutes les colonnes contenant 'prix')
  const prepareChartData = (station: any) => {
    if (!station) return [];
    const data = [];
    Object.keys(station).forEach(key => {
      if (key.includes('prix') || key.includes('prev')) {
        const val = parseFloat(String(station[key]).replace(',', '.'));
        if (!isNaN(val) && val > 0) {
          const match = key.match(/(\d+)/);
          const day = match ? match[0] : 0;
          if (day > 0) {
            data.push({ jour: `J+${day}`, prix: val });
          }
        }
      }
    });
    data.sort((a, b) => parseInt(a.jour.match(/\d+/)?.[0] || 0) - parseInt(b.jour.match(/\d+/)?.[0] || 0));
    return data;
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', fontFamily: 'sans-serif' }}>
      <div className="loader"></div>
      <p>Récupération des données...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Forecast Carburant 🚗</h1>
      </header>
      
      <div className="map-wrapper">
        <div className="search-bar">
          <input 
            type="text" 
            placeholder="🔎 Ville, code postal, adresse..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <MapContainer center={[46.603354, 1.888334]} zoom={6} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapUpdater stations={filteredStations} searchQuery={searchQuery} />
          {filteredStations.map((station: any, index: number) => (
            <Marker 
              key={index} 
              position={station._coords}
              icon={DefaultIcon}
              eventHandlers={{ click: () => setSelectedStation(station) }}
            >
              <Popup>
                <strong>{station.nom_station || 'Station'}</strong><br />
                {station.adresse}<br />
                {station.ville}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <div className="chart-wrapper">
        {selectedStation ? (
          <>
            <h2>{selectedStation.nom_station || 'Station'}</h2>
            <h3>Évolution sur 31 jours</h3>
            <ResponsiveContainer width="100%" height="80%">
              <LineChart data={prepareChartData(selectedStation)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="jour" tick={{ fontSize: 10 }} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="prix" stroke="#ff7300" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </>
        ) : (
          <div className="placeholder">
            👆 Cliquez sur une station sur la carte pour voir l'évolution des prix.
          </div>
        )}
      </div>
    </div>
  );
}