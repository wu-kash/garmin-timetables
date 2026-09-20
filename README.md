# Timetables — support page

The public status page for **Timetables**, a Connect IQ widget that shows the next
public-transit departures for your city on a Garmin watch.

**→ https://wu-kash.github.io/garmin-timetables/**

The page lists which watches the widget runs on (with real screenshots from each
device) and which cities it covers (on a map).

## Requesting a city or a watch

Use the **Request** button on the page — it files an issue here. **Report** does the
same for anything that looks wrong: the departures, the widget on a watch, or the page
itself. You can also open an issue directly.

## About this repository

This repo holds only the generated page, so it can be served by GitHub Pages. The
widget and the backend that feeds it live in a separate, private repository; the page
is rebuilt from those and mirrored here.

Map tiles come from [OpenStreetMap](https://www.openstreetmap.org/copyright)
(© OpenStreetMap contributors). City boundaries are derived from OSM data via
Nominatim. [Leaflet](https://leafletjs.com/) is vendored under `assets/vendor/leaflet/`
(BSD-2-Clause, license included).
