presentation({
  title: "Shortest paths",
  theme: "paper",
});

slide({ name: "Title" }).center();
text("Algorithms · Lecture 7").eyebrow();
text("Shortest paths").hero();
text("Dijkstra's algorithm, one step at a time").lead();

slide("The problem").split("40:60");
text("Find the cheapest route from one node to every other.").lead();
bullets(
  "Every edge carries a non-negative weight",
  "A path costs the sum of its edges",
  "We want the distance to every node",
);

right();
text("Relaxation").eyebrow();
math`d(v) = \min_{u} \big( d(u) + w(u,v) \big)`.size(26);
text`Start from $d(s) = 0$ and improve every estimate until none changes.`.caption();

slide("A small graph").canvas();
line().from("a").to("b").stroke("#8a6a4a").strokeWidth(3);
line().from("a").to("c").stroke("#b45309").strokeWidth(5);
line().from("c").to("b").stroke("#b45309").strokeWidth(5);
line().from("b").to("d").stroke("#b45309").strokeWidth(5);
line().from("c").to("e").stroke("#8a6a4a").strokeWidth(3);
line().from("d").to("e").stroke("#b45309").strokeWidth(5);

circle("A\n0").as("a")
  .position({ x: 60, y: 190 })
  .width(120)
  .fill("#f4dcc4")
  .stroke("#b45309");
circle("B\n3").as("b")
  .position({ x: 360, y: 30 })
  .width(120)
  .fill("#fbf3e8")
  .stroke("#8a6a4a");
circle("C\n2").as("c")
  .position({ x: 360, y: 350 })
  .width(120)
  .fill("#fbf3e8")
  .stroke("#8a6a4a");
circle("D\n8").as("d")
  .position({ x: 700, y: 30 })
  .width(120)
  .fill("#fbf3e8")
  .stroke("#8a6a4a");
circle("E\n10").as("e")
  .position({ x: 700, y: 350 })
  .width(120)
  .fill("#fbf3e8")
  .stroke("#8a6a4a");

// Each weight sits on the middle of its edge.
const weights = [
  ["4", 248, 148], ["2", 248, 308], ["1", 398, 228],
  ["5", 568, 68], ["8", 568, 388], ["2", 738, 228],
] as const;
for (const [weight, x, y] of weights) {
  circle(weight)
    .position({ x, y })
    .width(44)
    .height(44)
    .padding(0)
    .fill("#fffaf2")
    .stroke("#d8c3a5")
    .size(18);
}

rect("The orange edges form the shortest-path tree from A.")
  .position({ x: 900, y: 170 })
  .width(260)
  .height(160)
  .fill("#fffaf2")
  .stroke("#e3d3bd")
  .radius(16)
  .size(20);

slide("The algorithm").split("48:52");
steps(
  "Set every distance to ∞, the source to 0",
  "Take the closest node not yet settled",
  "Relax each edge leaving it",
  "Repeat until every node is settled",
);

right();
code(`const dist = new Map([[source, 0]]);
const queue = new MinHeap([[0, source]]);

while (queue.size > 0) {
  const [d, u] = queue.pop();
  if (d > dist.get(u)) continue;
  for (const [v, w] of graph.edges(u)) {
    if (d + w < (dist.get(v) ?? Infinity)) {
      dist.set(v, d + w);
      queue.push([d + w, v]);
    }
  }
}`, "ts");

slide("What it costs").grid(3);
cell(0);
metric("O(E log V)", "With a binary heap");
cell(1);
metric("O(V²)", "With a plain array");
cell(2);
metric("w ≥ 0", "Required of every edge");

slide("Takeaways").center();
text("Settle the closest node first, and every distance is final the moment it is settled.").lead();
text("Negative weights break that promise: use Bellman–Ford instead.").caption();
