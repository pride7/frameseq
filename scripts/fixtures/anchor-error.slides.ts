presentation("Anchor error fixture");

slide("Diagram").canvas();
rect("Encoder").as("encoder").position({ x: 80, y: 120 });
line().from("encoder").to("decoder").arrow("end");
