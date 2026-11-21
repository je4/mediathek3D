# Vorberechnung der Kistenpositionen (Precomputed Box Positions)

Dieses Dokument beschreibt die Vorberechnung der 3D-Kistenpositionen und Rotations-Quaternionen aus `kistendata.json` in die optimierte Datei `kistenpositions.json` sowie die zweistufige Lade- und Fallback-Architektur im Web-Viewer.

---

### Nutzen & Effizienz-Vorteile

Die Vorberechnung bietet messbare Performance- und Benutzerfreundlichkeitsgewinne:

1. **Minimale Time-to-Interactive (TTI)**:
   - Statt 21 Catmull-Rom-Splines, Bogenlängen-Parametrisierungen und binäre Schnittstellensuchen für alle 514 Kisten bei jedem Seitenaufruf im Browser-Thread zu berechnen, werden vorberechnete Transformationsmatrizen direkt zugewiesen.
2. **Entlastung mobiler und leistungsschwächerer Endgeräte**:
   - Spart CPU-Zyklen und Akkulaufzeit auf Tablets oder Smartphones (z. B. bei der Vor-Ort-Recherche im Bibliotheksraum).
3. **Deterministische 3D-Geometrie**:
   - Garantiert pixel- und millimetergenaue Konsistenz über alle Browser und WebGL-Engines hinweg.
4. **Resiliente Fallback-Garantie (Zero-Downtime)**:
   - Sollte `kistenpositions.json` nicht verfügbar sein (z. B. während lokaler Entwicklung nach einer schnellen manuellen Änderung an `kistendata.json` ohne Build-Schritt), schaltet der Browser automatisch und ohne Unterbrechung auf die clientseitige Live-Berechnung via `SplineCalculator` um.

---

### Befehl zur Vorberechnung

Sobald Änderungen an `pkg/web/static/data/kistendata.json` vorgenommen wurden (z. B. neue Stützpunkte, geänderte Ebenen, Einrückungen oder Kistenanzahlen), wird die Vorberechnung mit folgendem Befehl ausgeführt:

```bash
npm run precompute
```

Alternativ kann das Skript direkt über Node.js aufgerufen werden:

```bash
node scripts/precompute-positions.mjs
```

#### Optionale CLI-Parameter:

```bash
node scripts/precompute-positions.mjs --input ./pkg/web/static/data/kistendata.json --output ./pkg/web/static/data/kistenpositions.json
```

| Parameter | Standardwert | Beschreibung |
|---|---|---|
| `--input <pfad>` | `pkg/web/static/data/kistendata.json` | Pfad zur Quell-JSON mit Stützpunkten und Ebenendefinitionen |
| `--output <pfad>` | `pkg/web/static/data/kistenpositions.json` | Zielpfad für die generierten Koordinaten und Quaternionen |

---

### Workflow bei Datenänderungen

```
+------------------------------------+
|  1. kistendata.json bearbeiten     |
|     (z. B. neue Regalkoordinaten)  |
+-----------------+------------------+
                  |
                  v
+-----------------+------------------+
|  2. npm run precompute             |
|     (Erzeugt kistenpositions.json) |
+-----------------+------------------+
                  |
                  v
+-----------------+------------------+
|  3. Go-Server / Build starten      |
|     (Assets via embed.FS gebündelt)|
+------------------------------------+
```

---

### Zweistufige Lade- und Fallback-Architektur

In `pkg/web/static/js/mediathek-3d.js` ist der Ladevorgang redundant aufgebaut:

1. **Stufe 1 (Fast-Path)**:
   - Die Anwendung versucht `kistenpositions.json` asynchron zu laden.
   - Sind die vorberechneten Daten vorhanden, werden alle 514 Kisteninstanzen sofort per O(1)-Positions- und Quaternion-Zuweisung platziert (`_generateShelvesFromPrecomputed`).
2. **Stufe 2 (Fallback)**:
   - Schlägt der Ladevorgang von `kistenpositions.json` fehl (HTTP 404, Netzwerkfehler, etc.), fängt `Mediathek3D` den Fehler transparent ab und berechnet die Kurven und Kettengelenke on-the-fly im Browser (`_generateShelves`).
   - Die Anwendung bleibt in jedem Fall voll funktionsfähig.
