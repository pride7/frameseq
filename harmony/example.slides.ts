presentation({ title: "FrameSeq · 鸿蒙电脑", theme: "minimal-academic", author: "FrameSeq" });

slide("在鸿蒙电脑上制作演示文稿").split("55:45");
text("代码和画布，一起编辑").hero();
text("双击文字进行编辑，拖动对象调整布局。保存后，预览会随文件更新。").lead();
right();
shape("rounded", "你好，鸿蒙！").tone("accent").width(360).height(200);

slide("同一份源文件");
chart("bar", { "打开": 1, "编辑": 2, "保存": 3, "放映": 4 }).unit(" 步");
note("这份文件可以在其他平台的 FrameSeq 中继续编辑。");
