presentation({
  title: "Adaptive Inference at the Edge",
  subtitle: "Recipes for common FrameSeq slides",
  author: "Research Systems Group",
  institute: "FrameSeq Gallery",
  date: "2026",
  theme: "minimal-academic",
});

// Recipe: cover
slide({ name: "Cover" }).cover();
text("Section 01").eyebrow();
text("Adaptive Inference at the Edge").hero();
text("Routing easy inputs away from the network").subtitle();
text("Research Systems Group").author();

// Recipe: one idea with its evidence
slide("Cloud-only inference stalls on the network");
text("The round trip costs more than the model call it protects.").lead();
bullets(
  "Latency varies with congestion, not with model size",
  "Every input leaves the device, including private ones",
  "A fixed route spends the same budget on easy and hard inputs",
);
note("Give the audience the problem before the method.");
text("Measurements in this deck are illustrative.").caption();

// Recipe: comparison
slide("Two routes, one budget").split("45:55");
text("Cloud only").lead();
bullets("118 ms round trip", "Every input uploaded", "One accuracy operating point");

right();
text("Adaptive").lead();
bullets("41 ms for routed inputs", "72% stay on the device", "Accuracy traded per input");

// Recipe: a row of measurements inside ordinary flow
slide("Operating profile");
text("Three numbers summarise the run.");
gridSection(
  3,
  metric("41 ms", "Median latency"),
  metric("72%", "Inputs kept local"),
  metric("−0.6 pt", "Accuracy change"),
).gap(20);
text("Values are illustrative and not a benchmark.").caption();

// Recipe: code beside its explanation
slide("The routing rule").split("52:48");
code(`if (confidence(small) >= threshold) {
  return small;
}
return large;`, "ts");

right();
text("One comparison decides the route.").lead();
bullets(
  "The small model always runs first",
  "Only its confidence crosses the network",
  "The threshold is the single tuning knob",
);

// Recipe: a formula with its reading
slide("Objective").center();
text`The router minimises latency subject to an accuracy floor.`.lead();
math`\min_{\theta}\; \mathbb{E}\big[\ell(f_\theta(x), y)\big] + \lambda\,\mathbb{E}\big[c(x)\big]`;
text("λ prices a millisecond against a point of accuracy.").caption();

// Recipe: a flow diagram with no coordinates
slide("Request path").canvas();
at("flow").row().gap(90).anchor("center");
rect("Device").as("device").width(200).height(110);
rect("Router").as("router").width(200).height(110);
rect("Cloud").as("cloud").width(200).height(110);
line().from("device").to("router").arrow("end");
line().from("router").to("cloud").arrow("end");
text("28% of inputs continue past the router").caption().below("router", 28);

// Recipe: a two-dimensional architecture
slide("Where the work happens").canvas();
at("map").column().gap(36).anchor("center");
at("map/device").row().gap(28);
rect("Small model").as("small").width(230).height(96);
rect("Confidence").as("confidence").width(230).height(96);
at("map/cloud").row().gap(28);
rect("Large model").as("large").width(230).height(96);
rect("Cache").as("cache").width(230).height(96);

at("map");
line().from("confidence").to("large").arrow("end");
line().from("large").to("cache").arrow("both");

// Recipe: progressive reveal
slide("What changed").notes("Pause after each step; the third is the surprising one.");
steps(
  "Latency fell by 65% for routed inputs",
  "Accuracy moved by less than one point",
  "The threshold, not the model, carries the trade-off",
);

// Recipe: closing statement
slide({ name: "Close" }).center();
text("Route the easy inputs. Keep the budget for the hard ones.").quote();
text("Research Systems Group · 2026").caption();
