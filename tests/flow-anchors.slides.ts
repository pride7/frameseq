presentation({ title: "Flow anchors", theme: "blank" });

// A row lays its children out automatically; no object carries coordinates.
slide("Row").canvas();

at("stages").row().gap(80).position({ x: 80, y: 200 });
rect("Parse").as("parse");
rect("Build").as("build");
rect("Render").as("render");
line().from("parse").to("build").arrow("end");
line().from("build").to("render").arrow("end");

// A column with centred cross-axis alignment and different widths.
slide("Column").canvas();

at("column").column().gap(40).align("center").position({ x: 200, y: 120 });
rect("Wide").as("wide").width(320).height(80);
rect("Narrow").as("narrow").width(160).height(80);
line().from("wide").to("narrow").arrow("end");

// The default stretch makes a child without its own height fill the line.
slide("Stretch").canvas();

at("stretch").row().gap(40).position({ x: 100, y: 150 });
rect("Tall").as("tall").height(160);
rect("Auto").as("auto");
line().from("tall").to("auto").arrow("end");

// The group anchors itself to the slide, so nothing needs a coordinate at all.
slide("Anchored").canvas();

at("diagram").row().gap(60).anchor("center");
rect("A").as("a").width(200).height(90);
rect("B").as("b").width(200).height(90);
line().from("a").to("b").arrow("end");

// An explicit main size distributes the free space.
slide("Distributed").canvas();

at("spread").row().gap(0).width(900).justify("space-between").position({ x: 100, y: 300 });
rect("Left").as("left").width(180).height(90);
rect("Middle").as("middle").width(180).height(90);
rect("Right").as("right").width(180).height(90);
line().from("left").to("middle").arrow("end");
line().from("middle").to("right").arrow("end");

// Nested rows inside a column build a two-dimensional arrangement.
slide("Matrix").canvas();

at("matrix").column().gap(30).position({ x: 120, y: 120 });
at("matrix/top").row().gap(24);
rect("A1").as("a1").width(160).height(100);
rect("B1").as("b1").width(160).height(100);
at("matrix/bottom").row().gap(24);
rect("C1").as("c1").width(160).height(100);
rect("D1").as("d1").width(160).height(100);

at("matrix");
line().from("a1").to("c1").arrow("end");
line().from("b1").to("d1").arrow("end");

// Columns inside a row, where the shorter column stretches to the tallest one.
slide("Columns").canvas();

at("cols").row().gap(48).position({ x: 100, y: 120 });
at("cols/left").column().gap(16);
rect("L1").as("l1").width(140).height(100);
rect("L2").as("l2").width(140).height(100);
at("cols/right").column().gap(16);
rect("R1").as("r1").width(140).height(100);

at("cols");
line().from("l1").to("r1").arrow("end");
