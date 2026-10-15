presentation({
  title: "Atlas 2.0",
  subtitle: "Maps that load before you blink",
  author: "Product review · Q4",
  theme: "blank",
});

master("content");
rect().position({ x: 0, y: 0 }).width(1280).height(8)
  .fill("#0d9488").radius(0);
placeholder("title").position({ x: 72, y: 40 })
  .width(1000).height(84).color("#0f172a").size(40);
placeholder().position({ x: 72, y: 136 }).width(1136).height(500);
text("{title} · {page} / {total}").position({ x: 72, y: 668 })
  .width(1136).textAlign("right").caption();

master("cover").background("#0f172a");
rect().position({ x: 0, y: 0 }).width(12).height(720)
  .fill("#2dd4bf").radius(0);
circle().position({ x: 860, y: 150 }).width(420)
  .fill("#134e4a").stroke("#134e4a");
circle().position({ x: 960, y: 250 }).width(220)
  .fill("#115e59").stroke("#115e59");
icon("map-pinned").position({ x: 1010, y: 296 })
  .size(120).color("#5eead4");
placeholder("title").position({ x: 96, y: 210 })
  .width(900).height(150).color("#ffffff").size(96).textAlign("left");
placeholder("subtitle").position({ x: 96, y: 372 })
  .width(760).height(70).color("#99f6e4").size(32).textAlign("left");
placeholder("author").position({ x: 96, y: 590 })
  .width(900).height(50).color("#94a3b8").textAlign("left");

slide({ name: "Cover" }).cover()
  .notes("Welcome everyone. Twenty minutes, then questions.");
text("Atlas 2.0").hero();
text("Maps that load before you blink").subtitle();
text("Product review · Q4").author();

slide("How a tile request flows").canvas()
  .notes("Most requests never reach the renderer: the cache answers four in five.");
shape("pill", "Request").as("request")
  .position({ x: 0, y: 190 }).width(160).height(84)
  .tone("teal", "solid");
shape("rounded", "Edge gateway").as("gateway")
  .position({ x: 220, y: 172 }).width(190).height(120)
  .tone("blue").shadow();
shape("diamond", "Cached?").as("cached")
  .position({ x: 470, y: 162 }).width(190).height(140)
  .tone("amber");
shape("cylinder", "Tile cache").as("tiles")
  .position({ x: 740, y: 0 }).width(180).height(150)
  .tone("teal").shadow();
shape("rounded", "Vector renderer").as("renderer")
  .position({ x: 730, y: 330 }).width(200).height(120)
  .tone("indigo").shadow();
shape("cloud", "Your users").as("users")
  .position({ x: 976, y: 162 }).width(160).height(140)
  .tone("sky");

line().from("request").to("gateway").arrow();
line().from("gateway").to("cached").arrow();
line().from("cached").to("tiles").route("elbow").arrow()
  .label("yes");
line().from("cached").to("renderer").route("elbow").arrow()
  .label("no");
line().from("tiles").to("users").route("curve").arrow();
line().from("renderer").to("users").route("curve").arrow()
  .dashed();

slide("Faster every release").split("38:62")
  .notes("Median load time, measured on a mid-range phone over 4G.");
text("Median time to first tile fell by two thirds in a year.").lead();
bullets(
  "Vector tiles replaced images",
  "A cache at every edge",
  "Fonts shipped with the app",
);

right();
chart("bar", { "1.0": 840, "1.4": 610, "1.8": 430, "2.0": 280 })
  .unit(" ms")
  .colors("#0d9488");

slide("What it changed").grid(3);
cell(0);
icon("zap").size(44).color("#0d9488");
metric("3×", "Faster first tile");
cell(1);
icon("wifi").size(44).color("#2563eb");
metric("−42%", "Bandwidth per session");
cell(2);
icon("shield-check").size(44).color("#7c3aed");
metric("99.98%", "Uptime this quarter");

slide("What comes next").canvas()
  .notes("Each quarter ships to the web, iOS, and Android together.");
text("Q1").position({ x: 40, y: 150 }).width(200).caption();
text("Q2").position({ x: 315, y: 150 }).width(200).caption();
text("Q3").position({ x: 590, y: 150 }).width(200).caption();
text("Q4").position({ x: 865, y: 150 }).width(200).caption();
shape("chevron", "Offline maps").position({ x: 0, y: 200 })
  .width(300).height(120).tone("teal", "solid");
shape("chevron", "3D buildings").position({ x: 275, y: 200 })
  .width(300).height(120).tone("blue", "solid");
shape("chevron", "Live traffic").position({ x: 550, y: 200 })
  .width(300).height(120).tone("indigo", "solid");
shape("chevron", "Open API").position({ x: 825, y: 200 })
  .width(300).height(120).tone("purple", "solid");
text("One theme a quarter, each shipped to every platform at once.")
  .position({ x: 0, y: 380 }).width(1136).lead();

slide("Questions").center().master(false).background("#0f172a");
text("Thank you").hero().color("#ffffff");
qr("https://pride7.github.io/frameseq/").width(150);
text("Slides made in FrameSeq Studio").caption().color("#94a3b8");
