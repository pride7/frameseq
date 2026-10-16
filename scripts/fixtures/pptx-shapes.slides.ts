presentation({ title: "PPTX shapes fixture" });

slide("Diagram shapes").canvas();
shape("diamond", "Cached?").as("cached").position({ x: 80, y: 40 }).tone("amber");
shape("cylinder", "Store").as("store").position({ x: 760, y: 300 }).tone("purple", "solid").shadow();
shape("cloud", "Internet").as("net").position({ x: 80, y: 320 }).dashed();
shape("pill", "Start").as("start").position({ x: 420, y: 40 }).tone("green", "solid");
polygon([[0, 0], [60, 45], [60, 155], [0, 200]], "Encoder").as("encoder").position({ x: 440, y: 420 }).tone("teal");
rect().position({ x: 1100, y: 40 }).width(30).height(30).stroke("#d97706").dashed();
junction().as("split").position({ x: 1000, y: 600 });
line().from("encoder").via("split", [1150, 600]).to("store").stroke("#123456").arrow();
line().from("cached").to("store").route("elbow").arrow().label("yes");
line().from("net").to("store").route("curve").arrow().dashed();
line().from("cached").to("start").arrow();
cells([0.1, 1]).tone("#123abc").cell(40).position({ x: 900, y: 40 });
rect("$x^2$").position({ x: 960, y: 120 }).width(80).height(50);
text("Revenue **grew** [42%]{red}").position({ x: 760, y: 560 }).width(320);
rect("*Fast* path").position({ x: 1100, y: 120 }).width(140).height(50);
at("panel").panel("(b) Generator").canvas().position({ x: 40, y: 500 }).width(300).height(180);
