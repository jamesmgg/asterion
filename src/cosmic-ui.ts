import { COSMIC_DESTINATIONS } from "./cosmic-data.ts";
import type { CosmicBody, CosmicDestination } from "./cosmic-data.ts";
import "./cosmic.css";

type CosmicCallbacks = {
  onDestination: (id: string) => void;
  onHome: () => void;
  onBody: (id: string | undefined) => void;
  onScale: (real: boolean) => void;
  onComparison?: (show: boolean) => void;
};
type Category = "all" | CosmicDestination["kind"];

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const kindName = (kind: CosmicDestination["kind"]) =>
  ({ star: "Star", system: "Planetary system", "black-hole": "Black hole" })[
    kind
  ];
const number = (value: number, digits = 2) =>
  new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(value);
const radius = (value: number) => {
  const rounded = Number(value.toPrecision(3));
  if (rounded >= 1e9) return `≈ ${number(rounded / 1e9)} billion km`;
  if (rounded >= 1e6) return `≈ ${number(rounded / 1e6)} million km`;
  return `≈ ${number(rounded, 0)} km`;
};
const distance = (value: number) =>
  value >= 1e6
    ? `${number(value / 1e6, 1)} million light-years`
    : `${number(Number(value.toPrecision(3)), value < 10 ? 2 : 1)} light-years`;
const solarMass = (value: number) =>
  value >= 1e9
    ? `${number(value / 1e9)} billion M☉`
    : value >= 1e6
      ? `${number(value / 1e6)} million M☉`
      : `${number(value, 3)} M☉`;
const svg = (paths: string, className = "") =>
  `<svg ${className ? `class="${className}"` : ""} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const closeIcon = svg('<path d="m6 6 12 12M6 18 18 6"/>');
const backIcon = svg('<path d="M20 12H4m6-6-6 6 6 6"/>');
const orbitIcon = svg(
  '<ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-30 12 12)"/><circle cx="12" cy="12" r="3"/>',
);
const chevronIcon = svg('<path d="m7 10 5 5 5-5"/>');

function illustration(destination: CosmicDestination) {
  const worlds = destination.bodies.filter((body) => body.role === "planet");
  return `<span class="cosmic-art cosmic-art--${destination.kind} cosmic-art--${escape(destination.id)}" aria-hidden="true" style="--cosmic-accent:${escape(destination.accent)}">
    <span class="cosmic-art-stars"></span>
    ${
      destination.kind === "black-hole"
        ? '<span class="cosmic-art-lens"></span><span class="cosmic-art-disk"></span><span class="cosmic-art-shadow"></span>'
        : destination.kind === "system"
          ? `<span class="cosmic-art-system">${worlds
              .slice(0, 7)
              .map(
                (body, index) =>
                  `<i class="cosmic-art-orbit" style="--orbit:${index};--world-color:${escape(body.color)}"></i>`,
              )
              .join("")}<span class="cosmic-art-star"></span></span>`
          : '<span class="cosmic-art-corona"></span><span class="cosmic-art-star"></span>'
    }
  </span>`;
}

function bodyFacts(body: CosmicBody) {
  const facts: [string, string][] = [
    [
      body.role === "black-hole"
        ? "Schwarzschild radius"
        : body.radiusIsEstimate
          ? "Estimated radius"
          : "Radius",
      radius(body.radiusKm),
    ],
  ];
  if (body.massSolar !== undefined)
    facts.push(["Mass", solarMass(body.massSolar)]);
  else if (body.massEarth !== undefined)
    facts.push([
      body.massIsMinimum ? "Minimum mass" : "Mass",
      `${number(body.massEarth, 3)} M⊕`,
    ]);
  if (body.temperatureK !== undefined)
    facts.push(["Temperature", `${number(body.temperatureK, 0)} K`]);
  if (body.orbit) {
    facts.push(["Orbital period", `${number(body.orbit.periodDays, 3)} days`]);
    facts.push([
      "Orbit semimajor axis",
      `${number(body.orbit.semiMajorAU, 4)} AU`,
    ]);
  }
  if (body.role === "star")
    facts.push([
      "Relative to our Sun",
      `${number(body.radiusKm / 695700, 3)} × radius`,
    ]);
  return facts;
}

/** A separate destination layer; the familiar Solar System interface stays intact. */
export class CosmicUI {
  private dialog: HTMLDialogElement;
  private overlay: HTMLElement;
  private dock: HTMLElement;
  private elapsed: HTMLElement;
  private callbacks: CosmicCallbacks;
  private category: Category = "all";
  private query = "";
  private destination?: CosmicDestination;
  private selectedBody?: string;
  private returnFocus: HTMLElement | null = null;
  private elapsedText = "";

  constructor(callbacks: CosmicCallbacks) {
    this.callbacks = callbacks;
    this.dialog = document.createElement("dialog");
    this.dialog.id = "cosmic-library-modal";
    this.dialog.setAttribute("aria-labelledby", "cosmic-library-title");
    this.dialog.innerHTML = `
      <div class="cosmic-library-head">
        <div><p class="cosmic-library-kicker">Beyond our solar system</p><h2 id="cosmic-library-title">A little further into the cosmos</h2><p>Familiar stars. Other worlds. The edge of the unknowable.</p></div>
        <button class="icon-button" id="cosmic-close-library" aria-label="Close destination library">${closeIcon}</button>
      </div>
      <div class="cosmic-library-tools">
        <div class="cosmic-categories" role="group" aria-label="Destination categories">
          ${(
            [
              ["all", "All"],
              ["star", "Stars"],
              ["system", "Planetary systems"],
              ["black-hole", "Black holes"],
            ] as const
          )
            .map(
              ([value, label]) =>
                `<button data-cosmic-category="${value}" aria-pressed="${value === "all"}">${label}</button>`,
            )
            .join("")}
        </div>
        <label class="cosmic-search-wrap">${svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>')}<input id="cosmic-search" type="search" placeholder="Find a destination" aria-label="Find a destination" autocomplete="off" spellcheck="false"/></label>
      </div>
      <div id="cosmic-library-results" class="cosmic-library-results"></div>
      <div class="cosmic-library-foot"><span id="cosmic-result-count" role="status" aria-live="polite"></span><span>Measured properties. Illustrated appearances.</span></div>`;
    document.querySelector("#app")!.append(this.dialog);

    this.overlay = document.createElement("aside");
    this.overlay.id = "cosmic-overlay";
    this.overlay.hidden = true;
    this.overlay.setAttribute("aria-label", "Cosmic destination");
    this.overlay.innerHTML = `
      <div class="cosmic-heading">
        <button id="cosmic-home" class="cosmic-home" aria-label="Return to solar system">${backIcon}<span>Solar system</span></button>
        <p id="cosmic-kind" class="cosmic-kind"></p>
        <h1 id="cosmic-title" tabindex="-1"></h1>
        <p id="cosmic-tagline" class="cosmic-tagline"></p>
        <p id="cosmic-location" class="cosmic-location"></p>
      </div>
      <details id="cosmic-details">
        <summary><span id="cosmic-detail-summary">About this destination</span>${chevronIcon}</summary>
        <div class="cosmic-detail-content"><h2 id="cosmic-body-name" hidden></h2><p id="cosmic-description"></p><dl id="cosmic-facts"></dl><details id="cosmic-model"><summary>Sources &amp; model ${chevronIcon}</summary><p id="cosmic-model-note"></p><p class="cosmic-unit-note">M☉ = Sun masses · M⊕ = Earth masses · AU = Earth–Sun distance</p><ul id="cosmic-sources"></ul></details></div>
      </details>
      <div class="cosmic-mode-controls">
        <label id="cosmic-scale-control" hidden><span>System scale</span><select id="cosmic-scale" aria-label="Cosmic system scale"><option value="readable">Readable spacing</option><option value="true">True sizes &amp; orbits</option></select></label>
        <label id="cosmic-comparison-control" class="cosmic-comparison-control" hidden><input id="cosmic-comparison" type="checkbox"/><span>Compare with our Sun</span></label>
        <p id="cosmic-scale-note"></p>
      </div>`;
    document.querySelector("main")!.append(this.overlay);
    this.dock = document.createElement("nav");
    this.dock.id = "cosmic-dock";
    this.dock.className = "cosmic-dock";
    this.dock.setAttribute("aria-label", "Worlds at this destination");
    this.dock.hidden = true;
    document.querySelector(".flight-deck")!.append(this.dock);
    this.elapsed = document.createElement("span");
    this.elapsed.id = "cosmic-elapsed";
    this.elapsed.hidden = true;
    document
      .querySelector(".transport")!
      .insertBefore(this.elapsed, document.querySelector(".physics-status"));

    this.dialog
      .querySelector("#cosmic-close-library")!
      .addEventListener("click", () => this.dialog.close());
    this.dialog.addEventListener("close", () => {
      this.returnFocus?.focus({ preventScroll: true });
      this.returnFocus = null;
    });
    this.dialog.addEventListener("click", (event) => {
      if (event.target !== this.dialog) return;
      const rect = this.dialog.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        this.dialog.close();
    });
    this.dialog
      .querySelector<HTMLInputElement>("#cosmic-search")!
      .addEventListener("input", (event) => {
        this.query = (event.target as HTMLInputElement).value;
        this.renderLibrary();
      });
    this.dialog
      .querySelectorAll<HTMLButtonElement>("[data-cosmic-category]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          this.category = button.dataset.cosmicCategory as Category;
          this.renderLibrary();
        });
      });
    this.dialog
      .querySelector("#cosmic-library-results")!
      .addEventListener("click", (event) => {
        const target = event.target as Element;
        const card = target.closest<HTMLElement>("[data-cosmic-destination]");
        if (card) {
          this.returnFocus = null;
          this.dialog.close();
          this.callbacks.onDestination(card.dataset.cosmicDestination!);
        } else if (target.closest("#cosmic-clear-filters")) {
          this.category = "all";
          this.query = "";
          this.dialog.querySelector<HTMLInputElement>("#cosmic-search")!.value =
            "";
          this.renderLibrary();
          this.dialog
            .querySelector<HTMLInputElement>("#cosmic-search")!
            .focus();
        }
      });
    this.overlay
      .querySelector("#cosmic-home")!
      .addEventListener("click", () => this.callbacks.onHome());
    this.overlay
      .querySelector<HTMLSelectElement>("#cosmic-scale")!
      .addEventListener("change", (event) => {
        const real = (event.target as HTMLSelectElement).value === "true";
        this.updateScaleNote(real);
        this.callbacks.onScale(real);
      });
    this.overlay
      .querySelector<HTMLInputElement>("#cosmic-comparison")!
      .addEventListener("change", (event) => {
        this.callbacks.onComparison?.(
          (event.target as HTMLInputElement).checked,
        );
      });
    this.dock.addEventListener("click", (event) => {
      const button = (event.target as Element).closest<HTMLElement>(
        "[data-cosmic-body]",
      );
      if (!button) return;
      const id = button.dataset.cosmicBody || undefined;
      this.selectBody(id);
      this.callbacks.onBody(id);
    });
    this.renderLibrary();
  }

  openLibrary() {
    if (this.dialog.open) return;
    this.returnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    this.dialog.showModal();
    if (!matchMedia("(max-width: 759px)").matches)
      this.dialog
        .querySelector<HTMLInputElement>("#cosmic-search")!
        .focus({ preventScroll: true });
  }

  private renderLibrary() {
    const query = this.query.trim().toLocaleLowerCase();
    const destinations = COSMIC_DESTINATIONS.filter(
      (destination) =>
        (this.category === "all" || destination.kind === this.category) &&
        (!query ||
          [
            destination.name,
            destination.tagline,
            destination.constellation,
            kindName(destination.kind),
            ...destination.bodies.map((body) => body.name),
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(query)),
    );
    this.dialog
      .querySelectorAll<HTMLElement>("[data-cosmic-category]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.cosmicCategory === this.category),
        ),
      );
    this.dialog.querySelector("#cosmic-library-results")!.innerHTML =
      destinations.length
        ? `<div class="cosmic-cards">${destinations.map((destination) => `<button class="cosmic-card" data-cosmic-destination="${escape(destination.id)}" aria-label="Explore ${escape(destination.name)}">${illustration(destination)}<span class="cosmic-card-copy"><span class="cosmic-card-kind">${kindName(destination.kind)}</span><strong>${escape(destination.name)}</strong><span class="cosmic-card-tagline">${escape(destination.tagline)}</span><span class="cosmic-card-distance">${distance(destination.distanceLy)}</span></span></button>`).join("")}</div>`
        : '<div class="cosmic-empty"><span aria-hidden="true">✧</span><h3>No destinations found</h3><p>Try a star name or choose another category.</p><button id="cosmic-clear-filters">Clear filters</button></div>';
    this.dialog.querySelector("#cosmic-result-count")!.textContent =
      `${destinations.length} ${destinations.length === 1 ? "destination" : "destinations"}`;
  }

  showDestination(destination: CosmicDestination) {
    this.destination = destination;
    this.selectedBody = undefined;
    this.overlay.hidden = false;
    this.dock.hidden = false;
    this.elapsed.hidden = false;
    this.overlay.style.setProperty("--cosmic-accent", destination.accent);
    this.overlay.querySelector("#cosmic-kind")!.textContent = kindName(
      destination.kind,
    );
    this.overlay.querySelector("#cosmic-title")!.textContent = destination.name;
    this.overlay.querySelector("#cosmic-tagline")!.textContent =
      destination.tagline;
    this.overlay.querySelector("#cosmic-location")!.textContent =
      `${distance(destination.distanceLy)} away · ${destination.constellation}`;
    this.overlay.querySelector<HTMLDetailsElement>("#cosmic-details")!.open =
      !matchMedia("(max-width: 759px)").matches;
    this.overlay.querySelector<HTMLDetailsElement>("#cosmic-model")!.open =
      false;
    this.overlay.querySelector<HTMLElement>("#cosmic-scale-control")!.hidden =
      destination.kind !== "system";
    this.overlay.querySelector<HTMLElement>(
      "#cosmic-comparison-control",
    )!.hidden = destination.kind !== "star" || !this.callbacks.onComparison;
    this.overlay.querySelector<HTMLSelectElement>("#cosmic-scale")!.value =
      "readable";
    this.overlay.querySelector<HTMLInputElement>(
      "#cosmic-comparison",
    )!.checked = false;
    this.updateScaleNote(false);
    this.dock.innerHTML = `<button class="cosmic-stop" data-cosmic-body="" aria-label="Destination overview" aria-pressed="true"><span class="cosmic-overview-icon">${orbitIcon}</span><span>Overview</span><i></i></button>${destination.bodies.map((body) => `<button class="cosmic-stop" data-cosmic-body="${escape(body.id)}" aria-label="Visit ${escape(body.name)}" aria-pressed="false"><span class="cosmic-body-thumb cosmic-body-thumb--${escape(body.appearance)}" style="--body-color:${escape(body.color)}"></span><span>${escape(body.name)}</span><i></i></button>`).join("")}`;
    this.dock.scrollLeft = 0;
    this.selectBody(undefined);
    this.setElapsed(0);
    this.overlay
      .querySelector<HTMLElement>("#cosmic-title")!
      .focus({ preventScroll: true });
  }

  selectBody(id?: string) {
    if (!this.destination) return;
    const body = this.destination.bodies.find(
      (candidate) => candidate.id === id,
    );
    this.selectedBody = body?.id;
    this.dock
      .querySelectorAll<HTMLElement>("[data-cosmic-body]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(
            (button.dataset.cosmicBody || undefined) === this.selectedBody,
          ),
        ),
      );
    const active = this.dock.querySelector<HTMLElement>(
      '[aria-pressed="true"]',
    );
    if (active) {
      const activeBounds = active.getBoundingClientRect();
      const dockBounds = this.dock.getBoundingClientRect();
      if (activeBounds.left < dockBounds.left)
        this.dock.scrollLeft -= dockBounds.left - activeBounds.left;
      else if (activeBounds.right > dockBounds.right)
        this.dock.scrollLeft += activeBounds.right - dockBounds.right;
    }
    const bodyName =
      this.overlay.querySelector<HTMLElement>("#cosmic-body-name")!;
    bodyName.hidden = !body;
    bodyName.textContent = body?.name ?? "";
    this.overlay.querySelector("#cosmic-detail-summary")!.textContent = body
      ? `About ${body.name}`
      : "About this destination";
    this.overlay.querySelector("#cosmic-description")!.textContent =
      body?.description ?? this.destination.description;
    let facts: [string, string][];
    if (body) facts = bodyFacts(body);
    else if (this.destination.kind !== "system")
      facts = bodyFacts(this.destination.bodies[0]);
    else {
      const planets = this.destination.bodies.filter(
        (candidate) => candidate.role === "planet",
      );
      const star = this.destination.bodies.find(
        (candidate) => candidate.role === "star",
      );
      facts = [["Worlds shown", String(planets.length)]];
      if (star) {
        facts.push(["Host star radius", radius(star.radiusKm)]);
        if (star.temperatureK !== undefined)
          facts.push(["Host temperature", `${number(star.temperatureK, 0)} K`]);
      }
      const periods = planets.flatMap((planet) =>
        planet.orbit ? [planet.orbit.periodDays] : [],
      );
      if (periods.length)
        facts.push([
          periods.length === 1 ? "Orbital period" : "Orbital periods",
          `${number(Math.min(...periods), 2)}${periods.length > 1 ? `–${number(Math.max(...periods), 2)}` : ""} days`,
        ]);
    }
    this.overlay.querySelector("#cosmic-facts")!.innerHTML = facts
      .map(
        ([label, value]) =>
          `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`,
      )
      .join("");
    this.overlay.querySelector("#cosmic-model-note")!.textContent =
      this.destination.modelNote;
    this.overlay.querySelector("#cosmic-sources")!.innerHTML =
      this.destination.sources
        .map(
          (source) =>
            `<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.label)}<span aria-hidden="true"> ↗</span></a></li>`,
        )
        .join("");
  }

  private updateScaleNote(real: boolean) {
    const note = this.overlay.querySelector<HTMLElement>("#cosmic-scale-note")!;
    if (this.destination?.kind === "system") {
      note.textContent = real
        ? "Proportional radii & orbits. Tap labels for close-ups."
        : "Worlds enlarged for visibility. Orbital phases are illustrative.";
    } else if (this.destination?.kind === "star") {
      note.textContent = "Stars share one radius scale in the comparison.";
    } else
      note.textContent =
        "Illustrative accretion flow and gravitational lensing.";
  }

  hideDestination() {
    this.overlay.hidden = true;
    this.dock.hidden = true;
    this.elapsed.hidden = true;
    this.destination = undefined;
    this.selectedBody = undefined;
  }

  setElapsed(days: number) {
    if (!Number.isFinite(days)) return;
    const elapsed = `${number(days, Math.abs(days) < 100 ? 1 : 0)} days elapsed`;
    if (elapsed === this.elapsedText) return;
    this.elapsedText = elapsed;
    this.elapsed.textContent = elapsed;
  }
}
