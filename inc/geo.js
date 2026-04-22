/**
 * =============================================================================
 * TABLE DES MATIÈRES
 * =============================================================================
 * 1. CONSTRUCTEUR & CONFIGURATION ........ Initialisation et état global
 * 2. GESTION DES ICÔNES .................. Création des marqueurs personnalisés
 * 3. SYSTÈME DE GÉOLOCALISATION .......... GPS, Permissions et Secours
 * 4. MOTEUR DE CARTE (LEAFLET) ........... Création et gestion des calques
 * 5. CHARGEMENT DES DONNÉES (API) ........ Récupération des arrêts (ODWB)
 * 6. RENDU ET POPUPS ..................... Affichage des marqueurs et bus
 * =============================================================================
 */

class Geo {
  /**
   * 1. CONSTRUCTEUR & CONFIGURATION
   * Prépare les variables de base dont l'application a besoin pour fonctionner.
   */
  constructor($mapBox) {
    // L'adresse de notre serveur qui contient les données des lignes de bus
    this.urlApi = "https://cepegra-frontend.xyz/bootcamp";

    // Références aux éléments HTML (la div de la carte et le bouton)
    this.$mapBox = $mapBox;

    // État de l'application : on stocke la carte et la distance de recherche
    this.map = null; // Contiendra l'objet Leaflet une fois créé
    this.distance = 1; // Rayon de recherche par défaut (1km)
    this.lastPosition = null; // Stocke les dernières coordonnées pour les calculs
    this.userMarker = null; // Marqueur représentant l'utilisateur sur la carte
    this.watchId = null; // id du watchPosition
    this.followingRoute = false; // si vrai, on suit la progression vers une destination
    this.currentDestination = null; // L.latLng de la destination suivie
    this.arrivalThreshold = 12; // distance en mètres pour considérer l'arrivée

    // --- LES CALQUES (LAYER GROUPS) ---
    // On crée des "tiroirs" pour ranger nos éléments.
    // Cela permet de vider un tiroir (ex: les arrêts) sans effacer la carte elle-même.
    this.layers = {
      stops: L.layerGroup(), // Pour les icônes d'arrêts de bus
      route: L.layerGroup(), // Pour le tracé rouge du bus
      clicked: L.layerGroup(), // Pour le point cliqué
      walking: L.layerGroup(), // Pour le tracé de l'itinéraire piéton
    };
    this.activeMarker = null; // Pour stocker le marqueur de la position cliquée (si besoin)

    // Écouteur global pour les lignes de bus (Délégation d'événement)
    // On écoute la zone de la carte : si on clique sur un lien avec la classe 'bus-link', on trace la ligne.
    // Remplace ton ancien écouteur par celui-ci :
    document.addEventListener("click", (e) => {
      // On vérifie si l'élément cliqué (ou l'un de ses parents) est un lien de bus
      const busLink = e.target.closest(".bus-link");

      if (busLink) {
        e.preventDefault();
        console.log("Chargement de la ligne :", busLink.dataset.shape);
        this.drawRoute(busLink.dataset.shape);

        // Optionnel : On peut fermer le panneau quand on clique sur une ligne
        // document.querySelector('#info-panel').classList.add('hidden');
      }
    });

    // Options pour la précision du GPS
    this.optionsMap = {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 0,
    };

    // On lance la préparation des images des marqueurs
    this._initIcons();
  }

  /* -------------------- GESTION DU SUIVI GPS EN TEMPS RÉEL -------------------- */
  _startWatchingPosition() {
    if (!navigator.geolocation) return;
    // Si on a déjà un watch actif, on ne le recrée pas
    if (this.watchId !== null) return;

    try {
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => this._onPositionUpdate(pos),
        (err) => console.warn("watchPosition erreur", err),
        {
          enableHighAccuracy: true,
          maximumAge: 1000,
          timeout: 10000,
        },
      );
    } catch (e) {
      console.warn("Impossible de démarrer watchPosition", e);
    }
  }

  _stopWatchingPosition() {
    try {
      if (this.watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(this.watchId);
      }
    } catch (e) {
      // ignore
    }
    this.watchId = null;
  }

  _onPositionUpdate(position) {
    // Met à jour la dernière position connue
    this.lastPosition = position;

    const lat = position.coords.latitude;
    const lon = position.coords.longitude;

    // Met à jour le marqueur utilisateur (si présent)
    if (this.userMarker) {
      this.userMarker.setLatLng([lat, lon]);
    } else {
      this.userMarker = L.marker([lat, lon], { icon: this.icons.user }).addTo(
        this.map,
      );
    }

    // Si on suit un itinéraire, centrer légèrement la vue sur l'utilisateur
    if (this.followingRoute && this.map) {
      try {
        this.map.panTo([lat, lon]);
      } catch (e) {}
    }

    // Si on suit une destination, vérifier l'arrivée
    if (this.followingRoute && this.currentDestination) {
      const userLatLng = L.latLng(lat, lon);
      const dist = userLatLng.distanceTo(this.currentDestination); // en mètres
      // console.log('distance to dest', dist);
      if (dist <= this.arrivalThreshold) {
        // Arrivé
        this.followingRoute = false;
        this.currentDestination = null;
        // Efface le tracé piéton
        try {
          if (this.layers.walking) this.layers.walking.clearLayers();
        } catch (e) {}
        // Affiche le message d'arrivée
        this._showArrivalMessage();
      }
    }
  }

  _showArrivalMessage() {
    // Crée un message temporaire fixé en bas-center
    try {
      let msg = document.querySelector(".arrival-msg");
      if (msg) msg.remove();
      msg = document.createElement("div");
      msg.className = "arrival-msg";
      msg.textContent = "vous êtes arriver a destination";
      document.body.appendChild(msg);
      // Supprime après 4s
      setTimeout(() => {
        if (msg) msg.remove();
      }, 4000);
    } catch (e) {
      alert("vous êtes arriver a destination");
    }
  }

  /**
   * 2. GESTION DES ICÔNES
   * Définit l'apparence des marqueurs sur la carte (taille, point d'ancrage).
   */
  _initIcons() {
    const configCommune = {
      iconSize: [53, 53], // Taille de l'image en pixels
      iconAnchor: [26, 53], // Le point de l'image qui "touche" la coordonnée (le bas milieu)
      popupAnchor: [0, -50], // Où la bulle d'info s'affiche par rapport au marqueur
    };

    this.icons = {
      stop: L.icon({
        ...configCommune,
        iconUrl: "./icons/icon-map-bus-stop.svg",
      }),
      start: L.icon({
        ...configCommune,
        iconUrl: "./icons/icon-map-bus-start.svg",
      }),
      end: L.icon({
        ...configCommune,
        iconUrl: "./icons/icon-map-bus-end.svg",
      }),
      user: L.icon({
        ...configCommune,
        // Use a distinct user icon to differentiate from stops
        iconUrl: "./icons/icon-me.svg",
      }),
    };
  }

  /**
   * 3. SYSTÈME DE GÉOLOCALISATION
   * Gère la demande d'autorisation et récupère la position de l'utilisateur.
   */
  async init() {
    try {
      // On vérifie si l'utilisateur a déjà donné sa permission
      const result = await navigator.permissions.query({ name: "geolocation" });

      if (result.state === "granted" || result.state === "prompt") {
        // Si autorisé, on demande la position précise au navigateur
        navigator.geolocation.getCurrentPosition(
          (pos) => this.createMap(pos), // Succès
          (err) => this.errorPosition(err), // Erreur
          this.optionsMap,
        );
      } else {
        // Si refusé, on utilise la position de secours
        this._fallbackPosition();
      }
    } catch (error) {
      this._fallbackPosition();
    }
  }

  // Position par défaut (Neuville) si le GPS est inaccessible
  _fallbackPosition() {
    const dummyPos = { coords: { latitude: 50.112673, longitude: 4.418669 } };
    this.createMap(dummyPos);
  }

  // Affiche une erreur dans la console si le GPS échoue
  errorPosition(err) {
    console.warn(`Erreur de localisation (${err.code}): ${err.message}`);
  }

  // Permet de changer le rayon de recherche (ex: via le curseur range)
  setDistance(km) {
    this.distance = km;
  }

  /* ------------------------------------------------------------------
   * FAVORIS (localStorage)
   * Stocke une liste d'identifiants d'arrêts dans localStorage sous la
   * clé 'favoriteStops'. Evite les doublons.
   * ------------------------------------------------------------------ */
  _stopId(stop) {
    // Compose un identifiant stable à partir du nom et des coordonnées
    const name = (stop.stop_name || "stop").replace(/\s+/g, "_");
    const lat =
      stop.coordinates && stop.coordinates.lat
        ? stop.coordinates.lat.toFixed(6)
        : "0";
    const lon =
      stop.coordinates && stop.coordinates.lon
        ? stop.coordinates.lon.toFixed(6)
        : "0";
    return `${name}__${lat}_${lon}`;
  }

  _getFavorites() {
    try {
      const raw = localStorage.getItem("favoriteStops");
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (e) {
      console.warn("Impossible d'accéder à localStorage", e);
      return [];
    }
  }

  _saveFavorites(list) {
    try {
      localStorage.setItem("favoriteStops", JSON.stringify(list));
    } catch (e) {
      console.warn("Impossible d'écrire dans localStorage", e);
    }
  }

  _isFavorite(stopId) {
    const list = this._getFavorites();
    return list.indexOf(stopId) !== -1;
  }

  _addFavorite(stopId) {
    const list = this._getFavorites();
    if (list.indexOf(stopId) === -1) {
      list.push(stopId);
      this._saveFavorites(list);
      return true;
    }
    return false;
  }

  _removeFavorite(stopId) {
    let list = this._getFavorites();
    if (list.indexOf(stopId) !== -1) {
      list = list.filter((s) => s !== stopId);
      this._saveFavorites(list);
      return true;
    }
    return false;
  }

  _toggleFavorite(stopId) {
    if (this._isFavorite(stopId)) {
      this._removeFavorite(stopId);
      return false;
    }
    this._addFavorite(stopId);
    return true;
  }

  // ----- FAVORIS POUR LES LIGNES (localStorage key: favoriteLines) -----
  _lineId(bus) {
    // Préfère shape_id si présent, sinon route_id
    if (!bus) return "unknown_line";
    if (bus.shape_id) return `shape__${bus.shape_id}`;
    if (bus.route_id) return `route__${bus.route_id}`;
    // Fallback: nom + court
    return `line__${(bus.route_short_name || "line").replace(/\s+/g, "_")}`;
  }

  _getFavoriteLines() {
    try {
      const raw = localStorage.getItem("favoriteLines");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      // Support legacy array of strings -> convert to objects
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        typeof parsed[0] === "string"
      ) {
        return parsed.map((s) => ({ id: s, label: s }));
      }
      return parsed;
    } catch (e) {
      console.warn("Impossible d'accéder à localStorage (lines)", e);
      return [];
    }
  }

  _saveFavoriteLines(list) {
    try {
      localStorage.setItem("favoriteLines", JSON.stringify(list));
    } catch (e) {
      console.warn("Impossible d'écrire dans localStorage (lines)", e);
    }
  }

  _isLineFavorite(lineId) {
    const list = this._getFavoriteLines();
    return list.findIndex((item) => item && item.id === lineId) !== -1;
  }
  // toggleLineFavorite accepts either a lineId string or (recommended) a metadata object {id,label,shape_id,route_id}
  _toggleLineFavorite(lineIdOrMeta) {
    const list = this._getFavoriteLines();
    const meta =
      typeof lineIdOrMeta === "string"
        ? { id: lineIdOrMeta, label: lineIdOrMeta }
        : lineIdOrMeta;
    const idx = list.findIndex((item) => item && item.id === meta.id);
    if (idx !== -1) {
      const next = list.filter((s) => s.id !== meta.id);
      this._saveFavoriteLines(next);
      return false;
    }
    list.push(meta);
    this._saveFavoriteLines(list);
    return true;
  }

  // Helper to remove by id
  _removeLineFavoriteById(lineId) {
    const list = this._getFavoriteLines();
    const next = list.filter((s) => s.id !== lineId);
    this._saveFavoriteLines(next);
  }

  /**
   * 4. MOTEUR DE CARTE (LEAFLET)
   * Affiche la carte et configure les interactions de base.
   */
  createMap(position) {
    const { latitude, longitude } = position.coords;

    // Si une carte existe déjà, on la supprime pour éviter les bugs visuels
    if (this.map) this.map.remove();

    // On affiche la zone de la carte et on initialise Leaflet centrée sur nous
    this.$mapBox.classList.remove("hidde");
    this.map = L.map(this.$mapBox).setView([latitude, longitude], 17);

    // On ajoute le "fond de carte" (les images des rues)
    L.tileLayer(
      "https://tile.thunderforest.com/transport/{z}/{x}/{y}.png?apikey=f5a6d9a8d3484637b41037978e6e1e7b",
      {
        attribution: "© OpenStreetMap - TEC",
      },
    ).addTo(this.map);

    // On active nos "tiroirs" (calques) sur la carte
    this.layers.stops.addTo(this.map);
    this.layers.route.addTo(this.map);
    this.layers.clicked.addTo(this.map);
    this.layers.walking.addTo(this.map);

    // Ajout d'un bouton flottant "Mes favoris" en bas à droite (attaché au body)
    if (!document.getElementById("favorites-toggle")) {
      const favToggle = document.createElement("button");
      favToggle.id = "favorites-toggle";
      favToggle.className = "favorites-toggle";
      favToggle.type = "button";
      favToggle.title = "Mes favoris";
      // Étoile + texte
      favToggle.innerHTML =
        '<span class="fav-icon">★</span><span class="fav-label">Favoris</span>';
      favToggle.addEventListener("click", (ev) => {
        ev.preventDefault();
        this.showFavorites();
      });
      document.body.appendChild(favToggle);
    }

    // Marqueur fixe pour notre position initiale (on le stocke pour pouvoir le déplacer)
    this.userMarker = L.marker([latitude, longitude], {
      icon: this.icons.user,
    }).addTo(this.map);

    // Démarre le suivi en continu (watchPosition) pour mettre à jour la position utilisateur
    this._startWatchingPosition();

    // On charge les arrêts autour de nous
    this.loadStops(position);

    // Contrôle de distance (si présent dans le DOM) : met à jour this.distance et recharge
    const range = document.getElementById("distance-range");
    const valueLabel = document.getElementById("distance-value");
    if (range) {
      range.value = this.distance;
      if (valueLabel) valueLabel.textContent = `${this.distance} km`;
      range.addEventListener("input", (ev) => {
        const v = parseFloat(ev.target.value);
        this.distance = v;
        if (valueLabel) valueLabel.textContent = `${v} km`;
        // recharge les arrêts autour de la dernière position connue
        // Masquer la popup d'alerte immédiatement
        const alertBox = document.querySelector(".box-alert");
        if (alertBox) alertBox.classList.add("hidden");

        if (this.lastPosition) {
          this.loadStops(this.lastPosition, true);
        } else {
          this.loadStops(position, false);
        }
      });
    }

    //click on map
    this.map.on("click", (e) => {
      this.layers.clicked.clearLayers(); // On efface le marqueur de la position cliquée précédente (s'il existe)
      // On sauvegarde la position cliquée
      this.lastPosition = {
        coords: {
          latitude: e.latlng.lat,
          longitude: e.latlng.lng,
        },
      };
      //on ajoute un marqueur temporaire pour indiquer la position cliquée sur la calque stops
      L.marker([e.latlng.lat, e.latlng.lng], { icon: this.icons.user }).addTo(
        this.layers.clicked,
      );

      // Masquer la popup d'alerte immédiatement lorsque l'utilisateur clique ailleurs
      const alertBox = document.querySelector(".box-alert");
      if (alertBox) alertBox.classList.add("hidden");

      // On charge les arrêts autour de la position cliquée
      this.loadStops(this.lastPosition, true);
    });
  }

  // Ouvre le panneau d'info et affiche la liste des lignes favorites
  showFavorites() {
    const $panel = document.querySelector("#info-panel");
    $panel.innerHTML = `<span class="close-panel">&times;</span><h4>Mes favoris</h4><hr><div class="favorites-list"></div>`;
    $panel.classList.remove("hidden");
    // Fermeture
    $panel.querySelector(".close-panel").addEventListener("click", () => {
      $panel.classList.add("hidden");
    });

    this._renderFavoritesPanel();
  }

  _renderFavoritesPanel() {
    const $panel = document.querySelector("#info-panel");
    const container = $panel.querySelector(".favorites-list");
    if (!container) return;

    const list = this._getFavoriteLines();
    container.innerHTML = "";
    if (!list || list.length === 0) {
      container.innerHTML = "<em>Aucune ligne en favoris</em>";
      return;
    }

    list.forEach((fav) => {
      const row = document.createElement("div");
      row.className = "fav-row";

      const label = document.createElement("div");
      label.className = "fav-label";
      label.textContent = fav.label || fav.id;

      const actions = document.createElement("div");
      actions.className = "fav-actions";

      const viewBtn = document.createElement("button");
      viewBtn.className = "fav-view-btn";
      viewBtn.textContent = "Voir";
      viewBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        // Try to obtain shape id
        let shapeId = null;
        if (fav.shape_id) shapeId = fav.shape_id;
        else if (fav.id && fav.id.startsWith("shape__"))
          shapeId = fav.id.replace("shape__", "");

        if (shapeId) {
          // Simulate clicking the line: draw route and close panel
          this.drawRoute(shapeId);
          $panel.classList.add("hidden");
        } else {
          // No shape available: try fetching by route_id via the API if present
          if (fav.route_id) {
            // If your backend supports resolving a route to a shape, call it here.
            // As fallback, inform the user.
            console.warn(
              "No shape_id for this favorite; route_id present:",
              fav.route_id,
            );
            alert("Impossible d'afficher le trajet : shape inconnu.");
          } else {
            alert(
              "Impossible d'afficher le trajet : aucune information de shape disponible.",
            );
          }
        }
      });

      const delBtn = document.createElement("button");
      delBtn.className = "fav-del-btn";
      delBtn.textContent = "Supprimer";
      delBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        this._removeLineFavoriteById(fav.id);
        this._renderFavoritesPanel();
      });

      // Bouton pour démarrer le suivi directement depuis les favoris
      const followFavBtn = document.createElement("button");
      followFavBtn.className = "fav-follow-btn";
      followFavBtn.textContent = "Suivre";
      followFavBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        let shapeId = null;
        if (fav.shape_id) shapeId = fav.shape_id;
        else if (fav.id && fav.id.startsWith("shape__"))
          shapeId = fav.id.replace("shape__", "");
        if (shapeId) {
          // draw route and start following the route's last point
          this.drawRoute(shapeId, true);
          $panel.classList.add("hidden");
        } else {
          alert(
            "Impossible de démarrer le suivi : shape inconnu pour cette favorite.",
          );
        }
      });

      actions.appendChild(viewBtn);
      actions.appendChild(followFavBtn);
      actions.appendChild(delBtn);

      row.appendChild(label);
      row.appendChild(actions);
      container.appendChild(row);
    });
  }

  /**
   * 5. CHARGEMENT DES DONNÉES (API)
   * Va chercher les arrêts de bus TEC réels via l'Open Data Wallonie-Bruxelles.
   */
  async loadStops(position, showClickMarker = false) {
    this.lastPosition = position; // Sauvegarde pour les calculs d'itinéraires piétons

    // Référence à la popup d'alerte (si présente)
    const alertBox = document.querySelector(".box-alert");

    // Nettoyage avant de charger de nouveaux points
    this.layers.stops.clearLayers();

    const { latitude, longitude } = position.coords;

    try {
      // URL complexe qui demande : "donne moi les arrêts dans un rayon de X km autour de ce point"
      const url = `https://www.odwb.be/api/explore/v2.1/catalog/datasets/le-tec-arrets-bus/records?limit=100&where=within_distance(coordinates, geom'POINT(${longitude} ${latitude})', ${this.distance}km)&order_by=distance(coordinates, geom'POINT(${longitude} ${latitude})')`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.results && data.results.length > 0) {
        // Si on avait un message d'alerte visible, le cacher
        if (alertBox) alertBox.classList.add("hidden");

        // Pour chaque arrêt trouvé par l'API, on crée son marqueur
        data.results.forEach((stop) => this._renderStopMarker(stop));
      } else {
        // Si aucun arrêt, on affiche notre message d'alerte HTML
        if (alertBox) alertBox.classList.remove("hidden");
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des arrêts :", error);
    }
  }

  /**
   * 6. RENDU ET POPUPS
   * Crée physiquement les icônes d'arrêts et gère le contenu de la bulle d'info.
   */
  _renderStopMarker(stop) {
    const stopPos = L.latLng(stop.coordinates.lat, stop.coordinates.lon);
    const userPos = L.latLng(
      this.lastPosition.coords.latitude,
      this.lastPosition.coords.longitude,
    );
    const distance = userPos.distanceTo(stopPos);
    const distText =
      distance > 1000
        ? (distance / 1000).toFixed(1) + " km"
        : Math.round(distance) + " m";

    const marker = L.marker([stop.coordinates.lat, stop.coordinates.lon], {
      icon: this.icons.stop,
    }).addTo(this.layers.stops);

    marker.on("click", async () => {
      // Si un autre marqueur était actif, on lui retire la classe
      if (this.activeMarker && this.activeMarker._icon) {
        this.activeMarker._icon.classList.remove("marker-active");
      }

      // On ajoute la classe au marqueur actuel
      marker._icon.classList.add("marker-active");

      // On mémorise que c'est lui le nouveau "chef"
      this.activeMarker = marker;
      // 1. Récupération des bus qui passent par l'arrêt (via notre API)
      const response = await fetch(
        `${this.urlApi}/bus/${stop.stop_name}/${stop.coordinates.lon}`,
      );
      const data = await response.json();

      let busHtml = "";
      if (data.code === "ok") {
        data.content.forEach((bus) => {
          if (bus.route_id) {
            busHtml += `<a href="#" class="bus-link" data-shape="${bus.shape_id}">${bus.route_short_name} - ${bus.route_long_name}</a><br>`;
          }
        });
      }

      // 2. Préparation du contenu du panneau
      const $panel = document.querySelector("#info-panel");
      $panel.innerHTML = `
            <span class="close-panel">&times;</span>
            <h4>${stop.stop_name}</h4>
            <hr>
            <div class="bus-list">${busHtml}</div>
        `;

      // Ajout du bouton de suivi (commencer / arrêter)
      const followBtn = document.createElement("button");
      followBtn.className = "follow-btn";
      const updateFollowText = () => {
        const isFollowingHere =
          this.followingRoute &&
          this.currentDestination &&
          this.currentDestination.lat === stop.coordinates.lat &&
          this.currentDestination.lng === stop.coordinates.lon;
        followBtn.textContent = isFollowingHere
          ? "Arrêter le suivi"
          : "Commencer le suivi";
      };
      updateFollowText();
      followBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        // Toggle following to this stop
        const dest = L.latLng(stop.coordinates.lat, stop.coordinates.lon);
        if (
          this.followingRoute &&
          this.currentDestination &&
          this.currentDestination.equals(dest)
        ) {
          // Stop
          this.followingRoute = false;
          this.currentDestination = null;
          followBtn.textContent = "Commencer le suivi";
        } else {
          // Start following
          this.currentDestination = dest;
          this.followingRoute = true;
          // Ensure watch is active
          this._startWatchingPosition();
          // Center map on user so they see their movement
          if (this.lastPosition) {
            this.map.panTo([
              this.lastPosition.coords.latitude,
              this.lastPosition.coords.longitude,
            ]);
          }
          followBtn.textContent = "Arrêter le suivi";
        }
      });
      // Insert follow button after title
      const titleEl = $panel.querySelector("h4");
      if (titleEl) titleEl.insertAdjacentElement("afterend", followBtn);

      // 3. Affichage (en retirant la classe hidden)
      $panel.classList.remove("hidden");

      // 4. Gestion de la fermeture
      $panel.querySelector(".close-panel").addEventListener("click", () => {
        $panel.classList.add("hidden");
        if (this.layers.walking) this.layers.walking.clearLayers(); // On efface le tracé bleu aussi
      });
      // Si l'utilisateur ferme le panneau, on arrête de suivre la route
      $panel.querySelector(".close-panel").addEventListener("click", () => {
        this.followingRoute = false;
        this.currentDestination = null;
      });

      // --- BOUTONS FAVORIS PAR LIGNE (localStorage favoriteLines) ---
      try {
        const busListContainer = $panel.querySelector(".bus-list");
        // Vide le conteneur (on va reconstruire la liste en DOM)
        busListContainer.innerHTML = "";

        if (
          data &&
          data.code === "ok" &&
          Array.isArray(data.content) &&
          data.content.length > 0
        ) {
          data.content.forEach((bus) => {
            if (!bus.route_id) return;

            const row = document.createElement("div");
            row.className = "bus-row";

            const a = document.createElement("a");
            a.href = "#";
            a.className = "bus-link";
            a.dataset.shape = bus.shape_id || "";
            a.textContent = `${bus.route_short_name} - ${bus.route_long_name}`;

            const favBtn = document.createElement("button");
            favBtn.className = "fav-line-btn";

            const lineId = this._lineId(bus);
            const updateLineText = () => {
              favBtn.textContent = this._isLineFavorite(lineId)
                ? "Retirer des favoris"
                : "Ajouter aux favoris";
            };
            updateLineText();

            favBtn.addEventListener("click", (ev) => {
              ev.preventDefault();
              const meta = {
                id: lineId,
                label: `${bus.route_short_name} - ${bus.route_long_name}`,
                shape_id: bus.shape_id,
                route_id: bus.route_id,
              };
              const added = this._toggleLineFavorite(meta);
              updateLineText();

              // feedback visuel court
              let fb = $panel.querySelector(".fav-feedback");
              if (fb) fb.remove();
              fb = document.createElement("div");
              fb.className = "fav-feedback";
              fb.textContent = added
                ? "Ligne ajoutée aux favoris"
                : "Ligne retirée des favoris";
              $panel.appendChild(fb);
              setTimeout(() => fb.remove(), 1800);
            });

            row.appendChild(a);
            row.appendChild(favBtn);
            busListContainer.appendChild(row);
          });
        } else {
          busListContainer.innerHTML = "<em>Aucune ligne trouvée</em>";
        }
      } catch (err) {
        console.warn("Erreur gestion favoris par ligne :", err);
      }

      // Dès que l'arrêt est cliqué, on trace aussi l'itinéraire piéton depuis la dernière position connue
      try {
        // S'assure qu'on a bien une position de départ
        const from = this.lastPosition || {
          coords: { latitude: userPos.lat, longitude: userPos.lng },
        };
        const lat1 = from.coords.latitude;
        const lon1 = from.coords.longitude;
        const lat2 = stop.coordinates.lat;
        const lon2 = stop.coordinates.lon;

        // Efface l'ancien tracé piéton
        this.layers.walking.clearLayers();

        // Requête à l'API publique OSRM (profil walking)
        const osrmUrl = `https://router.project-osrm.org/route/v1/walking/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`;
        const res = await fetch(osrmUrl);
        const routeData = await res.json();

        if (routeData && routeData.routes && routeData.routes.length > 0) {
          const route = routeData.routes[0];
          const coords = route.geometry.coordinates.map((c) => [c[1], c[0]]); // geojson [lon,lat] -> [lat,lon]

          // Dessine la ligne bleue de l'itinéraire piéton
          L.polyline(coords, { color: "blue", weight: 6, opacity: 0.8 }).addTo(
            this.layers.walking,
          );

          // Ajoute un marqueur de départ et d'arrivée sur le calque walking
          L.marker([lat1, lon1], { icon: this.icons.user })
            .bindPopup("Départ")
            .addTo(this.layers.walking);
          L.marker([lat2, lon2], { icon: this.icons.stop })
            .bindPopup(stop.stop_name)
            .addTo(this.layers.walking);

          // Recentre la carte pour montrer l'itinéraire
          this.map.fitBounds(coords, { padding: [50, 50] });

          // Affiche la distance à parcourir dans le panneau (en m ou km)
          const dist = route.distance; // en mètres
          const distText =
            dist > 1000
              ? (dist / 1000).toFixed(2) + " km"
              : Math.round(dist) + " m";
          // Supprime l'info précédente si présente
          const prevInfo = $panel.querySelector(".walking-info");
          if (prevInfo) prevInfo.remove();

          const infoDiv = document.createElement("div");
          infoDiv.className = "walking-info";

          // Estimation du temps de marche à 4 km/h (4000 m/h)
          const estMinutes = Math.round((dist / 4000) * 60); // minutes arrondies
          let estText = `${estMinutes} min`;
          if (estMinutes >= 60) {
            const h = Math.floor(estMinutes / 60);
            const m = estMinutes % 60;
            estText = m === 0 ? `${h} h` : `${h} h ${m} min`;
          }

          infoDiv.innerHTML = `<hr><strong>À pied :</strong> ${distText}<br><small>Est. ${estText}</small>`;
          $panel
            .querySelector(".bus-list")
            .insertAdjacentElement("afterend", infoDiv);

          // Ne pas démarrer automatiquement le suivi : l'utilisateur peut lancer le suivi via
          // le bouton 'Commencer le suivi' dans le panneau (voir plus bas).
        }
      } catch (err) {
        console.error("Erreur OSRM itinéraire :", err);
      }
    });
  }

  // Trace le parcours complet d'une ligne de bus (depuis notre API)
  async drawRoute(shapeId, followAfterDraw = false) {
    this.layers.route.clearLayers(); // On efface le trajet précédent

    try {
      //requête à notre API pour récupérer les points de la ligne de bus
      const response = await fetch(`${this.urlApi}/shapes/${shapeId}`);
      const data = await response.json();

      if (data.content && data.content.length > 0) {
        // Transformation des points API en coordonnées Leaflet
        const points = data.content.map((p) => [
          p.shape_pt_lat,
          p.shape_pt_lon,
        ]);

        // Dessin de la ligne rouge
        L.polyline(points, { color: "red", weight: 8, opacity: 0.7 }).addTo(
          this.layers.route,
        );

        // Icônes de départ et d'arrivée du bus
        L.marker(points[0], { icon: this.icons.start })
          .bindPopup("Départ du bus")
          .addTo(this.layers.route);
        L.marker(points[points.length - 1], { icon: this.icons.end })
          .bindPopup("Terminus")
          .addTo(this.layers.route);

        // On ajuste la vue pour voir toute la ligne de bus
        this.map.flyToBounds(points, { padding: [50, 50] });

        // Si demandé, démarrer le suivi vers le terminus (dernier point)
        if (followAfterDraw) {
          try {
            const last = points[points.length - 1];
            this.currentDestination = L.latLng(last[0], last[1]);
            this.followingRoute = true;
            this._startWatchingPosition();
            if (this.lastPosition) {
              this.map.panTo([
                this.lastPosition.coords.latitude,
                this.lastPosition.coords.longitude,
              ]);
            }
          } catch (e) {
            // ignore
          }
        }
      }
    } catch (error) {
      console.error("Erreur lors du tracé du trajet :", error);
    }
  }
}

export { Geo };
