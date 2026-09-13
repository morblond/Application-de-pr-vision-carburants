// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import Papa from 'papaparse';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { Analytics } from '@vercel/analytics/react';
import './App.css';

const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

export default function App() {
  const [allStations, setAllStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFuel, setSelectedFuel] = useState("");
  const [availableFuels, setAvailableFuels] = useState([]);
  const [selectedStation, setSelectedStation] = useState(null);
  
  const [userLoc, setUserLoc] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [cpCoords, setCpCoords] = useState({});
  const [sortBy, setSortBy] = useState("price");
  const [maxDistance, setMaxDistance] = useState(0);

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

  const handleLocate = (autoSort = false) => {
    if (!navigator.geolocation) return alert("Géolocalisation non supportée.");
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      setUserLoc({ lat: latitude, lng: longitude });
      if (autoSort) setSortBy("distance");
      
      try {
        const revGeo = await axios.get(`https://geo.api.gouv.fr/communes?lat=${latitude}&lon=${longitude}&fields=codePostaux`);
        if (revGeo.data && revGeo.data.length > 0 && revGeo.data[0].codePostaux.length > 0) {
          setSearchQuery(revGeo.data[0].codePostaux[0]);
        }
      } catch (e) { console.error("Erreur géoloc inverse", e); }
      setIsLocating(false);
    }, () => {
      alert("Autorisez la localisation dans les réglages de l'iPhone.");
      setIsLocating(false);
      setSortBy("price");
      setMaxDistance(0);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  };

  const filteredStations = useMemo(() => {
    let filtered = allStations.filter(s => s.type_carburant === selectedFuel);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(s => (s.ville && s.ville.toLowerCase().includes(q)) || (s.code_postal && String(s.code_postal).includes(q)));
    }
    return filtered;
  }, [allStations, searchQuery, selectedFuel]);

  useEffect(() => {
    if (filteredStations.length === 0) return;
    const uniqueCPs = [...new Set(filteredStations.map(s => s.code_postal).filter(Boolean))];
    const missingCPs = uniqueCPs.filter(cp => !cpCoords[cp]);
    if (missingCPs.length > 0) {
      Promise.allSettled(missingCPs.map(cp => axios.get(`https://geo.api.gouv.fr/communes?codePostal=${cp}&fields=centre&format=geojson`))).then(results => {
        const newCoords = { ...cpCoords };
        results.forEach((res, i) => {
          if (res.status === 'fulfilled' && res.value.data.features && res.value.data.features.length > 0) {
            const coords = res.value.data.features[0].geometry.coordinates;
            newCoords[missingCPs[i]] = { lat: coords[1], lng: coords[0] };
          }
        });
        setCpCoords(newCoords);
      });
    }
  }, [filteredStations]);

  const sortedStations = useMemo(() => {
    if (filteredStations.length === 0) return [];
    const withDist = filteredStations.map(s => {
      let dist = null;
      const c = cpCoords[s.code_postal];
      if (c && userLoc) dist = getDistance(userLoc.lat, userLoc.lng, c.lat, c.lng);
      return { ...s, _dist: dist };
    });

    let stationsToDisplay = withDist;
    if (maxDistance > 0 && userLoc) {
      stationsToDisplay = withDist.filter(s => s._dist !== null && s._dist <= maxDistance);
    }

    if (sortBy === "distance" && userLoc) {
      return stationsToDisplay.sort((a, b) => (a._dist === null ? 1 : b._dist === null ? -1 : a._dist - b._dist)).slice(0, 50);
    } else {
      return stationsToDisplay.sort((a, b) => (parseFloat(a.prix_actuel) || 9999) - (parseFloat(b.prix_actuel) || 9999)).slice(0, 50);
    }
  }, [filteredStations, userLoc, cpCoords, sortBy, maxDistance]);

  const handleDistanceChange = (val) => {
    setMaxDistance(parseInt(val));
    if (parseInt(val) > 0 && !userLoc) handleLocate(true);
  };

  const handleSortClick = (type) => {
    setSortBy(type);
    if (type === "distance" && !userLoc) handleLocate(true);
  };

  const getDistanceForStation = (station) => {
    if (!userLoc || !station._dist) return null;
    const dist = station._dist;
    return dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`;
  };

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
    return parseFloat(station.prix_predit_j14) - parseFloat(station.prix_actuel);
  };

  const getNavLink = (station) => `https://maps.apple.com/?q=${encodeURIComponent(`${station.marque} ${station.code_postal} ${station.ville}`)}`;

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
      
      <div className="controls-wrapper">
        <input type="text" className="search-input" placeholder="🔎 Ville ou code postal..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        <select className="fuel-select" value={selectedFuel} onChange={(e) => setSelectedFuel(e.target.value)}>
          {availableFuels.map(fuel => <option key={fuel} value={fuel}>{fuel}</option>)}
        </select>
        <button className={`gps-btn ${userLoc ? 'active' : ''}`} onClick={() => handleLocate()} disabled={isLocating}>
          {isLocating ? '⏳' : '📍'}
        </button>
      </div>

      <div className="filter-bar">
        <select className="distance-select" value={maxDistance} onChange={(e) => handleDistanceChange(e.target.value)}>
          <option value="0">Toutes distances</option>
          <option value="5">5 km</option>
          <option value="10">10 km</option>
          <option value="25">25 km</option>
          <option value="50">50 km</option>
          <option value="100">100 km</option>
        </select>
        
        <div className="sort-controls">
          <button className={`sort-btn ${sortBy === 'price' ? 'active' : ''}`} onClick={() => handleSortClick('price')}>💶 Prix</button>
          <button className={`sort-btn ${sortBy === 'distance' ? 'active' : ''}`} onClick={() => handleSortClick('distance')}>📍 Distance</button>
        </div>
      </div>

      <div className="list-wrapper">
        {sortedStations.length === 0 && (
          <p className="empty-text">{maxDistance > 0 ? `Aucune station dans un rayon de ${maxDistance} km.` : "Aucune station trouvée."}</p>
        )}
        
        {sortedStations.map((station, index) => {
          const trend = getTrend(station);
          const isBaisse = trend < 0;
          const isHausse = trend > 0;
          const dist = getDistanceForStation(station);

          return (
            <div key={index} className="station-card" onClick={() => setSelectedStation(station)}>
              <div className="card-left">
                <span className="station-rank">#{index + 1}</span>
                <div className="station-info">
                  <span className="station-brand">{station.marque}</span>
                  <span className="station-city">
                    {station.ville} ({station.code_postal})
                    {dist && <span className="station-dist"> • à {dist}</span>}
                  </span>
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

      {selectedStation && (
        <div className="detail-overlay" onClick={() => setSelectedStation(null)}>
          <div className="detail-panel" onClick={e => e.stopPropagation()}>
            <div className="detail-header">
              <button className="close-btn" onClick={() => setSelectedStation(null)}>✕</button>
              <h2>{selectedStation.marque}</h2>
              <h3>{selectedStation.ville} ({selectedStation.code_postal})</h3>
              {getDistanceForStation(selectedStation) && <p className="detail-dist">À environ {getDistanceForStation(selectedStation)} de vous</p>}
            </div>

            <div className="text-forecast">
              <div className="forecast-row"><span>Prix Actuel</span><strong className="price-color">{selectedStation.prix_actuel} €</strong></div>
              <div className="forecast-row"><span>Dans 7 jours</span><strong>{selectedStation.prix_predit_j7} €</strong></div>
              <div className="forecast-row highlight"><span>Dans 14 jours</span><strong>{selectedStation.prix_predit_j14} €</strong></div>
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

            <a href={getNavLink(selectedStation)} target="_blank" rel="noopener noreferrer" className="nav-btn">🧭 Y aller (Ouvrir dans Maps)</a>
          </div>
        </div>
      )}
      <Analytics />
    </div>
  );
}