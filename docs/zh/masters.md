<!-- translation-of: docs/masters.md sha256:246df64a04e030ca -->

# 母版与模板

母版就是 PowerPoint 里的幻灯片母版:画在每一张使用它的幻灯片后面的对象,加上几个占位符,决定这些幻灯片的标题和正文放在哪里。改了母版,画在它上面的每一页都跟着变。模板则是存起来、用来开始新演示的一份演示,母版和主题都在里面。

## 一个母版

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

`master(name)` 开始一个母版页,之后的对象都属于它,直到下一个 `slide()` 或 `master()`。母版页是一块画布:用 `.position()` 摆放上面的对象。上面这个例子里,每一张内容页都有一条蓝色横条,标题以白字写在横条里,正文在横条下面,页脚写着演示标题和页码。

母版只写一次,通常紧跟在 `presentation()` 后面,幻灯片本身不用改。每一页画在哪个母版上,由这一页自己决定:

- `master("cover")` 画在每一张 `.cover()` 封面后面。
- `master("content")` 画在其余每一页后面。
- 其他名字的母版,比如 `master("section")`,画在用 `slide("Part two").master("section")` 指名要它的页面后面。
- `.master(false)` 让一页不用母版,比如一张满版照片。

如果某一页要的母版在演示里没有定义,会报错,并指出是哪一页。

## 占位符

占位符是母版上的一个框,幻灯片自己的内容放进去。

| 占位符 | 放什么 |
| --- | --- |
| `placeholder()` | 这一页的全部内容,在框里像在页边距里一样排开。 |
| `placeholder("title")` | 这一页的标题;封面上则是它的 `.hero()` 文字。 |
| `placeholder("subtitle")` | 封面的 `.subtitle()` 文字。 |
| `placeholder("author")` | 封面的 `.author()` 文字。 |

标题、副标题、作者占位符上的文字设置,会作用到画在这个母版上的每一页的对应文字:`.size()`、`.color()`、`.weight()`、`.textAlign()` 和 `.lineHeight()`。某一页自己设了的,保留它自己的。`.justify("start")`、`"center"`(默认)或 `"end"` 把文字放在框的顶部、中间或底部。

没有正文占位符时,幻灯片保留主题的页边距。标题占位符会接替主题的标题栏,标题不会出现两次。

## 字段

母版上的文字可以显示演示的信息,以及这一页在其中的位置:

| 字段 | 显示 |
| --- | --- |
| `{title}`、`{subtitle}`、`{author}`、`{institute}`、`{date}` | `presentation()` 里写的内容。 |
| `{page}`、`{total}` | 这一页的页码,以及一共多少页。 |
| `{slide}` | 这一页自己的标题。 |

于是封面可以留空,全部内容都从母版来,就像 `minimal-academic` 的自动标题页那样;只要母版写了 `{title}`,布局检查就不会把它报成空白页。

## 你自己的封面

封面的版式也是一个母版,和其他母版一样:

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

封面只写它要说的话;每部分放在哪、长什么样,由母版决定。母版上的 `.background()` 会铺满画在它上面的每一页。

## 在 FrameSeq Studio 里

**视图 › 幻灯片母版** 让缩略图栏和预览显示母版页而不是幻灯片,上方会有一条提示,并带着返回的按钮。母版页的编辑方式和幻灯片一样:拖动、缩放上面的对象和占位符,在 **当前母版** 里设置颜色和字体,从 **插入** 添加图片、形状和文字;其中 **占位符** 一组用来添加放幻灯片标题、副标题、作者或正文的框。

缩略图栏的 **+** 添加封面母版、内容页母版,或者一个自己命名的母版。新母版从主题原本摆放内容的位置开始,所以在改动母版之前,幻灯片看起来和原来一样。

封面母版和封面像在 PowerPoint 里一样分工:母版里的占位符决定封面的标题、副标题和作者放在哪里、长什么样,封面决定它们写的是什么。回到幻灯片,封面上的文字直接在封面上修改,不论它是用 `.hero()` 之类写在这一页上,还是像 `minimal-academic` 那样取自 `presentation()`;见[封面信息](studio.md#封面信息)。

回到幻灯片时,**幻灯片 › 母版** 选择预览中这一页画在哪个母版上:它默认的母版、某个指定的母版,或者不用母版。那里和缩略图栏右键菜单里的 **编辑母版** 会打开这一页的母版。

## 导出

PDF 打印每一页时都带着它的母版。PowerPoint 把每个母版的对象画在每一张使用它的幻灯片上,压在这一页自己的内容下面,都是可以编辑的普通形状;母版的背景色成为这一页的背景色。Typst 在每一页放上母版的对象,并把这一页的内容排进它的占位符。

## 你自己的模板

模板就是存放在模板文件夹里的一份演示。默认是“文档”里的 `FrameSeq/Templates`;Studio 的新建演示对话框可以把它改到任意文件夹,环境变量 `FRAMESEQ_TEMPLATES` 则为每次运行指定一个文件夹。

- **文件 › 另存为模板…** 把当前打开的演示存成模板,默认以它的标题命名,也可以另起名字。如果幻灯片用到了旁边的文件,比如徽标或参考文献,模板就是一个文件夹,里面放着这份演示和这些文件。
- **文件 › 新建演示…** 在 **我的模板** 下列出你的模板,每个都显示封面。新演示用对话框里写的标题,既替换 `presentation()` 里的标题,也替换所有和模板标题一字不差的字符串,比如封面的大标题。文件夹模板里的文件会复制到新演示旁边,不会覆盖已有的文件。
- 右键点你的模板,可以 **编辑模板**(像打开任何演示一样打开它,母版视图也能用)、在文件夹中显示,或者删除。
- 右键点 FrameSeq 自带的模板,可以在你的模板里存一份副本,再随意修改这份副本。
- **文件 › 打开模板文件夹** 打开这个文件夹,模板也可以像普通文件一样在这里复制、改名或分享。

在命令行里,把模板名写在 `--template` 后面:

```bash
frameseq new weekly-sync.slides.ts --template "Group meeting"
```

新演示以文件名为标题,这里是 *weekly sync*。如果你的模板和 FrameSeq 自带的模板同名,用的是自带的那个。
