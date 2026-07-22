presentation({
  title: "Empty slide fixture",
  theme: "midnight",
});

slide({ name: "Accidental blank" }).cover();

slide({ name: "Intentional blank" }).allowEmpty();

slide({ name: "Intentional blank option", allowEmpty: true });
