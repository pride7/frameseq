presentation({
  title: "Region name fixture",
  theme: "midnight",
});

slide("Mistyped region path").grid(2);

at("cell0/now").card();
text("Q3").eyebrow();
text("Anchors and region paths");

// A typo creates a second region instead of returning to the first one.
at("cell0/nwo");
text("Merged into main").caption();

// A region that never receives content.
at("cell1/later");

slide("Correct region paths").grid(2);

at("cell0/now").card();
text("Q3").eyebrow();
at("cell1/next").card();
text("Q4").eyebrow();
