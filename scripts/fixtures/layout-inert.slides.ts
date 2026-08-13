presentation({ title: "Inert modifiers", theme: "blank" });

// A block container does not place its children, so what they ask of it is ignored.
slide("Ignored by the container");
at("panel").stack();
text("Aligns itself for nothing").width(280).centerSelf();
text("Grows for nothing").width(280).grow();

// A leaf object has no children to arrange, so what it asks for itself is ignored.
slide("Ignored by the object");
text("Arranges nothing").width(280).align("center");
text("Spaces nothing").width(280).gap(20);

// The same modifiers in a real row, where every one of them means something.
slide("Honoured");
at("row").row().gap(16, 32).align("center").justify("space-evenly").width(720).height(200);
text("First").width(160).selfAlign("end");
text("Second").width(160).grow();
