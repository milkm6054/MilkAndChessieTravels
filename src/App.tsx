import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { Compass, Copy, Plus, Search, Trash2 } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

type SearchResult = {
  placeId: string;
  title: string;
  fullLabel: string;
  lat: number;
  lon: number;
};

type TripPin = {
  id: string;
  name: string;
  notes: string;
  icon: string;
  lat: number;
  lon: number;
  sourceLabel: string;
  createdAt?: string;
};

const UK_CENTER: [number, number] = [54.5, -2.6];
const DEFAULT_ZOOM = 6;
const API_BASE = import.meta.env.VITE_API_BASE || "";

const iconChoices = ["📸", "🏖️", "🥾", "🍽️", "☕", "🏰", "✨"];

function normalizeTripId(value: string) {
  const clean = value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return clean || "our-trip";
}

function initialTripId() {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get("trip") || "our-trip";
  return normalizeTripId(fromUrl);
}

function updateTripInUrl(tripId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("trip", tripId);
  window.history.replaceState({}, "", url.toString());
}

function pinIcon(emoji: string) {
  return L.divIcon({
    className: "emoji-pin",
    html: `<div class="pin-bubble">${emoji}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function MapMover({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  map.setView(center, zoom, { animate: true });
  return null;
}

function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [customName, setCustomName] = useState("");
  const [notes, setNotes] = useState("");
  const [icon, setIcon] = useState(iconChoices[0]);

  const [tripId, setTripId] = useState(() => initialTripId());
  const [tripInput, setTripInput] = useState(() => initialTripId());
  const [pins, setPins] = useState<TripPin[]>([]);
  const [focusedPinId, setFocusedPinId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState("Loading trip...");
  const [isLoadingPins, setIsLoadingPins] = useState(true);
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [isDeletingPinId, setIsDeletingPinId] = useState<string | null>(null);

  const [mapCenter, setMapCenter] = useState<[number, number]>(UK_CENTER);
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);

  const shareUrl = `${window.location.origin}${window.location.pathname}?trip=${tripId}`;

  const focusedPin = useMemo(
    () => pins.find((pin) => pin.id === focusedPinId) ?? null,
    [focusedPinId, pins]
  );

  useEffect(() => {
    let active = true;

    async function loadTripPins() {
      setIsLoadingPins(true);
      try {
        const response = await fetch(`${API_BASE}/api/trips/${encodeURIComponent(tripId)}/pins`);
        if (!response.ok) {
          throw new Error(String(response.status));
        }

        const data = (await response.json()) as { tripId: string; pins: TripPin[] };
        if (!active) return;
        setPins(Array.isArray(data.pins) ? data.pins : []);
        setSyncMessage(`Synced trip: ${data.tripId}`);
      } catch {
        if (!active) return;
        setPins([]);
        setSyncMessage("Could not reach your server API");
      } finally {
        if (active) {
          setIsLoadingPins(false);
        }
      }
    }

    loadTripPins();
    updateTripInUrl(tripId);

    return () => {
      active = false;
    };
  }, [tripId]);

  async function searchLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsSearching(true);
    setSearchError("");

    try {
      const endpoint = new URL("https://nominatim.openstreetmap.org/search");
      endpoint.searchParams.set("q", trimmed);
      endpoint.searchParams.set("format", "jsonv2");
      endpoint.searchParams.set("limit", "8");
      endpoint.searchParams.set("countrycodes", "gb");
      endpoint.searchParams.set("addressdetails", "1");

      const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        throw new Error(String(response.status));
      }

      const data = (await response.json()) as Array<{
        place_id: number;
        display_name: string;
        lat: string;
        lon: string;
        name?: string;
      }>;

      const mapped = data
        .map((item) => ({
          placeId: String(item.place_id),
          title: item.name?.trim() || item.display_name.split(",")[0],
          fullLabel: item.display_name,
          lat: Number(item.lat),
          lon: Number(item.lon),
        }))
        .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon));

      setResults(mapped);
      if (mapped.length === 0) {
        setSearchError("No matches found. Try another UK town, postcode, or attraction.");
      }
    } catch {
      setResults([]);
      setSearchError("Search is unavailable right now. Please try again.");
    } finally {
      setIsSearching(false);
    }
  }

  async function addPin() {
    if (!selectedResult) return;
    setIsSavingPin(true);

    try {
      const response = await fetch(`${API_BASE}/api/trips/${encodeURIComponent(tripId)}/pins`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: customName.trim() || selectedResult.title,
          notes: notes.trim(),
          icon,
          lat: selectedResult.lat,
          lon: selectedResult.lon,
          sourceLabel: selectedResult.fullLabel,
        }),
      });

      if (!response.ok) {
        throw new Error(String(response.status));
      }

      const data = (await response.json()) as { pin: TripPin };
      const nextPin = data.pin;
      setPins((current) => [nextPin, ...current]);

      setFocusedPinId(nextPin.id);
      setMapCenter([nextPin.lat, nextPin.lon]);
      setMapZoom(9);
      setCustomName("");
      setNotes("");
      setSyncMessage("Saved to shared trip");
    } catch {
      setSyncMessage("Could not save pin. Check server connection.");
    } finally {
      setIsSavingPin(false);
    }
  }

  async function deletePin(id: string) {
    setIsDeletingPinId(id);
    try {
      const response = await fetch(`${API_BASE}/api/trips/${encodeURIComponent(tripId)}/pins/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(String(response.status));
      }

      setPins((current) => current.filter((pin) => pin.id !== id));
      if (focusedPinId === id) {
        setFocusedPinId(null);
      }
      setSyncMessage("Location removed from shared trip");
    } catch {
      setSyncMessage("Could not remove pin. Check server connection.");
    } finally {
      setIsDeletingPinId(null);
    }
  }

  function openTrip() {
    const nextTrip = normalizeTripId(tripInput);
    setTripInput(nextTrip);
    setTripId(nextTrip);
    setFocusedPinId(null);
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setSyncMessage("Share link copied");
    } catch {
      setSyncMessage("Could not copy. You can still send the URL manually.");
    }
  }

  function resetUKView() {
    setFocusedPinId(null);
    setMapCenter(UK_CENTER);
    setMapZoom(DEFAULT_ZOOM);
  }

  return (
    <main className="trip-page">
      <header className="trip-header">
        <p className="kicker">Road Trip Ideas</p>
        <h1>UK map for you two</h1>
        <p>Search places, pick an icon, and build your own shared travel map.</p>
      </header>

      <section className="trip-layout">
        <aside className="side-panel">
          <form onSubmit={searchLocation} className="search-card">
            <div className="trip-row">
              <label htmlFor="trip-id-input">Trip board</label>
              <div className="trip-row-controls">
                <input
                  id="trip-id-input"
                  value={tripInput}
                  onChange={(event) => setTripInput(event.target.value)}
                  placeholder="our-trip"
                />
                <button type="button" className="neutral-button" onClick={openTrip}>
                  Open
                </button>
                <button type="button" className="neutral-button" onClick={copyShareLink}>
                  <Copy size={15} /> Link
                </button>
              </div>
              <p className="sync-text">{syncMessage}</p>
            </div>

            <label htmlFor="search-input">Search UK places</label>
            <div className="search-row">
              <input
                id="search-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="e.g. York, Whitby, Lake District"
              />
              <button type="submit" disabled={isSearching}>
                <Search size={16} />
                {isSearching ? "Searching" : "Search"}
              </button>
            </div>
            {searchError ? <p className="error-text">{searchError}</p> : null}
          </form>

          <div className="result-list">
            {results.map((result) => {
              const isActive = selectedResult?.placeId === result.placeId;
              return (
                <button
                  key={result.placeId}
                  className={`result-item ${isActive ? "active" : ""}`}
                  type="button"
                  onClick={() => {
                    setSelectedResult(result);
                    setMapCenter([result.lat, result.lon]);
                    setMapZoom(9);
                  }}
                >
                  <strong>{result.title}</strong>
                  <small>{result.fullLabel}</small>
                </button>
              );
            })}
          </div>

          <div className="add-card">
            <h2>Add to your map</h2>
            <label>
              Custom name
              <input
                value={customName}
                onChange={(event) => setCustomName(event.target.value)}
                placeholder="Optional"
                disabled={!selectedResult}
              />
            </label>
            <label>
              Icon
              <select value={icon} onChange={(event) => setIcon(event.target.value)} disabled={!selectedResult}>
                {iconChoices.map((choice) => (
                  <option value={choice} key={choice}>
                    {choice}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Notes
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Best time to visit, parking, food idea..."
                disabled={!selectedResult}
              />
            </label>
            <button type="button" className="add-button" onClick={addPin} disabled={!selectedResult}>
              <Plus size={16} /> {isSavingPin ? "Saving..." : "Add location"}
            </button>
          </div>

          <div className="saved-card">
            <div className="saved-head">
              <h2>Saved ideas</h2>
              <span>{pins.length}</span>
            </div>
            {isLoadingPins ? <p className="sync-text">Loading locations...</p> : null}
            {pins.map((pin) => (
              <div className={`saved-item ${pin.id === focusedPinId ? "active" : ""}`} key={pin.id}>
                <button
                  type="button"
                  className="saved-main"
                  onClick={() => {
                    setFocusedPinId(pin.id);
                    setMapCenter([pin.lat, pin.lon]);
                    setMapZoom(9);
                  }}
                >
                  <span className="saved-icon">{pin.icon}</span>
                  <span>
                    <strong>{pin.name}</strong>
                    <small>{pin.notes || pin.sourceLabel}</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="delete-button"
                  onClick={() => deletePin(pin.id)}
                  disabled={isDeletingPinId === pin.id}
                  aria-label={`Delete ${pin.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </aside>

        <section className="map-shell">
          <div className="map-toolbar">
            <button type="button" onClick={resetUKView}>
              <Compass size={16} /> Reset UK view
            </button>
          </div>
          <MapContainer center={UK_CENTER} zoom={DEFAULT_ZOOM} scrollWheelZoom className="map-canvas">
            <MapMover center={mapCenter} zoom={mapZoom} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {pins.map((pin) => (
              <Marker
                key={pin.id}
                position={[pin.lat, pin.lon]}
                icon={pinIcon(pin.icon)}
                eventHandlers={{
                  click: () => {
                    setFocusedPinId(pin.id);
                  },
                }}
              >
                <Popup>
                  <strong>{pin.name}</strong>
                  <div>{pin.notes || pin.sourceLabel}</div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          <div className="focus-card">
            {focusedPin ? (
              <>
                <h3>
                  {focusedPin.icon} {focusedPin.name}
                </h3>
                <p>{focusedPin.notes || focusedPin.sourceLabel}</p>
              </>
            ) : (
              <p>Select a saved idea to view it here.</p>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
