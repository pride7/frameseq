presentation({
  title: "Diffusion Language Models",
  subtitle: "Writing every token at once",
  author: "Ada Lovelace",
  institute: "University of Cambridge",
  date: "2026",
});

master("cover").background("#f8fafc");
rect().position({ x: 0, y: 0 }).width(420).height(720).fill("#1e3a8a");
text("{institute}").position({ x: 56, y: 600 }).width(320).color("#ffffff").caption();
placeholder("title").position({ x: 500, y: 180 }).width(700).height(220).color("#1e3a8a").size(60);
placeholder("subtitle").position({ x: 500, y: 410 }).width(700).height(70);
placeholder("author").position({ x: 500, y: 560 }).width(700).height(60).justify("end");

master("content");
rect().position({ x: 0, y: 0 }).width(1280).height(96).fill("#1e3a8a");
placeholder("title").position({ x: 60, y: 0 }).width(1160).height(96).color("#ffffff").size(36);
placeholder().position({ x: 60, y: 130 }).width(1160).height(520);
text("{title} · {page} / {total}").position({ x: 60, y: 676 }).width(1160).textAlign("right").caption();

master("section").background("#1e3a8a");
placeholder("title").position({ x: 120, y: 260 }).width(1040).height(200).color("#ffffff").size(64);

slide().cover();
text("Diffusion Language Models").hero();
text("Writing every token at once").subtitle();
text("Ada Lovelace").author();

slide("Motivation");
text("Autoregressive models write one token at a time.").lead();
bullets("Latency grows with length", "Errors compound", "Editing is awkward");

slide("Part two").master("section");

slide({ name: "Plain" }).master(false);
text("No master here.");
