/* Behaviour for the public support page: tabs, the coverage map, the watch filter,
   the screenshot lightbox and the request/report form. No build step — this file
   ships as written. */
(function () {
  "use strict";

  /* --- tabs ---------------------------------------------------------------- */
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  var panels = {};
  tabs.forEach(function (tab) {
    panels[tab.dataset.panel] = document.getElementById(tab.dataset.panel);
  });

  function show(name) {
    tabs.forEach(function (tab) {
      var on = tab.dataset.panel === name;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      if (panels[tab.dataset.panel]) panels[tab.dataset.panel].hidden = !on;
    });
    if (location.hash.slice(1) !== name) history.replaceState(null, "", "#" + name);
    // Leaflet measures its container on creation, and a hidden panel measures 0x0 —
    // so a map built while the watches tab was open needs both its size and its zoom
    // recomputed the first time it becomes visible.
    if (name === "cities" && map) {
      map.invalidateSize();
      fitCities();
    }
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () { show(tab.dataset.panel); });
  });
  if (panels[location.hash.slice(1)]) show(location.hash.slice(1));

  /* --- coverage map -------------------------------------------------------- */
  var map = null;
  var markers = {};
  var shapes = {};
  var cityBounds = [];
  var cities = window.CITIES || [];
  var mapEl = document.getElementById("map");
  var mapHint = document.getElementById("map-hint");

  // Space-grouped, matching the counts the generator renders into the city cards;
  // toLocaleString() would follow the viewer's locale and disagree with them.
  function groupDigits(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  function fitCities() {
    if (map && cityBounds.length) map.fitBounds(cityBounds, { padding: [42, 42] });
  }

  function hint(text) {
    if (!mapHint) return;
    mapHint.textContent = text;
    mapHint.hidden = false;
  }

  function buildMap() {
    if (!mapEl || !cities.length) return;
    if (typeof L === "undefined") {
      mapEl.innerHTML = '<p class="hint">The map needs network access to load.</p>';
      return;
    }
    map = L.map(mapEl, { scrollWheelZoom: false });
    // openstreetmap.org's own tiles: no key, no account, no third-party service. Their
    // usage policy is the constraint, so this layer is deliberately frugal — a browsing
    // depth no deeper than a city (maxZoom), tiles fetched only once panning settles
    // (updateWhenIdle), and a small off-screen buffer. Scroll-zoom is off for the same
    // reason: a wheel over the map would otherwise walk whole zoom levels of tiles.
    //
    // The policy identifies websites by Referer, which a page opened from file:// does
    // not send — that request is refused with "Access blocked". Serve the directory over
    // http(s) (build.py --open does) and the browser sends one.
    var tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 16, updateWhenIdle: true, keepBuffer: 1,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // A basemap that starts refusing tiles must not leave broken images on the page:
    // drop the layer and let the pins stand on the board background instead.
    var failures = 0;
    tiles.on("tileerror", function () {
      if (++failures < 4 || !map.hasLayer(tiles)) return;
      map.removeLayer(tiles);
      mapEl.classList.add("no-tiles");
      hint("The basemap could not be loaded — the pins still show every city we cover, "
        + "and the list below has them all.");
    });

    cities.forEach(function (city) {
      if (city.lat == null || city.lon == null) return;
      var at = [city.lat, city.lon];
      cityBounds.push(at);
      // The municipal boundary, drawn to make the city recognisable. It is not a
      // coverage edge: the backend resolves a fix to a city by radiusKm, which reaches
      // further out than this.
      if (city.outline) {
        shapes[city.name] = L.polygon(city.outline, {
          weight: 1.5, opacity: .95, color: "#ff9616",
          fillColor: "#ff9616", fillOpacity: .14, interactive: false
        }).addTo(map);
      }
      var marker = L.marker(at, {
        icon: L.divIcon({
          className: "", html: '<div class="city-pin"></div>',
          iconSize: [14, 14], iconAnchor: [7, 7]
        }),
        title: city.name
      }).addTo(map);
      var stops = city.stations ? groupDigits(city.stations) + " stops" : "covered";
      marker.bindPopup("<strong>" + city.name + "</strong><br>" + stops);
      markers[city.name] = marker;
    });

    fitCities();
  }

  buildMap();

  document.querySelectorAll(".city-focus").forEach(function (button) {
    button.addEventListener("click", function () {
      var li = button.closest(".city");
      var name = button.querySelector(".city-name").textContent.trim();
      if (!map || !li) return;
      // Frame the city's own boundary where we have one: a fixed zoom that suits Brno
      // leaves Greater London running off every edge.
      if (shapes[name]) {
        map.fitBounds(shapes[name].getBounds(), { padding: [30, 30] });
      } else {
        map.setView([parseFloat(li.dataset.lat), parseFloat(li.dataset.lon)], 11);
      }
      if (markers[name]) markers[name].openPopup();
      mapEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });

  /* --- watch filter -------------------------------------------------------- */
  var filter = document.getElementById("device-filter");
  var filterHint = document.getElementById("filter-hint");
  var rows = Array.prototype.slice.call(document.querySelectorAll("table.devices tbody tr"));
  var families = Array.prototype.slice.call(document.querySelectorAll(".family"));
  var cards = Array.prototype.slice.call(document.querySelectorAll(".family-card"));
  var picked = null;

  // One series' table at a time. Clicking the open card closes it, so the grid can be
  // returned to without a separate "show all" control.
  function pick(name) {
    picked = name;
    cards.forEach(function (card) {
      card.setAttribute("aria-pressed", card.dataset.family === name ? "true" : "false");
    });
    families.forEach(function (family) {
      family.hidden = family.dataset.family !== name;
    });
  }

  cards.forEach(function (card) {
    card.addEventListener("click", function () {
      pick(card.dataset.family === picked ? null : card.dataset.family);
    });
  });

  var clearBtn = document.getElementById("filter-clear");

  if (filter) {
    filter.addEventListener("input", applyFilter);

    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        filter.value = "";
        applyFilter();
        filter.focus();
      });
    }

    function applyFilter() {
      var q = filter.value.trim().toLowerCase();
      if (clearBtn) clearBtn.hidden = !filter.value;
      // A search spans every series, so while one is running it drives which tables are
      // open instead of the card selection; clearing the box hands control back.
      if (!q) {
        rows.forEach(function (row) { row.hidden = false; });
        filterHint.hidden = true;
        pick(picked);
        return;
      }
      var shown = 0;
      rows.forEach(function (row) {
        var hit = row.dataset.search.indexOf(q) !== -1;
        row.hidden = !hit;
        if (hit) shown++;
      });
      families.forEach(function (family) {
        family.hidden = !family.querySelector("tbody tr:not([hidden])");
      });
      cards.forEach(function (card) { card.setAttribute("aria-pressed", "false"); });
      filterHint.hidden = false;
      filterHint.textContent = shown
        ? shown + (shown === 1 ? " watch matches" : " watches match")
        : "No watch matches “" + filter.value.trim();
    }
  }

  /* --- request / report ---------------------------------------------------- */
  // Both header buttons open the same dialog; the mode picks which chooser is shown
  // and the chosen kind rewrites the labels around the free text. The page is static
  // and holds no credential, so this posts to the backend the rest of its numbers come
  // from, and that turns the submission into an issue.
  var modal = document.getElementById("request");
  var form = document.getElementById("request-form");
  var subject = document.getElementById("request-subject");
  var subjectLabel = document.getElementById("request-subject-label");
  var details = document.getElementById("request-details");
  var detailsLabel = document.getElementById("request-details-label");
  var contact = document.getElementById("request-contact");
  var title = document.getElementById("request-title");
  var status = document.getElementById("request-status");
  var submit = document.getElementById("request-submit");
  var cancel = document.getElementById("request-cancel");
  var closeReq = document.getElementById("request-close");
  var chooser = { request: document.getElementById("request-kind"),
                  report: document.getElementById("report-kind") };
  var modalReturn = null;

  var MODES = {
    request: { title: "Request", details: "Note" },
    report: { title: "Report a problem", details: "What happened" }
  };

  // Per kind: the one thing the form insists on, and how to ask for it. The keys are
  // the backend's own (src/report.mjs); the option texts live in the markup.
  var KINDS = {
    city: { field: "City", placeholder: "Ostrava, Czechia" },
    watch: { field: "Watch", placeholder: "Forerunner 970" },
    departures: { field: "City and stop", placeholder: "Brno — Česká" },
    app: { field: "Watch", placeholder: "fēnix 7" },
    other: { field: "Subject", placeholder: "" }
  };

  function setStatus(text, kind) {
    if (!status) return;
    status.textContent = text || "";
    status.className = "modal-status" + (kind ? " is-" + kind : "");
    status.hidden = !text;
  }

  function currentKind() {
    var select = chooser[form.dataset.mode];
    return (select && select.value) || "other";
  }

  function describeKind() {
    var spec = KINDS[currentKind()] || KINDS.other;
    subjectLabel.textContent = spec.field;
    subject.placeholder = spec.placeholder;
  }

  function openModal(mode) {
    var spec = MODES[mode] ? mode : "request";
    form.dataset.mode = spec;
    title.textContent = MODES[spec].title;
    detailsLabel.innerHTML = MODES[spec].details + " <span>optional</span>";
    Object.keys(chooser).forEach(function (name) {
      var select = chooser[name];
      var on = name === spec;
      select.hidden = !on;
      // The label is a sibling, not a wrapper, so it has to be hidden with it.
      document.querySelector('label[for="' + select.id + '"]').hidden = !on;
    });
    describeKind();
    setStatus("");
    form.hidden = false;
    modal.hidden = false;
    subject.focus();
  }

  function closeModal() {
    modal.hidden = true;
    if (modalReturn) modalReturn.focus();
  }

  document.querySelectorAll(".head-button").forEach(function (button) {
    button.addEventListener("click", function () {
      modalReturn = button;
      openModal(button.dataset.mode);
    });
  });

  Object.keys(chooser).forEach(function (name) {
    chooser[name].addEventListener("change", describeKind);
  });

  if (cancel) cancel.addEventListener("click", closeModal);
  if (closeReq) closeReq.addEventListener("click", closeModal);
  if (modal) {
    modal.addEventListener("click", function (event) {
      if (event.target === modal) closeModal();
    });
    document.addEventListener("keydown", function (event) {
      if (!modal.hidden && event.key === "Escape") closeModal();
    });
  }

  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!subject.value.trim()) {
        setStatus("Please fill in “" + subjectLabel.textContent + "”.", "error");
        subject.focus();
        return;
      }
      var base = (window.API_BASE || "").replace(/\/$/, "");
      submit.disabled = cancel.disabled = true;
      submit.textContent = "Sending…";
      setStatus("");

      fetch(base + "/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: currentKind(),
          subject: subject.value,
          details: details.value,
          contact: contact.value
        })
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          return { ok: response.ok, body: body };
        });
      }).then(function (result) {
        if (!result.ok || !result.body.ok) {
          var refused = new Error(result.body.error || "it could not be sent");
          refused.answered = true;
          throw refused;
        }
        // The form is done: leaving it on screen invites a second identical issue.
        form.hidden = true;
        setStatus("Thank you — your message has been sent.", "ok");
        subject.value = details.value = contact.value = "";
      }).catch(function (error) {
        // A rejected fetch means the network failed, not that the server said no:
        // its message is the browser's own wording, not something to show a user.
        var why = error.answered ? error.message : "the server could not be reached";
        setStatus("Sorry — " + why + ". Please try again later.", "error");
      }).then(function () {
        submit.disabled = cancel.disabled = false;
        submit.textContent = "Send";
      });
    });
  }

  /* --- screenshot lightbox ------------------------------------------------- */
  var box = document.getElementById("lightbox");
  var boxImg = document.getElementById("lb-img");
  var boxTitle = document.getElementById("lb-title");
  var boxHint = document.getElementById("lb-hint");
  var boxCount = document.getElementById("lb-count");
  var prevBtn = document.getElementById("lb-prev");
  var nextBtn = document.getElementById("lb-next");
  var lastFocus = null;
  var group = [];
  var at = 0;

  function closeBox() {
    box.hidden = true;
    boxImg.removeAttribute("src");
    group = [];
    if (lastFocus) lastFocus.focus();
  }

  function showAt(i) {
    // Wraps, so the arrows never dead-end on a set this small.
    at = (i + group.length) % group.length;
    var link = group[at];
    boxImg.src = link.getAttribute("href");
    boxImg.alt = link.querySelector("img").alt;
    boxTitle.textContent = link.dataset.device + " — " + link.dataset.label;
    boxHint.textContent = link.dataset.hint;
    boxCount.textContent = group.length > 1 ? (at + 1) + " / " + group.length : "";
    // A lone screenshot has nothing to step to.
    prevBtn.hidden = nextBtn.hidden = group.length < 2;
  }

  document.querySelectorAll("a.shot").forEach(function (link) {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      lastFocus = link;
      // The set to page through is this watch's own shots, not the whole page: the
      // row is what shares a device, and a scenario only means something beside it.
      var row = link.closest("tr");
      group = Array.prototype.slice.call(
        (row || document).querySelectorAll("a.shot"));
      showAt(group.indexOf(link));
      box.hidden = false;
      box.querySelector(".lb-close").focus();
    });
  });

  prevBtn.addEventListener("click", function () { showAt(at - 1); });
  nextBtn.addEventListener("click", function () { showAt(at + 1); });

  box.addEventListener("click", function (event) {
    if (event.target === box || event.target.closest(".lb-close")) closeBox();
  });
  document.addEventListener("keydown", function (event) {
    if (box.hidden) return;
    if (event.key === "Escape") closeBox();
    else if (event.key === "ArrowLeft" && group.length > 1) showAt(at - 1);
    else if (event.key === "ArrowRight" && group.length > 1) showAt(at + 1);
  });
})();
