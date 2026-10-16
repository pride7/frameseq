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
at("panel").panel("(b) Generator").canvas().position({ x: 40, y: 500 }).width(300).height(180);
