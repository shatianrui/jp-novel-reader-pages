const themeBtn = document.getElementById("themeBtn");
const storedTheme = (() => {
  try {
    return localStorage.getItem("siteTheme") || "light";
  } catch (error) {
    return "light";
  }
})();

function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  document.body.classList.toggle("light", theme !== "dark");
  if (themeBtn) {
    const icon = themeBtn.querySelector(".theme-icon");
    if (!icon) {
      themeBtn.innerHTML = '<span class="theme-icon" aria-hidden="true"></span>';
    }
    themeBtn.setAttribute("aria-label", theme === "dark" ? "切换到浅色模式" : "切换到深色模式");
    themeBtn.title = theme === "dark" ? "切换到浅色模式" : "切换到深色模式";
  }
}

applyTheme(storedTheme);

if (themeBtn) {
  themeBtn.addEventListener("click", () => {
    const nextTheme = document.body.classList.contains("dark") ? "light" : "dark";
    try {
      localStorage.setItem("siteTheme", nextTheme);
    } catch (error) {
      // ignore
    }
    applyTheme(nextTheme);
  });
}

function markActiveNav() {
  const page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  document.querySelectorAll(".nav-link").forEach((link) => {
    const href = (link.getAttribute("href") || "").split("?")[0].toLowerCase();
    const isHome = page === "" || page === "index.html";
    const linkIsHome = href === "index.html" || href === "./" || href === "/";
    let active = false;
    if (page === "bookshelf.html" && href.includes("bookshelf")) {
      active = true;
    } else if (isHome && linkIsHome && !link.dataset.navOrder) {
      active = link.textContent.trim() === "首页";
    } else if (isHome && link.dataset.navOrder) {
      const order = new URLSearchParams(window.location.search).get("order") || "";
      active = order === link.dataset.navOrder;
    }
    link.classList.toggle("active", active);
    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

markActiveNav();
