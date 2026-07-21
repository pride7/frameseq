presentation("Layout check fixture");

slide("Broken layout").canvas();
text("Outside the canvas")
  .position({ x: 1200, y: 80 })
  .width(220)
  .size(24);
code(`const first = "This code box is intentionally too short";
const second = "The second line must be clipped";`)
  .position({ x: 80, y: 220 })
  .width(440)
  .height(34)
  .style({ overflow: "hidden" });
text("Tiny text")
  .position({ x: 80, y: 360 })
  .size(10);
