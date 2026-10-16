figure({ title: "Method", width: 1600, height: 800 });

at("encoder").panel("(a) Encoder").canvas().position({ x: 20, y: 20 }).width(760).height(760);
shape("rounded", "Attention").as("attention").position({ x: 200, y: 300 }).width(240).height(60).tone("gray");
text("A label too small to read").position({ x: 200, y: 400 }).size(14);
text("A label that reads").position({ x: 200, y: 450 }).size(24);
