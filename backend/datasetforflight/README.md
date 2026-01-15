# OpenSky Data Format Reference

This folder should contain your historical OpenSky dataset file:
**`states_2017-06-05-01.json`** (~450MB)

## Sample Format

See `SAMPLE_FORMAT.json` for the expected structure.

## Array Index Mapping

Each aircraft state is an array with 17 elements:

| Index | Field | Type | Description | Used By System |
|-------|-------|------|-------------|----------------|
| 0 | icao24 | string | Aircraft unique identifier | ✅ → `flightId` |
| 1 | callsign | string | Flight callsign (e.g., "UAL123") | ✅ → `callsign` |
| 2 | origin_country | string | Country of origin | ❌ |
| 3 | time_position | number | Time of position update | ❌ |
| 4 | last_contact | number | Unix timestamp of last contact | ❌ |
| 5 | longitude | number | Longitude in degrees | ✅ → `longitude` |
| 6 | latitude | number | Latitude in degrees | ✅ → `latitude` |
| 7 | baro_altitude | number | Barometric altitude (meters) | ❌ |
| 8 | on_ground | boolean | Aircraft on ground status | ❌ |
| 9 | velocity | number | Ground speed (m/s) | ✅ → `velocity` |
| 10 | true_track | number | Track angle (degrees) | ✅ → `trueTrack` |
| 11 | vertical_rate | number | Vertical rate (m/s) | ❌ |
| 12 | sensors | array | Sensor IDs | ❌ |
| 13 | geo_altitude | number | Geometric altitude (meters) | ❌ |
| 14 | squawk | string | Squawk code | ❌ |
| 15 | spi | boolean | Special position indicator | ❌ |
| 16 | position_source | number | Position source (0=ADS-B, etc.) | ❌ |

## Notes

- **null values** are possible for any field
- **Callsigns** may have trailing spaces - they are trimmed by the system
- If **longitude or latitude is null**, the aircraft is skipped
- **Velocity/trueTrack** default to 0 if null
- The system automatically adds **color** and **lastUpdated** fields

## Where to Get Data

1. **OpenSky Network**: https://opensky-network.org/datasets/
2. Download historical state vectors
3. Place JSON file in this folder
4. Ensure filename is `states_2017-06-05-01.json` or update path in code

## .gitignore

This folder is excluded from Git to prevent committing large files.
Only `SAMPLE_FORMAT.json` and `README.md` are tracked.
