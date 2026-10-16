# Masters and templates

A master is what PowerPoint calls a slide master: objects drawn behind every slide that uses it, and placeholders that say where those slides put their title and content. Change the master, and every slide drawn on it changes with it. A template is a presentation kept to start new ones from, masters and theme included.

## A master

```ts
presentation({ title: "Diffusion Language Models", author: "Ada Lovelace", date: "2026" });

master("content");
rect().position({ x: 0, y: 0 }).width(1280).height(96).fill("#1e3a8a").radius(0);
placeholder("title").position({ x: 60, y: 0 }).width(1160).height(96).color("#ffffff").size(36);
placeholder().position({ x: 60, y: 130 }).width(1160).height(520);
text("{title} · {page} / {total}").position({ x: 60, y: 676 }).width(1160).textAlign("right").caption();

slide("Motivation");
text("Autoregressive models write one token at a time.").lead();
bullets("Latency grows with length", "Errors compound");
```

`master(name)` starts a master page, and the objects after it belong to it until the next `slide()` or `master()`. A master page is a canvas: place its objects with `.position()`. Here every content slide gets a blue band with its title in white, its content below the band, and a footer with the presentation's title and the page number.

A master is written once, usually right after `presentation()`, and the slides do not change. Which master a slide is drawn on follows from the slide:

- `master("cover")` is drawn behind every `.cover()` slide.
- `master("content")` is drawn behind every other slide.
- A master of any other name, such as `master("section")`, is drawn behind the slides that ask for it with `slide("Part two").master("section")`.
- `.master(false)` draws a slide on no master, as a full-bleed photograph needs.

A slide that asks for a master the presentation does not define is an error that names the slide.

## Placeholders

A placeholder is a box on the master that a slide's own content goes into.

| Placeholder | What it holds |
| --- | --- |
| `placeholder()` | Everything the slide holds, which flows inside the box as it would in the slide's margins. |
| `placeholder("title")` | The slide's title; on a cover, its `.hero()` text. |
| `placeholder("subtitle")` | A cover's `.subtitle()` text. |
| `placeholder("author")` | A cover's `.author()` text. |

Text settings on a title, subtitle, or author placeholder style that text on every slide drawn on the master: `.size()`, `.color()`, `.weight()`, `.textAlign()`, and `.lineHeight()`. A slide that sets one itself keeps its own. `.justify("start")`, `"center"` (the default), or `"end"` puts the text at the top, the middle, or the foot of its box.

Without a body placeholder, a slide keeps the theme's margins. A title placeholder takes over from a theme's title bar, so the title is not shown twice.

## Fields

Text on a master can show the presentation's details and the slide's place in it:

| Field | Shows |
| --- | --- |
| `{title}`, `{subtitle}`, `{author}`, `{institute}`, `{date}` | What `presentation()` says. |
| `{page}`, `{total}` | The slide's number, and how many slides there are. |
| `{slide}` | The slide's own title. |

A cover can then be left empty and take everything from its master, as the automatic title page of `minimal-academic` does; the layout check does not report it as empty when its master writes `{title}`.

## A cover of your own

The cover's layout is a master like any other:

```ts
master("cover").background("#f8fafc");
rect().position({ x: 0, y: 0 }).width(420).height(720).fill("#1e3a8a").radius(0);
image(new URL("./images/logo.png", import.meta.url).href).position({ x: 56, y: 56 }).width(120);
text("{institute}").position({ x: 56, y: 600 }).width(320).color("#ffffff").caption();
placeholder("title").position({ x: 500, y: 180 }).width(700).height(220).color("#1e3a8a").size(60);
placeholder("subtitle").position({ x: 500, y: 410 }).width(700).height(70);
placeholder("author").position({ x: 500, y: 560 }).width(700).height(60).justify("end");

slide().cover();
text("Diffusion Language Models").hero();
text("Writing every token at once").subtitle();
text("Ada Lovelace").author();
```

The cover writes only what it says; the master decides where each part goes and how it looks. `.background()` on a master paints the whole page of every slide drawn on it.

## In FrameSeq Studio

**View › Slide master** shows the master pages in the rail and the preview in place of the slides, and a bar above them says so, with the way back. A master page is edited the way a slide is: drag and resize its objects and placeholders, set their colours and type in **Current master**, and add pictures, shapes, and text from **Insert**, where **Placeholders** adds a box for the slides' title, subtitle, author, or content.

The rail's **+** adds the cover master, the content master, or another master by name. Each starts where the theme already puts things, so the slides look the same until the master is changed.

The cover master and the cover share the work as in PowerPoint: the master's placeholders decide where the cover's title, subtitle, and author go and how they look, and the cover says what they are. On the slides, a cover's words are typed on the cover itself, whether it writes them with `.hero()` and the like or takes them from `presentation()`, as `minimal-academic` does; see [Cover details](studio.md#cover-details).

With the slides showing, **Slide › Master** chooses the master the slide in the preview is drawn on: its usual one, another by name, or none. **Edit the master**, there and in the rail's right-click menu, opens the slide's master.

## Export

PDF prints every slide with its master. PowerPoint draws each master's objects on every slide that uses it, behind the slide's own, as ordinary editable shapes, and a master's background colour becomes the slide's. Typst places the master's objects on each page and sets the slide's content inside its placeholders.

## Templates of your own

A template is a presentation kept in your templates folder. By default that is `FrameSeq/Templates` in Documents; the Studio's new-presentation dialog can move it to any folder, and the `FRAMESEQ_TEMPLATES` environment variable names one for every run.

- **File › Save as template…** keeps the open presentation as a template, named after its title unless you name it otherwise. When the slides name files beside them, such as a logo or a bibliography, the template is a folder holding the presentation and those files.
- **File › New presentation…** shows your templates under **My templates**, each with its cover. The new presentation takes the title written in the dialog, both in `presentation()` and in every string written exactly as the template's title, such as the cover's hero text. The files a folder template holds are copied beside it, never over a file already there.
- Right-click one of your templates to **Edit** it, which opens it as any presentation opens, master view included; to show it in its folder; or to delete it.
- Right-click a template FrameSeq ships to keep a copy among your own, and change that copy as you like.
- **File › Open templates folder** shows the folder, where templates can also be copied, renamed, or shared like any other file.

On the command line, name your template after `--template`:

```bash
frameseq new weekly-sync.slides.ts --template "Group meeting"
```

The new presentation is titled after its file name, here *weekly sync*. A template FrameSeq ships wins over one of yours with the same name.
