// Theme toggle
(function () {
  const saved = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved || (prefersDark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);
})();

function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") || "light";
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
}

// Search filter
function filterCards() {
  const q = (document.getElementById("search")?.value || "").toLowerCase().trim();
  const cards = document.querySelectorAll(".card");
  let visible = 0;
  cards.forEach((c) => {
    const text = c.textContent.toLowerCase();
    const match = !q || text.includes(q);
    c.style.display = match ? "" : "none";
    if (match) visible++;
  });
  const empty = document.getElementById("emptyState");
  if (empty) empty.style.display = visible === 0 ? "block" : "none";
}

// Health probe (best-effort, may fail due to CORS — failures shown as unknown)
async function probe(url, dotId) {
  const dot = document.getElementById(dotId);
  if (!dot) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(url, { mode: "no-cors", signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    dot.className = "status-dot up";
    dot.title = "Reachable";
  } catch (e) {
    dot.className = "status-dot unknown";
    dot.title = "Unknown (CORS or offline)";
  }
}

// Wire up on load
document.addEventListener("DOMContentLoaded", () => {
  const search = document.getElementById("search");
  if (search) search.addEventListener("input", filterCards);

  // Active nav
  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".topbar nav a").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (href === path || (path === "" && href === "index.html")) a.classList.add("active");
  });

  // Probes (only on index)
  if (path === "index.html" || path === "") {
    document.querySelectorAll("[data-probe]").forEach((el) => {
      const url = el.getAttribute("data-probe");
      const id = el.getAttribute("data-status-id");
      if (url && id) probe(url, id);
    });
  }
});