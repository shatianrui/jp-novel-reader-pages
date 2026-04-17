const themeBtn = document.getElementById("themeBtn");
const storedTheme = localStorage.getItem("siteTheme") || "light";

function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  if (themeBtn) {
    themeBtn.textContent = theme === "dark" ? "☀️" : "🌙";
    themeBtn.setAttribute("aria-label", theme === "dark" ? "切换到浅色模式" : "切换到深色模式");
  }
}

applyTheme(storedTheme);

if (themeBtn) {
  themeBtn.addEventListener("click", () => {
    const nextTheme = document.body.classList.contains("dark") ? "light" : "dark";
    localStorage.setItem("siteTheme", nextTheme);
    applyTheme(nextTheme);
  });
}
