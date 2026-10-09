// The site's script owns Open; it is not an edit bar variant.
for (const tip of document.querySelectorAll("card-tip")) {
  tip.addEventListener("click", () => tip.toggleAttribute("data-open"));
}
