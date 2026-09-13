// @ts-nocheck
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Papa from 'papaparse';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import './App.css';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

export default function App() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStation, setSelectedStation] = useState(null);

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
          dynamicTyping: true,
        });

        const validStations = parsedData.data.filter((s: any) => s.latitude && s.longitude);
        setStations(validStations);
        setLoading(false);
      } catch (error) {
        console.error("Erreur:", error);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const prepareChartData = (station: any) => {
    if (!station) return [];
    const data = [];
    for (let i = 1; i <= 31; i++) {
      const priceKey = `prix_jour_${i}`; // Adaptez si le nom de la colonne est différent
      if (station[priceKey] !== null && station[priceKey] !== undefined) {
        data.push({ jour: `J+${i}`, prix: station[priceKey] });
      }
    }
    return data;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', fontFamily: 'sans-serif' }}>
        <div className="loader"></div>
        <p>Récupération des données...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Forecast Carburant 🚗</h1>
      </header>
      
      <div className="map-wrapper">
        <MapContainer center={[46.603354, 1.888334]} zoom={6} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {stations.map((station, index) => (
            <Marker 
              key={index} 
              position={[station.latitude, station.longitude]}
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