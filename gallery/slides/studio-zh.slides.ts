presentation({
  title: "Atlas 2.0",
  subtitle: "眨眼之间，地图已就绪",
  author: "产品评审 · 第四季度",
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

slide({ name: "封面" }).cover()
  .notes("欢迎大家。先讲二十分钟，之后留时间提问。");
text("Atlas 2.0").hero();
text("眨眼之间，地图已就绪").subtitle();
text("产品评审 · 第四季度").author();

slide("一次瓦片请求的旅程").canvas()
  .notes("大多数请求根本到不了渲染器：五次里有四次由缓存直接返回。");
shape("pill", "请求").as("request")
  .position({ x: 0, y: 190 }).width(160).height(84)
  .tone("teal", "solid");
shape("rounded", "边缘网关").as("gateway")
  .position({ x: 220, y: 172 }).width(190).height(120)
  .tone("blue").shadow();
shape("diamond", "已缓存？").as("cached")
  .position({ x: 455, y: 157 }).width(230).height(150)
  .tone("amber");
shape("cylinder", "瓦片缓存").as("tiles")
  .position({ x: 740, y: 0 }).width(180).height(150)
  .tone("teal").shadow();
shape("rounded", "矢量渲染器").as("renderer")
  .position({ x: 730, y: 330 }).width(200).height(120)
  .tone("indigo").shadow();
shape("cloud", "你的用户").as("users")
  .position({ x: 976, y: 162 }).width(160).height(140)
  .tone("sky");

line().from("request").to("gateway").arrow();
line().from("gateway").to("cached").arrow();
line().from("cached").to("tiles").route("elbow").arrow()
  .label("是");
line().from("cached").to("renderer").route("elbow").arrow()
  .label("否");
line().from("tiles").to("users").route("curve").arrow();
line().from("renderer").to("users").route("curve").arrow()
  .dashed();

slide("每个版本都更快").split("38:62")
  .notes("中位加载时间，在中端手机、4G 网络下测得。");
text("一年里，首块瓦片的中位加载时间降低了三分之二。").lead();
bullets(
  "矢量瓦片取代了图片",
  "每个边缘节点都有缓存",
  "字体随应用一起分发",
);

right();
chart("bar", { "1.0": 840, "1.4": 610, "1.8": 430, "2.0": 280 })
  .unit(" ms")
  .colors("#0d9488");

slide("带来的变化").grid(3);
cell(0);
icon("zap").size(44).color("#0d9488");
metric("3×", "首块瓦片提速");
cell(1);
icon("wifi").size(44).color("#2563eb");
metric("−42%", "每次会话的流量");
cell(2);
icon("shield-check").size(44).color("#7c3aed");
metric("99.98%", "本季度可用率");

slide("下一步").canvas()
  .notes("每个季度都同时发布到网页、iOS 和 Android。");
text("Q1").position({ x: 40, y: 150 }).width(200).caption();
text("Q2").position({ x: 315, y: 150 }).width(200).caption();
text("Q3").position({ x: 590, y: 150 }).width(200).caption();
text("Q4").position({ x: 865, y: 150 }).width(200).caption();
shape("chevron", "离线地图").position({ x: 0, y: 200 })
  .width(300).height(120).tone("teal", "solid");
shape("chevron", "3D 建筑").position({ x: 275, y: 200 })
  .width(300).height(120).tone("blue", "solid");
shape("chevron", "实时路况").position({ x: 550, y: 200 })
  .width(300).height(120).tone("indigo", "solid");
shape("chevron", "开放 API").position({ x: 825, y: 200 })
  .width(300).height(120).tone("purple", "solid");
text("每季度一个主题，同步发布到所有平台。")
  .position({ x: 0, y: 380 }).width(1136).lead();

slide("问答").center().master(false).background("#0f172a");
text("谢谢").hero().color("#ffffff");
qr("https://pride7.github.io/frameseq/zh/").width(150);
text("幻灯片由 FrameSeq Studio 制作").caption().color("#94a3b8");
