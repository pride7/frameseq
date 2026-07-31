presentation({
  title: "中文排版验证",
  subtitle: "FrameSeq 的东亚文字支持",
  author: "测试用例",
  theme: "minimal-academic",
});

slide({ name: "封面" }).cover();
text("中文排版").hero();
text("同一份源码，四种输出").subtitle();
text("FrameSeq 测试").author();

slide("正文与列表").split("45:55");
text("中文与 English 混排时，拉丁字母仍使用主题字体，汉字回退到 CJK 字族。").lead();
bullets(
  "标题、正文、代码三类字体各自回退",
  "简体、繁體、日本語 都走同一条回退链",
  "导出 PDF 与 PPTX 时字形不应变成空心方框",
);
note("确认这一页的汉字没有变成豆腐块。");

right();
code(`slide("架构");
text("编译流程").lead();`, "ts");
text`行内公式也要能和中文并排：$E = mc^2$。`;

slide("图示").canvas();

rect("解析").as("parse").position({ x: 120, y: 200 }).width(200).height(110);
rect("构建").as("build").rightOf("parse", 120);
circle("输出").as("render").rightOf("build", 120);

line().from("parse").to("build").arrow("end");
line().from("build").to("render").arrow("end");
text("三个阶段可以独立替换").caption().below("parse", 24);
